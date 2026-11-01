// P2-TEMP：P3 可推翻
//
// 唯一新增对外方法（签名与 README「临时扩展」节逐字一致）:
//   p2temp/session.createWithConnectors({connectors: string[], agentPreset?: string, cwd?: string}) → {sessionId}
//
// 内部 = 注册临时 preset + session/create（PLAN T-03③）：
//   1. 对每个 connector（已安装、未启用的 dsh bundle 名），读
//      $profile/node_modules/<bundle>/ 下 package.json 的 dsh.bundle.patch，
//      JSON.parse 出 insert 行（T-03 的 fixture bundle patch 是 JSON，见
//      tests/market/support.ts；非 JSON patch 不在本临时接口范围内）。
//   2. 取基础 preset（agentPreset，默认 standard）的插件行，追加连接器行，
//      注册一次性 preset（id 带 p2temp- 前缀与随机后缀）。
//   3. 调 sessionController.create({cwd, agentPreset: 临时 id})。
// 不做的事（PLAN 禁止清单）：不自建安装器（安装走 pluginManager.installBundle）、
// 不持久化任何状态、不做跨 session 调度、不支持对已开聊 session 热启用。
//
// 依赖解析：本文件经 file:// 从 app/sdk/src/p2temp/ 加载，裸包名只能解析
// app/sdk 的直接依赖；cordis / dsh-typert-protocol 不在其列，故从一个稳定
// 直接依赖（dsh-plugin-market）的真实路径 createRequire 解析——pnpm 的 peer
// store 保证与 dsh 运行时同一实例（T-03 spike 实测，见 commit 正文）。
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(
  realpathSync(fileURLToPath(new URL('../../node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js', import.meta.url))),
)
const { TypertRemoteService } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')))

/** Marker property the gateway's SRC discovery reads (what @Remote writes). */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'
const REMOTE_MARKER = Object.freeze({
  version: 1,
  methods: Object.freeze([
    Object.freeze({
      method: 'createWithConnectors',
      exportName: 'session.createWithConnectors',
      invocation: Object.freeze({ kind: 'direct' }),
    }),
  ]),
})

/** 校验 createWithConnectors 的 connectors 入参；返回归一化后的数组。 */
export function normalizeConnectors(connectors) {
  if (!Array.isArray(connectors) || connectors.length === 0) {
    throw new Error('p2temp: connectors must be a non-empty array of bundle names')
  }
  for (const name of connectors) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('p2temp: connectors must be a non-empty array of bundle names')
    }
  }
  return connectors
}

/** 基础 preset 的插件行。registry 未公开 definitions，此处运行时读取
 *  （P2-TEMP 限定：与 0.2.2-alpha.2 的 AgentPresetRegistry 实现耦合）。 */
export function basePresetRows(registry, agentPreset) {
  const record = registry.definitions?.get(agentPreset)
  if (record === undefined) throw new Error(`p2temp: unknown agentPreset ${JSON.stringify(agentPreset)}`)
  return record.config.plugins
}

/**
 * Convert inserted filesystem paths to file URLs, anchoring relative paths
 * beside the patch file; keep bare package names literal. Mirrors upstream
 * anchorInsertedPluginNames (repos/deepseek-harness packages/boot/app-boot
 * src/index.ts:546-557) so connector patches resolve identically here and
 * through the normal dsh enable path; recurses into nested group rows.
 */
function anchorInsertedPluginNames(rows, patchFile) {
  const base = dirname(resolve(patchFile))
  const visit = (entry) => {
    if (typeof entry.name === 'string' && (isAbsolute(entry.name) || entry.name.startsWith('./') || entry.name.startsWith('../'))) {
      entry.name = pathToFileURL(resolve(base, entry.name)).href
    }
    if (entry.group && Array.isArray(entry.config)) entry.config.forEach(visit)
  }
  for (const row of rows) visit(row)
  return rows
}

/** 读一个已安装连接器 bundle 的 insert 行（patch 内容须为 JSON）。 */
export async function readConnectorRows(profileDir, name) {
  const dir = join(profileDir, 'node_modules', name)
  let manifest
  try {
    manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  } catch {
    throw new Error(`p2temp: connector ${JSON.stringify(name)} is not installed under the profile`)
  }
  const patchRel = manifest?.dsh?.bundle?.patch
  if (typeof patchRel !== 'string') {
    throw new Error(`p2temp: connector ${JSON.stringify(name)} declares no dsh.bundle.patch`)
  }
  const patchFile = join(dir, patchRel)
  let patch
  try {
    patch = JSON.parse(await readFile(patchFile, 'utf8'))
  } catch (error) {
    throw new Error(`p2temp: connector ${JSON.stringify(name)} patch is not JSON (T-03 scope): ${error.message}`)
  }
  const rows = patch.flatMap((row) => row.insert ?? [])
  if (rows.length === 0) throw new Error(`p2temp: connector ${JSON.stringify(name)} patch inserts nothing`)
  return anchorInsertedPluginNames(rows, patchFile)
}

class P2TempService extends TypertRemoteService {
  static inject = ['agentPresets', 'sessionController', 'profileContext']

  constructor(ctx, config) {
    super(ctx, 'p2temp')
    this.config = config
    this.tempPresets = 0
  }

  /**
   * p2temp/session.createWithConnectors — 临时 preset + session/create。
   * @param { {connectors: string[], agentPreset?: string, cwd?: string} } request
   * @returns {Promise<{sessionId: string}>}
   */
  async createWithConnectors(request) {
    const { connectors, agentPreset = 'standard', cwd } = request ?? {}
    normalizeConnectors(connectors)
    const profileDir = this.ctx.get('profileContext')?.dir
    if (typeof profileDir !== 'string') throw new Error('p2temp: no profile context')

    const rows = [...basePresetRows(this.ctx.agentPresets, agentPreset)]
    for (const name of connectors) rows.push(...(await readConnectorRows(profileDir, name)))

    const tempId = `p2temp-${++this.tempPresets}-${Math.random().toString(16).slice(2, 8)}`
    await this.ctx.agentPresets.register({ id: tempId, plugins: rows })
    // ponytail: 临时 preset 注册后不注销；session 的 Agent 持有该 revision，
    // P2 生命周期内数量个位数，P3 换正式接口时一并推翻。
    const value = await this.ctx.sessionController.create({ cwd, agentPreset: tempId })
    return { sessionId: value.sessionId }
  }
}

Object.defineProperty(P2TempService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: REMOTE_MARKER,
})

export default P2TempService
