// P2-TEMP：P3 可推翻
//
// 唯一新增对外方法（签名与 README「临时扩展」节逐字一致）:
//   p2temp/session.createWithConnectors({connectors: string[], agentPreset: string, cwd?: string}) → {sessionId}
//   p2temp/preset.ensure({agentPreset: string, connectors: string[]}) → {presetId}
// （agentPreset 在 SDK 层必填：缺省解析是 main 的单点职责，CONTRACT §8 第 2 条）
//
// 内部 = 注册临时 preset + session/create（PLAN T-03③）：
//   1. 对每个 connector（已安装、未启用的 dsh bundle 名），读
//      $profile/node_modules/<bundle>/ 下 package.json 的 dsh.bundle.patch，
//      JSON.parse 出 insert 行（T-03 的 fixture bundle patch 是 JSON，见
//      tests/market/support.ts；非 JSON patch 不在本临时接口范围内）。
//   2. 取基础 preset（agentPreset，显式传入）的插件行，追加连接器行，注册
//      preset——id 由内容决定（presetIdOf，CONTRACT §3.1，#4/#21 共用），
//      连接器清单先规范化（去重 + 排序）再用于 id 与注册内容，has-check
//      幂等（已注册且健康才复用）；激活失败（上游只标 broken 不抛错）报
//      p2temp/preset-broken 并注销死记录，同 id 重试走完整路径。
//   3. 调 sessionController.create({cwd, agentPreset: 临时 id})。
// preset.ensure 只做第 1–2 步（T-16 / Q-008=A）：重启恢复用，main 启动时按
// recipes 逐个调用（CONTRACT #21；main 编排属 P4）。
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
import { presetIdOf } from './preset-id.mjs'

const require = createRequire(
  realpathSync(fileURLToPath(new URL('../../node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js', import.meta.url))),
)
const { TypertRemoteService, RemoteError } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')))

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
    Object.freeze({
      method: 'presetEnsure',
      exportName: 'preset.ensure',
      invocation: Object.freeze({ kind: 'direct' }),
    }),
  ]),
})

/** 校验 connectors 入参；返回规范化副本（去重 + 排序，与 presetIdOf 同一
 * 规范化——id 与实际注册的内容必须来自同一份连接器清单，CONTRACT §3.1）。 */
export function normalizeConnectors(connectors) {
  if (!Array.isArray(connectors) || connectors.length === 0) {
    throw new Error('p2temp: connectors must be a non-empty array of bundle names')
  }
  for (const name of connectors) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('p2temp: connectors must be a non-empty array of bundle names')
    }
  }
  return [...new Set(connectors)].sort()
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

/** 结构化连接器失败：code 判别 + details.connector（§8 第 1 条，不毒化其他 preset）。 */
function connectorUnavailable(name, message) {
  return new RemoteError('p2temp/connector-unavailable', message, { connector: name })
}

/** 结构化 broken-preset 失败：上游 register 激活失败不抛错、只标
 * record.broken（agent-preset-registry src/index.ts:97-136），本层负责报错。 */
function presetBroken(id, diagnostic) {
  return new RemoteError('p2temp/preset-broken', `p2temp: preset ${id} failed to activate: ${diagnostic}`, {
    presetId: id,
    diagnostic,
  })
}

/** U-19 R1：合法 bundle 名 = scoped `@scope/name` 或裸 npm 名（npm 小写字符集，段不以 '.' 开头）。
 * 拒绝 ../、@scope/..、绝对路径、多斜杠、反斜杠——它们都会在下方 join(profileDir,'node_modules',name)
 * 拼接处逃出 profile。与 app/ui/main/m1-api/index.ts 的 BUNDLE_NAME_RE 是同一规则（跨包各持一份）。 */
const BUNDLE_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/** 读一个已安装连接器 bundle 的 insert 行（patch 内容须为 JSON）。 */
export async function readConnectorRows(profileDir, name) {
  // U-19 R1：名字形状校验先于一切文件访问（readConnectorRows 是 connectors 名进入
  // 路径拼接的唯一消费点；#4 与 #21 恢复重放都经过这里）。
  if (typeof name !== 'string' || !BUNDLE_NAME_RE.test(name)) {
    throw connectorUnavailable(
      name,
      `p2temp: connector ${JSON.stringify(name)} is not a valid bundle name (npm package name required; no path segments)`,
    )
  }
  const dir = join(profileDir, 'node_modules', name)
  let manifest
  try {
    manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  } catch {
    throw connectorUnavailable(name, `p2temp: connector ${JSON.stringify(name)} is not installed under the profile`)
  }
  const patchRel = manifest?.dsh?.bundle?.patch
  if (typeof patchRel !== 'string') {
    throw connectorUnavailable(name, `p2temp: connector ${JSON.stringify(name)} declares no dsh.bundle.patch`)
  }
  const patchFile = join(dir, patchRel)
  let patch
  try {
    patch = JSON.parse(await readFile(patchFile, 'utf8'))
  } catch (error) {
    throw connectorUnavailable(
      name,
      `p2temp: connector ${JSON.stringify(name)} patch is not JSON (T-03 scope): ${error.message}`,
    )
  }
  const rows = patch.flatMap((row) => row.insert ?? [])
  if (rows.length === 0) {
    throw connectorUnavailable(name, `p2temp: connector ${JSON.stringify(name)} patch inserts nothing`)
  }
  return anchorInsertedPluginNames(rows, patchFile)
}

/** CONTRACT §8 第 2 条：缺省 agentPreset 的解析归 main；SDK 层拒绝缺省。 */
function requireExplicitAgentPreset(agentPreset) {
  if (typeof agentPreset !== 'string' || agentPreset.trim() === '') {
    throw new Error('p2temp: agentPreset must be an explicit preset id (the main layer resolves defaults; CONTRACT §8 item 2)')
  }
}

class P2TempService extends TypertRemoteService {
  static inject = ['agentPresets', 'sessionController', 'profileContext']

  constructor(ctx, config) {
    super(ctx, 'p2temp')
    this.config = config
    /** In-flight registrations by preset id: concurrent same-id callers
     * (createWithConnectors / preset.ensure) share one register attempt. */
    this.inflight = new Map()
  }

  /**
   * p2temp/session.createWithConnectors — 临时 preset + session/create。
   * @param { {connectors: string[], agentPreset: string, cwd?: string} } request
   * @returns {Promise<{sessionId: string}>}
   */
  async createWithConnectors(request) {
    const { connectors, agentPreset, cwd } = request ?? {}
    normalizeConnectors(connectors)
    requireExplicitAgentPreset(agentPreset)
    const presetId = await this.ensurePreset(agentPreset, connectors)
    const value = await this.ctx.sessionController.create({ cwd, agentPreset: presetId })
    return { sessionId: value.sessionId }
  }

  /**
   * p2temp/preset.ensure — 幂等注册临时 preset（CONTRACT #21；main 启动时按
   * recipes 逐个调用，重启后旧 session 的冻结 id 因此重新可解析）。
   * @param { {agentPreset: string, connectors: string[]} } request
   * @returns {Promise<{presetId: string}>}
   */
  async presetEnsure(request) {
    const { agentPreset, connectors } = request ?? {}
    normalizeConnectors(connectors)
    requireExplicitAgentPreset(agentPreset)
    return { presetId: await this.ensurePreset(agentPreset, connectors) }
  }

  /**
   * 内容定 id + 幂等注册（CONTRACT §3.1）：已注册（has-check）直接复用；
   * 同 id 并发调用共享同一条 in-flight 注册（register 只被触达一次，无
   * Duplicate 文案匹配——上游改文案不影响本层）。失败后 in-flight 槽清空、
   * broken 记录被注销（见 registerPreset），重试走完整路径（§8 第 1 条）。
   * connectors 先规范化（去重 + 排序）：id 与注册内容出自同一份清单，
   * 首个脏请求（如 ['a','a']）不得决定共享 id 的实际内容。
   * @returns {Promise<string>} 注册/复用成功的 preset id
   */
  async ensurePreset(agentPreset, connectors) {
    const names = normalizeConnectors(connectors)
    const id = presetIdOf(agentPreset, names)
    const pending = this.inflight.get(id)
    if (pending !== undefined) return pending
    const done = this.registerPreset(agentPreset, names, id)
    this.inflight.set(id, done)
    const clear = () => { if (this.inflight.get(id) === done) this.inflight.delete(id) }
    done.then(clear, clear)
    return done
  }

  /** ensurePreset 的单飞路径：has-check → 组 rows → register → broken 检查。 */
  async registerPreset(agentPreset, connectors, id) {
    const existing = this.ctx.agentPresets.definitions?.get(id)
    if (existing !== undefined) {
      // 健康的已注册 id 直接复用；broken 记录绝不作为成功返回（R2/R4：
      // 上游 register 激活失败只标 record.broken，不抛错）。
      if (existing.broken === undefined) return id
      throw presetBroken(id, existing.broken)
    }
    const profileDir = this.ctx.get('profileContext')?.dir
    if (typeof profileDir !== 'string') throw new Error('p2temp: no profile context')
    const rows = [...basePresetRows(this.ctx.agentPresets, agentPreset)]
    for (const name of connectors) rows.push(...(await readConnectorRows(profileDir, name)))
    // 上游 register 激活失败不抛错（只标 broken）且返回注销器；健康临时
    // preset 注册后不注销（ponytail：session 的 Agent 持有该 revision，
    // P2 生命周期内数量个位数，P3 换正式接口时一并推翻）。
    const unregister = await this.ctx.agentPresets.register({ id, plugins: rows })
    const record = this.ctx.agentPresets.definitions?.get(id)
    if (record?.broken !== undefined) {
      // 注销 broken 记录：该 id 保持可重入，修复连接器后的重试重新走
      // 完整路径（重读 patch + 重新注册），而不是命中 has-check 拿死记录。
      await unregister?.()
      throw presetBroken(id, record.broken)
    }
    return id
  }
}

Object.defineProperty(P2TempService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: REMOTE_MARKER,
})

export default P2TempService
