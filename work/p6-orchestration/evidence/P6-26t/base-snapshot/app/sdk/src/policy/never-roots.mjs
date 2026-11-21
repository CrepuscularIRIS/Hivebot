// P5-01（决策 6）：凭证根单一清单 —— 代码常量 + computeRoots 运行时根。
// 消费者：src/start.ts#writeRuntimePatch（sandbox 行 → wrapper argv）；P5-02 起
// guard.mjs（文件工具 NEVER）复用同一份清单：清单补一条 = 两边同时生效。
// 清单来源：PLAN 决策 13 ① v1 类别 + 本机扫描 evidence/P5-01/host-cred-paths.md
// （2026-11-03，只 ls -d / stat，不读内容）。私用不分发。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'

/** 决策 13 ① 的 v1 凭证类别（相对每个 HOME；含 `*` 的是通配项，guard 侧做匹配，wrapper 侧展开成实体）。 */
export const CREDENTIAL_HOME_ENTRIES = [
  '.ssh', '.gnupg', '.aws', '.kube', '.docker/config.json', '.netrc', '.git-credentials',
  '.pypirc', '.npmrc', '.config/gh', '.config/**/credentials*', '.grokbot', '.claude*',
]

/** 工具链白名单（相对 passwd home；不存在的跳过）与白名单目录内的凭证文件（v2.1，宿主实存 24/22 字节）。 */
export const TOOLCHAIN_DIRS = ['miniconda3', '.local/bin', '.npm-global']
export const TOOLCHAIN_CREDENTIALS = ['miniconda3/.condarc', 'miniconda3/etc/aau_token']

/** HOME 外凭证形路径（宿主扫描 2026-11-03：/etc/ppp 拨号凭证两件）。 */
export const HOME_OUTSIDE_NEVER = ['/etc/ppp/chap-secrets', '/etc/ppp/pap-secrets']

/** handoff 前缀（决策 13 ①：宿主 /tmp 下其他实例的 p2sdk-handoff-* 也是硬 NEVER）。 */
const HANDOFF_PREFIX = join(tmpdir(), 'p2sdk-handoff-')

const isDir = (p) => {
  try { return statSync(p).isDirectory() } catch { return false }
}

const dedupe = (xs) => [...new Set(xs)]

/** 展开一个类别项在某 HOME 下的实体路径；含 `*` 的按前缀/受限递归展开，只收存在的。 */
function expandEntry(home, entry) {
  if (!entry.includes('*')) {
    const p = join(home, entry)
    return existsSync(p) ? [p] : []
  }
  // ponytail: 顶层前缀通配（.claude*）+ 受限递归通配（.config/**/credentials*，上限
  // 5000 项防病态树）；未收全时由整棵 HOME 遮蔽与 guard ③ 软遮蔽兜底。
  if (!entry.includes('/**/')) {
    const prefix = entry.replace('*', '')
    let names
    try { names = readdirSync(home) } catch { return [] }
    return names.filter((n) => n.startsWith(prefix)).map((n) => join(home, n)).filter((p) => existsSync(p))
  }
  const [, suffix] = entry.split('/**/')
  const base = join(home, entry.split('/**/')[0])
  const out = []
  const stack = [base]
  let budget = 5000
  while (stack.length > 0 && budget > 0) {
    const dir = stack.pop()
    let names
    try { names = readdirSync(dir) } catch { continue }
    for (const n of names) {
      budget -= 1
      const p = join(dir, n)
      if (isDir(p)) stack.push(p)
      else if (suffix.endsWith('*') && n.startsWith(suffix.replace('*', ''))) out.push(p)
    }
  }
  return out
}

/** 宿主 tmp 下既有 p2sdk-handoff-* 目录（其他实例的 token 交接目录）。
 * ponytail: 只收最近修改的 32 个 —— argv 有界（bwrap 参数上限 9000），测试残留会
 * 无限增长；其余由 workspace-write 的 --tmpfs /tmp 覆盖，read-only 会话里更旧的
 * handoff 仍可见（需要时按 liveness 过滤或换成 tmpfs 下统一布局）。 */
const HANDOFF_SIBLING_CAP = 32
function handoffSiblings() {
  let names
  try { names = readdirSync(tmpdir()) } catch { return [] }
  // P5-H2：单次 stat + 容错。旧实现两遍扫描（isDir 一遍、mtime 一遍），第二遍
  // statSync 无守卫——并发 e2e fork 的 afterAll 在两遍之间 rmSync 掉某个
  // p2sdk-handoff-* 时整个 computeRoots 抛 ENOENT（全量并发下 never-roots 用例
  // 偶发红、单文件恒绿的根因）。目录在 stat 后才消失的由下游 existsSync 过滤兜底。
  const out = []
  for (const n of names) {
    if (!n.startsWith('p2sdk-handoff-')) continue
    const p = join(tmpdir(), n)
    try {
      const st = statSync(p)
      if (st.isDirectory()) out.push({ p, m: st.mtimeMs })
    } catch { /* 刚被并发 teardown 删除：跳过 */ }
  }
  return out.sort((a, b) => b.m - a.m).slice(0, HANDOFF_SIBLING_CAP).map((x) => x.p)
}

/** .git 策略根：普通仓是目录；worktree 下是指针文件，解析 gitdir 指向的真实仓库对象库。 */
function gitPolicyRoot(repoRoot) {
  const dotGit = join(repoRoot, '.git')
  try {
    if (statSync(dotGit).isDirectory()) return dotGit
  } catch { return null }
  try {
    const text = readFileSync(dotGit, 'utf8')
    const m = /^gitdir: (.+)$/m.exec(text)
    const dir = m ? resolve(repoRoot, m[1].trim()) : null
    return dir && isDir(dir) ? dir : null
  } catch {
    return null
  }
}

/**
 * 汇总一次启动的全部遮蔽/拒读根。所有清单只收「当前存在」的路径：不存在即无物可遮，
 * 且其父目录只读时沙箱内也造不出来；mask 清单在启动时冻结，启动后新建的 NEVER 文件
 * 依赖目录级遮蔽覆盖（ponytail 上限，guard 侧每次调用重算兜底）。
 *
 * @param cfg.envHome 启动器 $HOME（测试 HOME）
 * @param cfg.passwdHome os.userInfo().homedir（工具链与遮蔽清单同源，决策 4）
 * @param cfg.home DSH_HOME（运行时根，永不缺失）
 * @param cfg.handoff 凭证交接目录
 * @param cfg.dataDirs 决策 15 的数据根（PBOTS_DATA_DIR 或缺省布局）
 * @param cfg.extraMaskRoots P2SDK_SANDBOX_MASK 追加根
 * @param cfg.pkgRoot app/sdk（策略代码根之一）
 * @param cfg.repoRoot 仓根（缺省由 pkgRoot 推导）
 */
export function computeRoots(cfg) {
  const envHome = cfg.envHome || process.env.HOME || undefined
  const passwdHome = cfg.passwdHome || userInfo().homedir
  const homes = dedupe([envHome, passwdHome]).filter((h) => typeof h === 'string' && existsSync(h))
  const uid = userInfo().uid ?? process.getuid()
  const runUser = `/run/user/${uid}`
  const dataDirs = dedupe(cfg.dataDirs ?? [])
  const extra = dedupe(cfg.extraMaskRoots ?? [])

  const credentialConcrete = []
  for (const h of homes) for (const entry of CREDENTIAL_HOME_ENTRIES) credentialConcrete.push(...expandEntry(h, entry))
  for (const p of passwdHome ? TOOLCHAIN_CREDENTIALS.map((t) => join(passwdHome, t)) : []) {
    if (existsSync(p)) credentialConcrete.push(p)
  }

  const maskRoots = dedupe([
    ...homes,
    ...dataDirs,
    ...extra,
    cfg.home,
    cfg.handoff,
    runUser,
    ...HOME_OUTSIDE_NEVER,
    ...handoffSiblings(),
  ]).filter((p) => existsSync(p))

  const neverRoots = dedupe([
    ...maskRoots,
    ...credentialConcrete,
    ...dataDirs.map((d) => join(d, 'policy-state.json')).filter((p) => existsSync(p)),
    ...dataDirs.map((d) => join(d, 'standing-grants.json')).filter((p) => existsSync(p)),
  ])

  const toolchainDirs = (passwdHome ? TOOLCHAIN_DIRS.map((t) => join(passwdHome, t)) : []).filter((p) => isDir(p))

  const repoRoot = cfg.repoRoot ?? resolve(cfg.pkgRoot, '..', '..')
  const policyRoots = [cfg.pkgRoot, join(repoRoot, '.claude'), gitPolicyRoot(repoRoot)]
    .filter((p) => typeof p === 'string' && isDir(p))

  // P5-02 决策 13 ①/③ 的 guard 侧划分（决策 6 单源的第二个消费者）：
  // hardRoots = 凭证实根 + /proc（整个，v2）+ /run/user + DSH_HOME + handoff（含
  // 宿主 siblings）——读写都拒、例外不越过。/proc 只进 guard：wrapper 侧遮掉
  // /proc 会砸掉沙箱自己的 procfs（bwrap --proc），而文件工具读 /proc/self/
  // environ 正是 decision 13 ① 要堵的洞。dataMaskRoots = maskRoots 排除 HOME
  // 及其子树：HOME 整棵走 ③ 软遮蔽（例外放行生产工作区），非 HOME 数据根的
  // 顶层条目（除 workspaces）由 guard 的 expandTopEntries 展开 ①。
  const guardHardRoots = dedupe([
    ...credentialConcrete,
    '/proc',
    `/run/user/${uid}`,
    cfg.home,
    cfg.handoff,
    ...handoffSiblings(),
    ...HOME_OUTSIDE_NEVER,
    // 决策 16/v2.1：数据根的 policy-state/standing-grants 显式列出（顶层条目
    // 展开只收现存项，这两项无论存在与否都列 —— guard 的 lexical 判定不依赖存在）
    ...dataDirs.flatMap((d) => [join(d, 'policy-state.json'), join(d, 'standing-grants.json')]),
  ]).filter((p) => p === '/proc' || existsSync(p) || dataDirs.some((d) => p === join(d, 'policy-state.json') || p === join(d, 'standing-grants.json')))
  const dataMaskRoots = maskRoots.filter((m) => !homes.some((h) => m === h || m.startsWith(h + '/')))

  return { homes, maskRoots, neverRoots, toolchainDirs, policyRoots, guardRoots: { hardRoots: guardHardRoots, dataMaskRoots } }
}
