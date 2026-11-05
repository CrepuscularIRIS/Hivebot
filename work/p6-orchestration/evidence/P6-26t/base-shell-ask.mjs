// p2sdk 档位策略（T-07/T-12/P5-05 历史见下；P5-21 泛化为查表）。
//
// P5-21（PLAN p5-parity，Q-013 全表确认 2026-11-03）：由「普通 shell 必问」泛化
// 为按 profile/tiers.json 查档位表（REUSE 行：改造现有 shell-ask 为查表）。表是
// 数据（BRIEF (c)：档位表放 profile 文件，UI 只读），可被 runtime patch / 后置
// overlay 的 config.tiers 整体覆盖（同 id 整键替换 config，cordis-plugin-include
// applyEntryPatches）。行号引 Q-013 终版编号：
//   第 1 行 bash → sandbox-allow：ALWAYS 仅在 policy-state 实例校验通过时成立
//     （决策 13⑤/16——main 连上本实例后写 instance = sha256(launch-token) 进它
//     自己的数据目录（P5-29），SDK 只认 instance 与本实例相符的状态；文件缺失/
//     非法 JSON/paused/fault/版本不符/instance 不符 → ALWAYS 退 ASK，NEVER 不变）。
//     wrapper 是否生效由实例校验 + 运行期 fail-closed 共同证明：launcher 恒写
//     sandbox 行，wrapper 坏 → bash 执行失败（A9 ⑤，P5-01 ⑤ 直测），不存在
//     「无卡且裸跑」路径。
//   第 3/4 行 文件工具 → workspace-read / workspace-write：候选（复用 guard 的
//     extractPaths）经 ctx.fs.resolve（realpath）后全部在会话 workspaceRoot 子树
//     内 → 门开时 allow、门关时 ASK；读类任一候选在区外 → ASK（不可始终允许，
//     Q-013 用户确认）；写类任一候选在区外（含 workspaceRoot 拿不到、候选解析
//     失败、fs 服务不可用——证不出区内即区外）→ 一律 deny，不出卡（P6-25 决策
//     37，2026-11-05：P5-21 曾把区外写 next() 交上游 fence，前提「越界写由 fence
//     拒」不成立——dsh-sandbox fence 的可写根含宿主 /tmp 与 os.tmpdir()（lib/
//     index.js:232-244），而 bash 的 /tmp 是私有 tmpfs，于是所有会话都能无卡改写
//     宿主 /tmp（P6-22 r1 实锚 probe2.txt）。拒不出卡的理由：用户无从判断一个
//     /tmp 路径该不该批，bot 自己的 bash 也看不见宿主 /tmp，写进去没有正当用途；
//     原因串固定字面串（code 前缀），不回显宿主绝对路径。纯收紧不等答复（W1-AP-0
//     先例），替代 Q-013 第 3/4 行「写类区外交 fence」的已确认语义，用户默认 A）。
//     L-7 R6（2026-11-04）：「门关」细化——状态文件在候选路径上存在（无论内容
//     是否有效）才关门；从未存在（写端 P5-29 未交付的生产默认态）不门控文件
//     工具（回到 P5-21 之前的工作区内放行，委派子代理的文件能力随之恢复），
//     bash 第 1 行不随之放宽。文件一旦出现即恢复完整 fail-closed 语义。
//     L-8 R1（2026-11-04）：「从未存在」只认从未存在——曾 provision 后被删除
//     由进程内 latch + 伴生标记（.p2sdk-policy-state-seen）记为曾存在，门保持
//     关（fail closed），见 fileGateOpen。
//   第 7 行 连接器（mcp__ 前缀）→ ask：P5-23 元数据桥落地前的回退，一律出卡。
//   第 10 行 web / 第 11 行 其他进程内工具 → allow（= 现状不拦，Q-013「维持」，
//     显式入表；不因门关收紧——门只收回 P5 新授的自主：bash 与工作区内文件）。
//   NEVER（凭证、plugin_manager、dfa 升权/会话）由 guard 在最外层承担，不在此
//     重复（决策 2/6；guard 先于本插件，本插件看到的调用都已过 NEVER）。
// 档位表损坏（文件非法 / config.tiers 非法 / 值不在词表 / 缺 default 键）→
//   A9 ②：所有 ALWAYS/ASK 一律退 ASK 并记一行 console.error（fail closed，但
//   不拒启动——与 guard 的 fail loud 不同：问用户是可用态，拒绝是停摆）。
// ASK 结果在 approvalPolicy=never 的会话（子代理、dfa 部署）一律拒绝（P5-05，
//   G1-r2 #1）；门开时的 ALWAYS 类在 never 会话照常执行（A9 ⑦——执行仍在
//   wrapper 内，由 wrapper 遮蔽兜底）。
// 判定顺序（A9）：NEVER（guard）> 档位配置 > 常驻授权（main 侧代答，不在 SDK）
//   > 故障回退（本文件的门关/表坏 → ASK）。
//
// ── 历史（保留的语义）──
// T-07（D8）：dsh 现成权限件表达不了「普通 shell 必问」，挂 tools/pre-execute
//   把未升权 bash 转成 {kind:'ask'}，经内置审批服务走 $events 问用户；拒绝/
//   无应答 = fail closed，批准只放行一次。
// T-12（R6/R12）：只有「严格宽于当前有效模式」的 sandbox_permissions 升权才委托
//   tool-bash 自己的审批（避免双重弹窗）；同模式重复、更窄、未知值、解析不到
//   当前模式，一律在这里问（fail closed）。这一段是结构逻辑（第 2 行），不走
//   档位表，表坏时也保留。
// P5-05（决策 10）：never 会话的 ask 改为立即 deny（原因固定字面串）。
export const name = 'p2sdk-shell-ask'

import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isPathUnder } from '/tmp/bot-wt/P6-26t/app/sdk/src/policy/containment.mjs'
import { noteZoneVerdict, resolveTargets } from '/tmp/bot-wt/P6-26t/app/sdk/src/policy/resolve.mjs'
import { claimLivePermit, validateRequest } from '/tmp/bot-wt/P6-26t/app/sdk/src/policy/request-net.mjs'

/** 严格更宽表，来源: deepseek-harness@ce7073d packages/sandbox/sandbox/src/escalation.ts WIDER_MODES。 */
const STRICTLY_WIDER = {
  'read-only': ['workspace-write', 'danger-full-access'],
  'workspace-write': ['danger-full-access'],
  'danger-full-access': [],
}

/** 档位表（profile/tiers.json）的词表；行语义见文件头。 */
const TIER_KINDS = new Set(['allow', 'ask', 'sandbox-allow', 'workspace-read', 'workspace-write'])

/** ask 卡原因（进审批卡的 reason，P5-07 的账本读 request.toolName，不读这里）。
 * writeOut 是 deny 原因非 ask（P6-25 决策 37：写类区外硬拒不出卡），固定字面串、
 * 不回显宿主绝对路径，测试按串断言（P5-05「原因固定字面串」同口径）。 */
const ASK = {
  bash: 'p2sdk policy: ordinary shell commands require user approval',
  readOut: 'p2sdk policy: reading files outside the workspace requires user approval',
  readGate: 'p2sdk policy: reading in the workspace requires user approval (autonomy suspended)',
  writeGate: 'p2sdk policy: writing in the workspace requires user approval (autonomy suspended)',
  writeOut: 'p2sdk policy: write-outside-workspace denied (the target is outside this session workspace; the call does not run)',
  mcp: 'p2sdk policy: connector tools require user approval (metadata bridge pending)',
  fallback: 'p2sdk policy: tier table unavailable; failing closed to per-call approval',
  net: 'p2sdk policy: network access requested',
}
const NEVER_DENY = { kind: 'deny', reason: 'approval unavailable in this session' }

/**
 * 实例 id：sha256(launch-token)。main（P5-29）读同一个 handoff 文件算同一个
 * 值写进 policy-state.instance —— 两值相等 ⇔ 写状态的 main 连的就是本实例，
 * 且 main 的数据目录在本实例已遮蔽的 mask 根里（决策 13⑤/16 的机械证明）。
 */
export function instanceOf(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

/**
 * 读一处 policy-state，判断它是否放行本实例的 ALWAYS 档。
 * @param {string[]} paths 候选路径（数据根推导，start.ts 写进 runtime patch）。
 * @param {string} instanceId 本实例 id（instanceOf）；空串 = 拿不到 token → 恒 false。
 */
export function policyStateValid(paths, instanceId) {
  if (instanceId === '' || !Array.isArray(paths)) return false
  for (const p of paths) {
    if (typeof p !== 'string') continue
    let state
    try {
      state = JSON.parse(readFileSync(p, 'utf8'))
    } catch {
      continue // 缺失 / 不可读 / 非法 JSON → 该候选不放行
    }
    if (state === null || typeof state !== 'object') continue
    if (state.version !== 1) continue
    if (state.paused === true) continue
    if (state.fault !== undefined) continue
    if (state.instance !== instanceId) continue
    return true
  }
  return false
}

/**
 * 状态文件是否在任何候选路径上存在（L-7 R6）。区分「从未 provision」（读写两端只落了
 * 读端——P5-29 写端未交付，生产默认即此态）与「存在但无效」：前者不门控文件工具
 * （回到 P5-21 之前的工作区内放行，bash 不放宽），后者保持 fail-closed 全退 ASK。
 * 只把 ENOENT 当缺失；其他错误（不可读等）视为存在 → 门关（无法证明可放宽）。
 */
export function policyStateProvisioned(paths) {
  if (!Array.isArray(paths)) return false
  for (const p of paths) {
    if (typeof p !== 'string') continue
    try {
      statSync(p)
      return true
    } catch (err) {
      if (err instanceof Error && err.code !== 'ENOENT') return true
    }
  }
  return false
}

/**
 * 档位表加载与校验（apply 时一次；表不是运行时状态，mid-session 改文件不生效，
 * 与 policy-state 的逐调用重读相反——决策 16 只要求后者「不重启即生效」）。
 * config.tiers 覆盖文件表（后置 overlay / 测试注入）；任何一处非法 → corrupt，
 * 全部退 ASK 并记一行日志（A9 ②）。返回 null = corrupt。
 */
export function loadTiers(config) {
  const fromConfig = config !== null && typeof config === 'object' && config.tiers !== undefined
  if (fromConfig) return validateTiers(config.tiers)
  const file = readTierFile()
  return file === null ? null : validateTiers(file)
}

function validateTiers(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return corrupt('tier table is not an object')
  if (typeof source.default !== 'string' || !TIER_KINDS.has(source.default)) return corrupt('no valid "default" row')
  for (const [tool, kind] of Object.entries(source)) {
    if (typeof kind !== 'string' || !TIER_KINDS.has(kind)) return corrupt(`unknown tier "${String(kind)}" for "${tool}"`)
  }
  return source
}

let tierFileCache
function readTierFile() {
  if (tierFileCache === undefined) {
    try {
      tierFileCache = JSON.parse(readFileSync(new URL('../../profile/tiers.json', import.meta.url), 'utf8'))
    } catch (err) {
      console.error(`p2sdk-shell-ask: tier table invalid (${err instanceof Error ? err.message : String(err)}); failing closed to per-call approval`)
      tierFileCache = null
    }
  }
  return tierFileCache
}

function corrupt(detail) {
  console.error(`p2sdk-shell-ask: tier table invalid (${detail}); failing closed to per-call approval`)
  return null
}

/**
 * 宿主平面注册一次，作用于全部 session（作用域事件对根监听器可达）。
 * config 由 start.ts 的 runtime patch 行注入（同 id 整键替换 approval.yml 的
 * insert 行 config）：handoff（launch-token 所在，launcher-only 值，不进 dsh env）
 * 与 policyStatePaths（数据根推导，决策 16a）。缺 config（裸挂本插件）→ 门恒关
 * → bash/工作区文件全 ASK，与 T-12 时代行为一致（fail closed）。
 */
export function apply(ctx, config = {}) {
  const tiers = loadTiers(config)
  const cfg = config !== null && typeof config === 'object' ? config : {}
  const policyStatePaths = Array.isArray(cfg.policyStatePaths) ? cfg.policyStatePaths : []
  const handoffDir = typeof cfg.handoff === 'string' && cfg.handoff.length > 0 ? cfg.handoff : undefined
  const permitDir = typeof cfg.permitDir === 'string' && cfg.permitDir.length > 0 ? cfg.permitDir : undefined
  let cachedInstance
  const instanceId = () => {
    if (cachedInstance !== undefined) return cachedInstance
    cachedInstance = ''
    if (handoffDir !== undefined) {
      try {
        const token = readFileSync(join(handoffDir, 'launch-token'), 'utf8').trim()
        if (token) cachedInstance = instanceOf(token)
      } catch {
        /* token 还没写好/读不到 → 空 id → 门关（fail closed） */
      }
    }
    return cachedInstance
  }
  // 文件工具的门（L-7 R6 + L-8 R1）：有效状态放行；「从未 provision」（写端
  // P5-29 未落地，任何候选路径都从未出现过文件）时不门控——只对文件工具放宽，
  // bash 的 ALWAYS 仍需有效状态。config 不带 policyStatePaths（裸挂）时保持门关
  // （文件头既定行为）。L-8 R1：曾 provision 后被删除（数据目录清理/轮换、写端
  // 中途崩溃留空缺、手工 rm）不得当成「从未存在」放行——否则暂停/故障门被静默
  // 撤销。记忆两级：进程内 latch（本会话）+ 状态文件同目录的伴生标记（跨重启；
  // 标记在 mask 根内，模型不可伪造/不可读；数据目录整棵轮换清空时标记随状态文件
  // 一起消失 = 回到「从未存在」，由 P5-29 写端重连重写自愈）。
  let everProvisioned = false
  const seenMarker = (p) => join(dirname(p), '.p2sdk-policy-state-seen')
  const fileGateOpen = () => {
    const valid = policyStateValid(policyStatePaths, instanceId())
    const provisioned = valid || policyStateProvisioned(policyStatePaths)
    if (provisioned) {
      if (!everProvisioned) {
        everProvisioned = true
        for (const p of policyStatePaths) {
          if (typeof p !== 'string') continue
          try {
            statSync(p) // 只给当前真有状态文件的候选留标记（缺文件/目录不存在都跳过）
            writeFileSync(seenMarker(p), '', { flag: 'a' })
          } catch {
            /* 数据根暂不可写等：内存 latch 已覆盖本会话，跨重启退回「从未存在」（数据目录整棵重建的同款终态） */
          }
        }
      }
      return valid
    }
    if (everProvisioned) return false
    for (const p of policyStatePaths) {
      if (typeof p !== 'string') continue
      try {
        statSync(seenMarker(p))
        return false
      } catch {
        /* 无标记 → 继续 */
      }
    }
    return policyStatePaths.length > 0
  }
  // 会话标识与 request-net 签发侧同源（exec.agent.session.header.id = wrapper 侧 DSH_SESSION_ID）。
  const sessionHeaderId = (exec) => {
    const id = exec.agent?.session?.header?.id
    return typeof id === 'string' ? id : undefined
  }

  ctx.on('tools/pre-execute', async (exec, next) => {
    const ask = (reason) => (approvalNever(ctx, exec) ? NEVER_DENY : { kind: 'ask', reason })

    // P5-22（D-1 定稿 ⑤）：request_network 恒 ASK、无始终允许——硬分支在档位
    // 表判定之前，不经 tiers（后置 overlay 改表改不掉）；审批本身只有
    // allowed-once / rejected 语义，无 always 通路。卡上可见完整命令 + 会话
    // 范围 + 期限（D1-r1 出卡要求；A3 的 reason 含 command 由 P5-31 的卡渲染
    // 与本 reason 字符串共同满足）。L-7 O3：两侧校验对称——execute 侧
    // validateRequest 必拒的参数（超长 command / 空 reason 等）在出卡前直接
    // deny，不出「批准了也必然失败」的卡（卡面巨量文本 + 批准被浪费）。
    if (exec.name === 'request_network') {
      const args = exec.arguments !== null && typeof exec.arguments === 'object' ? exec.arguments : {}
      const bad = validateRequest(args)
      if (bad !== null) return { kind: 'deny', reason: bad }
      const reason = typeof args.reason === 'string' && args.reason.length > 0 ? args.reason.slice(0, 500) : '(no reason given)'
      const command = typeof args.command === 'string' ? args.command : '(invalid command)'
      return ask(`${ASK.net} — reason: ${reason} | command: ${command} | scope: this session, one exact command, single use, expires in ~60s; host loopback stays blocked`)
    }

    // bash：T-12 的升权去重结构逻辑先行（不走档位表），其后按第 1 行判定。
    if (exec.name === 'bash') {
      const args = exec.arguments
      const requested = args !== null && typeof args === 'object' ? args.sandbox_permissions : undefined
      if (requested !== undefined) {
        // 解析当前有效模式（tool-bash resolveSandboxPolicy 同款调用）；拿不到就问。
        const policy = typeof ctx.get === 'function' ? ctx.get('sandboxPolicy') : undefined
        let effective
        if (policy !== null && typeof policy === 'object' && typeof policy.resolve === 'function') {
          const standing = policy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
          effective = standing !== null && typeof standing === 'object' ? standing.mode : undefined
        }
        if (typeof effective === 'string' && (STRICTLY_WIDER[effective] ?? []).includes(requested)) return next()
        // 同模式重复/更窄/未知 → 落到下方档位判定（fail closed）
      }
      if (tiers === null) return ask(ASK.fallback)
      const bashAlways = (tiers.bash ?? tiers.default) === 'sandbox-allow' && policyStateValid(policyStatePaths, instanceId())
      if (!bashAlways) {
        // L-7 O5 + L-8 R4：request_network 卡刚批下的同会话同命令许可 → 用户已在
        // 卡上见过完整命令并放行（含联网），这张 bash 卡是重复审批。许可同时是
        // bash 的执行授权，必须**原子抢占**（claimLivePermit：rename permit-* →
        // claim-*，同一许可只授权一次）——多个后台 bash 并发重复同命令时，输家在
        // 此落回出卡，而不是借同一许可静默重复执行本地副作用。许可目录在 mask 根
        // 内（模型不可伪造/不可读），联网与否的最终权威仍是 wrapper 的 claim_permit
        // （认领改名后的 claim-*.json；命中/过期/缺失决定联网与否）。
        const command = exec.arguments !== null && typeof exec.arguments === 'object' ? exec.arguments.command : undefined
        if (permitDir !== undefined && typeof command === 'string'
          && claimLivePermit(permitDir, sessionHeaderId(exec), command)) return next()
      }
      return bashAlways ? next() : ask(ASK.bash)
    }

    // 表坏 → 一律 ASK（A9 ②；NEVER 已由 guard 在外层处理，不受影响）。
    // P6-25.f1（REVIEW-C minor，Q-023）：写类文件工具例外——工作区外写在任何状态
    // 下都硬拒，包括档位表不可用：此前表坏时 write/edit 落到本行出「tier table
    // unavailable」卡，批准后真落到宿主 /tmp（fence 可写根含 /tmp）。写类名单取
    // profile/tiers.json 的 workspace-write 行（write/edit）——表坏无法查表，按
    // 本仓实际装载的写类工具回填；判外口径与表可用时相同：fs 服务不可用、候选解
    // 析失败、workspaceRoot 拿不到、任一候选 resolve 后在区外，一律 deny。其余
    // 工具（含读类）维持 A9 ② 的全退 ASK。
    if (tiers === null) {
      // 回退卡批准的是本次文件调用，不豁免执行期 NEVER 复判。
      const write = exec.name === 'write' || exec.name === 'edit'
      if (write || ['read', 'read_image', 'glob', 'grep', 'present'].includes(exec.name)) {
        noteZoneVerdict(exec, { kind: write ? 'workspace-write' : 'workspace-read', allInside: false })
      }
      if (write) {
        const fsBroken = typeof ctx.get === 'function' ? ctx.get('fs') : null
        let outside = true // 证不出区内即区外（P6-25 同口径）
        if (fsBroken !== null && typeof fsBroken === 'object' && typeof fsBroken.resolve === 'function') {
          const { targets, total, workspaceRoot } = await resolveTargets(ctx, exec, fsBroken)
          outside = !(workspaceRoot !== undefined
            && targets.length === total
            && (await Promise.all(targets.map((t) => isPathUnder(t, workspaceRoot)))).every(Boolean))
        }
        if (outside) return { kind: 'deny', reason: ASK.writeOut }
      }
      return ask(ASK.fallback)
    }
    // L-7 R1：mcp__ 工具在表里缺 mcp 行（稀疏 overlay 只强制 default 键）时回退
    // default 行——此前 kind=undefined 落 workspace 分支，MCP 工具无路径候选被
    // next() 静默放行（绕过「连接器一律出卡」与 A9 ② fail-closed）。
    const kind = tiers[exec.name] ?? (typeof exec.name === 'string' && exec.name.startsWith('mcp__') ? tiers.mcp ?? tiers.default : tiers.default)
    if (kind === 'allow' || kind === 'ask') {
      return kind === 'allow' ? next() : ask(ASK.mcp)
    }
    if (kind === 'sandbox-allow') {
      return policyStateValid(policyStatePaths, instanceId()) ? next() : ask(ASK.bash)
    }
    // workspace 档：realpath 后判「是否全部候选都在会话工作区子树内」。
    const fs = typeof ctx.get === 'function' ? ctx.get('fs') : null
    if (fs === null || typeof fs !== 'object' || typeof fs.resolve !== 'function') {
      // P6-25：写类在 fs 服务不可用时也拒——证不出区内即区外，不再交 fence
      //（fence 可写根含宿主 /tmp，见文件头第 3/4 行）。读类语义不变（ASK）。
      return kind === 'workspace-write' ? { kind: 'deny', reason: ASK.writeOut } : ask(ASK.readOut)
    }
    const { targets, total, workspaceRoot } = await resolveTargets(ctx, exec, fs)
    if (total === 0) return next() // 无路径候选（guard 已放行）→ 无从判区外
    const allInside = workspaceRoot !== undefined
      && targets.length === total
      && (await Promise.all(targets.map((t) => isPathUnder(t, workspaceRoot)))).every(Boolean)
    // P6-25.f1：判定结果交给执行层复判（fs-zone 的 tools/execute；见 resolve.mjs
    // 的交接注记——exec 同引用）。allInside=false 的读档出卡获批后执行层照常放行。
    noteZoneVerdict(exec, { kind, allInside })
    if (kind === 'workspace-read') {
      return allInside
        ? (fileGateOpen() ? next() : ask(ASK.readGate))
        : ask(ASK.readOut)
    }
    // workspace-write：区内按门放行/出卡；区外一律 deny，不出卡（P6-25 决策 37，
    // 2026-11-05）。判外包含三种「证不出区内」：任一候选 realpath 后在区外
    //（含 .. 逃逸与符号链接——resolve 先 realpath 再判，绕法归一到同一分支）、
    // 候选解析失败（targets < total）、workspaceRoot 拿不到。
    if (!allInside) return { kind: 'deny', reason: ASK.writeOut }
    return fileGateOpen() ? next() : ask(ASK.writeGate)
  })
}

/**
 * 该 bash 调用所属 session 的有效审批策略是否为显式 'never'（T-12.f1）。
 *
 * 折叠顺序与暴露面（来源: deepseek-harness@ce7073d）：
 * - session override：ApprovalService.overrideOf(session)——读 session 的
 *   approval/policy 事件投影（packages/interaction/user-approval/src/
 *   index.ts:279-281）；preset 切换经 setApprovalPolicy 写入该事件
 *   （packages/interaction/permission-presets/src/index.ts:398-418 set/apply），
 *   新 session 由 pinInitialPermission 补写（:429-457，默认 preset 也写
 *   'ask'，所以 override 有值 ≠ never）。
 * - 部署默认：user-approval 插件 config.policy（构造器 public config，
 *   user-approval index.ts:176-178；base bundle 在
 *   DSH_PERMISSION_MODE=danger-full-access 时配 never，dsh-base
 *   cordis.patch.yml approval 行）。
 * - 折叠 `override ?? config ?? 'ask'` 镜像上游 effectivePolicy（user-approval
 *   index.ts:270-272）与 permission-presets derive（index.ts:348-361）。
 *
 * 读不到服务，或 overrideOf 抛错 → false（照旧 ask，fail closed：无法证明
 * never 就不放宽；session 级意图存在却读不到时，部署默认不能代言它——
 * T-17 最终 L R1）。拿不到 session 则无 override 可折叠，部署默认即有效
 * 策略。可选服务一律 ctx.get，不用 ctx.approval 属性代理（deepseek-harness
 * packages/CLAUDE.md postmortem 0001）。
 */
function approvalNever(ctx, exec) {
  const svc = typeof ctx.get === 'function' ? ctx.get('approval') : undefined
  if (svc === null || typeof svc !== 'object') return false
  const session = exec.agent === undefined ? undefined : exec.agent.session
  let override
  if (session !== undefined && typeof svc.overrideOf === 'function') {
    try {
      override = svc.overrideOf(session)
    } catch {
      // 投影状态读不出（如 session log 缺序号，session-projection/src/
      // index.ts:794-798）：session 级意图存在但不可证（可能是 pin 的 ask），
      // 部署默认不能代言它 → 不回退 config（T-17 最终 L R1：config=never 时
      // 曾因回退而放行），fail closed 到 ask。
      return false
    }
  }
  const config = svc.config
  const configured = config !== null && typeof config === 'object' ? config.policy : undefined
  return (override ?? configured ?? 'ask') === 'never'
}
