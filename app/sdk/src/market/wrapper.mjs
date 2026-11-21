// U-25：裸 npm MCP 包 → dsh bundle 动态包装层（P2 市场安装路径）。
//
// 背景（T-19 ②b）：市场 listing 给有 npm 坐标的条目合成 install spec
// （name@version），而 dsh plugin-manager 对装进来的包要求 package.json 声明
// dsh.bundle（packages/boot/plugin-manager src/index.ts:984），裸 MCP server 包
// 没有 → installBundle 终点永远是结构化 not-bundle。上游没有现成的转换机制
// （plugin-market-generator 只索引 isBundle 的包，generate.ts:167；experimental
// plugin-market-bundle 只挂市场 UI），所以这一层在安装时动态生成最小 wrapper
// bundle（T-09 手写 wrapper 的机器化，结构一致）：
//
//   $DSH_HOME/market-wrappers/<segment>/package.json      — dsh.bundle.patch 声明
//   $DSH_HOME/market-wrappers/<segment>/cordis.patch.yml  — JSON patch，insert 一行
//     mcp-client（stdio），command=node，args=[预置包入口, …registry 必需参数]
//
// npm 包本身的供给走「快照内预置」：包是 app/sdk devDependency（setup 装进
// node_modules 并填满 pnpm store），wrapper 直接按绝对路径引用它——生成全程
// 纯本地（$OFFLINE 可绿）。未预置的坐标原样透传给 dsh（在线走 pnpm 正常路
// 径，离线结构化 404——②c 语义不变）；声明了 dsh.bundle 的包不归本层管。
//
// 接线：src/p2temp/index.mjs 在构造时 patch pluginManager.installBundle——市场
// 链（market.yml / market-source.yml）都插入 p2temp，P4 UI 的
// pluginManager/installBundle 透传因此自动过 wrapper。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// U-26：命名规则单点在 wrapper-name.mjs（纯函数、零 node: 依赖，renderer 可直接 import）。
import { wrapperNameOf } from './wrapper-name.mjs'
export { wrapperNameOf }

/** app/sdk 根（本文件在 src/market/ 下）：预置包与 dsh-mcp-client 都从这里解析。 */
export const SDK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 与 fetch-market-fixture.mjs 的 SEMVER 同一口径：精确三段版本（允许 prerelease/build）。 */
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u
/** 与 src/p2temp/index.mjs BUNDLE_NAME_RE 同一 npm 名规则（跨文件各持一份）。 */
const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
/** dsh mcp-client 对 serverName 的约束（mcp-client src/index.ts SERVER_NAME_PATTERN）。 */
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/

/**
 * 只认「精确坐标」name@x.y.z：listing 的 install spec 形状。裸名、tag、range、
 * 本地路径、git、- 开头一律 null（→ 原样透传给 dsh）。
 * @returns {{name: string, version: string} | null}
 */
export function parseExactNpmSpec(spec) {
  if (typeof spec !== 'string' || spec === '' || spec.startsWith('-')) return null
  const at = spec.lastIndexOf('@')
  if (at <= 0) return null // 无版本段，或以 @ 开头却没有 scope（'@1.0.0'）
  const name = spec.slice(0, at)
  const version = spec.slice(at + 1)
  if (!NPM_NAME.test(name) || !SEMVER.test(version)) return null
  return { name, version }
}

/** 包名 → wrapper 目录段（wrapper-name.mjs 的内部函数，本文件多处使用）。 */
const dirSegmentOf = (name) => name.replace(/^@/, '').split('/').map((seg) => seg.replace(/[^a-z0-9-._~]/g, '-')).join('__')

/**
 * 包名 → mcp-client serverName（工具名 mcp__<serverName>__* 的命名空间）：
 * 末段（截到 23 字符）+ '-' + sha256(全名) 前 8 位——确定性、≤32、不同包不撞。
 */
export function serverNameOf(name) {
  const tail = (name.split('/').pop() ?? name).replace(/[^A-Za-z0-9_-]/g, '-')
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 8)
  return `${tail.slice(0, 23)}-${hash}`
}

/**
 * 能装条目的启动配置来源：`picks.json`（条目数据，同仓声明式——每个 bot 的差异在
 * 数据不在代码，T70）。wrapper 按 `name@version` 精确坐标查表透传、不解释；值里
 * 唯一占位符 `{workspace}` 生成时字面替换为该 runtime 的 `$DSH_HOME/workspace`
 * （值随 HOME 走没法写死——这是保留下来的最小 DSH 适配）。不在表里的预置坐标按
 * 零参数零 env 启动；零参数即可用的 stdio server 直接工作，需要参数却没配的包在
 * ENABLE 时以 failOnStartupError 结构化报 preset-broken（安装仍然成功，市场语义
 * 不撒谎）。launch 只出自仓内数据——不经 installBundle wire 传递，第三方 index
 * source 永远不是启动配置的作者（env 注入即本机代码执行）。
 */
const PICKS = JSON.parse(readFileSync(new URL('./picks.json', import.meta.url), 'utf8'))

const PICK_BY_SPEC = Object.fromEntries(PICKS.map((p) => [`${p.name}@${p.version}`, p]))

/** launch 查表 + `{workspace}` 字面替换；查不到 → 零参数零 env（同现行表外包）。 */
function launchOf(spec, workspaceDir) {
  const pick = PICK_BY_SPEC[spec]
  // 函数形式：replacement 是字符串时 $&/$' 等模式会被解释——路径含它们时替换结果错。
  const sub = (v) => v.replaceAll('{workspace}', () => workspaceDir)
  return {
    args: (pick?.launch?.args ?? []).map(sub),
    env: Object.fromEntries(Object.entries(pick?.launch?.env ?? {}).map(([k, v]) => [k, sub(v)])),
  }
}

/** 预置树里的包清单；读不到返回 null。 */
function readManifest(sdkRoot, name) {
  try {
    return JSON.parse(readFileSync(join(sdkRoot, 'node_modules', name, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * 包声明的可执行入口（bin 字段）：字符串直取；映射优先取与包末段/全名同名的
 * 键，否则第一个键（确定性）。返回 null = 没有 bin（无法 stdio 启动）。
 */
function binRelativePath(manifest, name) {
  const bin = manifest?.bin
  if (typeof bin === 'string') return bin
  if (typeof bin !== 'object' || bin === null) return null
  const keys = Object.keys(bin)
  if (keys.length === 0) return null
  const tail = name.split('/').pop()
  return bin[tail] ?? bin[name] ?? bin[keys[0]]
}

/**
 * 为一个「已预置的裸 npm MCP 包」生成 wrapper bundle 并返回其目录。
 * @returns {string | null} wrapper 目录；null = 不满足包装条件（→ 透传）。
 *   决策要素全部本地可判：精确坐标 + 预置版本精确一致 + 未声明 dsh.bundle +
 *   bin 入口存在 + dsh-mcp-client 可解析。生成中任何异常也归 null——透传后
 *   dsh 的 not-bundle 语义原样呈现（U-25 允许的残余路径）。
 */
export function marketWrapperDirFor({ spec, sdkRoot = SDK_ROOT, dshHome }) {
  if (typeof dshHome !== 'string' || dshHome === '') return null
  const parsed = parseExactNpmSpec(spec)
  if (parsed === null) return null
  const manifest = readManifest(sdkRoot, parsed.name)
  if (manifest === null || manifest.version !== parsed.version) return null
  if (manifest.dsh?.bundle !== undefined) return null // 真 dsh bundle：不归本层管
  const binRel = binRelativePath(manifest, parsed.name)
  if (typeof binRel !== 'string' || binRel === '') return null
  let preseedDir
  let entry
  let mcpClientEntry
  try {
    preseedDir = realpathSync(join(sdkRoot, 'node_modules', parsed.name))
    entry = realpathSync(join(preseedDir, binRel))
    mcpClientEntry = realpathSync(join(sdkRoot, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js'))
  } catch {
    return null
  }
  if (!existsSync(entry)) return null
  const wrapperDir = join(dshHome, 'market-wrappers', dirSegmentOf(parsed.name))
  const workspaceDir = join(dshHome, 'workspace')
  const launch = launchOf(`${parsed.name}@${parsed.version}`, workspaceDir)
  try {
    mkdirSync(wrapperDir, { recursive: true })
    // 默认允许目录先建出来：filesystem 类 server 要求它真实存在。
    mkdirSync(workspaceDir, { recursive: true })
    const serverName = serverNameOf(parsed.name)
    writeFileSync(join(wrapperDir, 'package.json'), `${JSON.stringify({
      name: wrapperNameOf(parsed.name),
      version: parsed.version,
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 1)}\n`)
    const mcpRow = {
      id: `market-mcp-${serverName}`,
      // 绝对 specifier：$DSH_HOME profile workspace 没有 node_modules（与 T-03/T-09
      // fixture 同一约定）。
      name: pathToFileURL(mcpClientEntry).href,
      config: {
        serverName,
        transport: 'stdio',
        command: process.execPath,
        args: [entry, ...launch.args],
        env: launch.env,
        cwd: '',
        failOnStartupError: true,
      },
    }
    writeFileSync(join(wrapperDir, 'cordis.patch.yml'), `${JSON.stringify([{ insert: [mcpRow] }])}\n`)
  } catch {
    return null
  }
  return wrapperDir
}

/** 已包装标记（own property，防重复 patch）。 */
const WRAPPED = Symbol.for('p2sdk.marketWrapper.installBundle')

/**
 * 把 pluginManager.installBundle 包一层：可包装的 npm 坐标改走生成的 wrapper
 * 目录，其余 spec 原样透传。gateway 按调用时 Reflect.get(receiver,
 * 'installBundle') 取方法，实例 own property 因此对每个调用方（P4 UI 透传、
 * SDK 测试）都生效。返回恢复函数（删 own property 还原原型方法），重复调用
 * 返回 null。
 * @param {object | undefined} pm pluginManager 服务实例
 * @param {{ dshHome: string }} opts
 * @returns {(() => void) | null}
 */
export function patchPluginManagerInstall(pm, opts) {
  if (pm === null || typeof pm !== 'object' || typeof pm.installBundle !== 'function' || pm[WRAPPED]) return null
  const dshHome = opts?.dshHome
  const original = pm.installBundle
  const wrapped = function installBundleWithMarketWrapper(spec, options) {
    let wrapperDir = null
    try {
      wrapperDir = marketWrapperDirFor({ spec, dshHome })
    } catch {
      wrapperDir = null // 生成失败 → 透传，dsh not-bundle 语义原样
    }
    return original.call(pm, wrapperDir ?? spec, options)
  }
  pm[WRAPPED] = true
  pm.installBundle = wrapped
  return () => {
    if (pm.installBundle === wrapped) {
      delete pm.installBundle
      delete pm[WRAPPED]
    }
  }
}
