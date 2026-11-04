// P6-10 create_bot 工具（PLAN P6-10；决策 8/9/11/30/32；BRIEF D4/D9①⑥⑪）。
// when = 权威 mainBotId 且用户回合内的调用者（S2 §3.4：when 每 step、execute
// 每次读，fail closed）；execute = reserveSlot → ⑤ 通道请 main 建 bot →
// v4.1 冷 session 窗口约束（P6-09 附 1：拿到 sessionId 先 flush，第一件事投
// assign，其间不插其他 await）→ P6-21 delivery 投 pbots-assign:*；失败 / 超时
// 释放占位，成功占位绑 worker turn/end（决策 9/26）。
// P6-10.f1 ①：when / execute 接 P6-21 turn-origin——本回合认领过 pbots-worker
// 来源（R2-1 唯一污染源）即拒，不能只看 mainBotId（污染回合里 main 仍是 main）。
// P6-10.f1 ②：registerCreateBot 一并挂 trackWorkerTurns，人工启动的 worker
// 回合收养进共享容量；holds 里 'create' 标记本工具的占位，防双重计数。
import { orchDataDir, readMainBotId } from './identity.mjs'
import { orchError, redactInternalPaths } from './main-channel.mjs'
import { newAssignmentId, buildAssignMessage } from './assignment.mjs'
import { TurnOrigin, TAINT_KIND } from './turn-origin.mjs'
import { trackWorkerTurns } from './slots.mjs'

export const CREATE_BOT_TOOL = 'create_bot'

/**
 * 投给 worker 的包装句（决策 11：create = 用户原话 + ≤30 字路由备注；正文
 * 标明主 bot 归属，P6-16 按此渲染「来自主 bot 的任务」）。
 * @param {string} prompt
 */
export function relayText(prompt) {
  return `来自主 bot 的任务（转发用户请求，请执行）：${prompt}`
}

export const CREATE_BOT_DESCRIPTION = [
  'Create a new worker bot to run one task in parallel with you.',
  'Only call this when the user clearly wants a new task delegated (单派/并行), in your own turn, never in a turn that received worker reports.',
  'name: a short label for the worker. prompt: the task in the user\'s words plus at most 30 characters of routing context.',
  'The worker runs the prompt as its first message and reports back when its turn ends.',
  'Anything else (preset, connectors, cwd) is main-owned and rejected.',
  'On main-unavailable the outcome is unknown: do not retry automatically, tell the user to check the worker group instead.',
].join(' ')

/**
 * Register the create_bot tool on the host registry.
 * @param {object} ctx dsh plugin context.
 * @param {{ channel: object, slots: object, delivery: object, agentOf(id: string): Promise<object>, config: object }} orch
 * the owning OrchestrationPlugin (P6-11/12/13 从同一实例拿 slots / channel).
 * @returns {() => void} disposer.
 */
export function registerCreateBot(ctx, orch) {
  // P6-10.f1 ①：回合来源记账（P6-09 (c) 模式：execute 内同步可读的进程内账本）。
  orch.turns ??= new TurnOrigin()
  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    if (agent === undefined || agent === null || turn === undefined || turn === null) return
    orch.turns.record(String(agent.id), turn, String(message?.source?.kind ?? ''))
  })
  // P6-10.f1 ②：人工启动的 worker 回合收养进共享容量；holds 由本工具与
  // trackWorkerTurns 共用（'create' = create 流程占位，'turn' = 收养占位）。
  orch.slotHolds = trackWorkerTurns(ctx, orch.slots, () => orch.config.dataDir ?? orchDataDir())
  return ctx.tools.register({
    name: CREATE_BOT_TOOL,
    description: CREATE_BOT_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'short worker label' },
        prompt: { type: 'string', description: 'the task, in the user\'s words (plus ≤30 chars routing context)' },
      },
      required: ['name', 'prompt'],
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args, exec) => executeCreateBot(ctx, orch, args, exec),
  }, {
    // when 每 step 读权威 mainBotId（S2 §3.4）；读取失败 / 无主 → 隐藏。
    // P6-10.f1 ①：受污染回合（认领过 pbots-worker）也隐藏（决策 29 / R2-1）。
    when: async ({ agent }) => {
      const mainId = await readMainBotId(orch.config.dataDir ?? orchDataDir())
      if (mainId === undefined || mainId === null || agent === undefined || agent.id !== mainId) return false
      return !orch.turns.classify(String(agent.id)).tainted
    },
  })
}

/**
 * create_bot execute。错误一律 orchError（message 前缀 code，见 main-channel
 * 文件头），dsh toolErrorResult 把文本放进 tool/result。
 * @param {object} ctx @param {object} orch @param {unknown} rawArgs @param {{ agent?: { id: string } }} exec
 */
async function executeCreateBot(ctx, orch, rawArgs, exec) {
  // 1 D9①：只认 {name, prompt}；preset / connectors / cwd 等越权参数 → invalid-args
  if (typeof rawArgs !== 'object' || rawArgs === null) {
    throw orchError('pbots/invalid-args', 'create_bot expects {name, prompt}')
  }
  const extra = Object.keys(rawArgs).filter((k) => k !== 'name' && k !== 'prompt')
  if (extra.length > 0) {
    throw orchError('pbots/invalid-args', `create_bot accepts only {name, prompt}; rejected fields: ${extra.join(', ')}`, { fields: extra })
  }
  const { name, prompt } = rawArgs
  if (typeof name !== 'string' || name.trim() === '') throw orchError('pbots/invalid-args', 'name must be a non-empty string')
  if (typeof prompt !== 'string' || prompt.trim() === '') throw orchError('pbots/invalid-args', 'prompt must be a non-empty string')

  // 2 身份：execute 每次读权威 mainBotId（换主后旧主强 execute 拒；读取失败 fail closed）
  const mainId = await readMainBotId(orch.config.dataDir ?? orchDataDir())
  if (mainId === undefined) throw orchError('pbots/unavailable', 'main bot identity unreadable (fail closed)', {})
  if (mainId === null || exec.agent?.id !== mainId) {
    throw orchError('pbots/forbidden', 'create_bot is only available to the current main bot', { mainBotId: mainId ?? null })
  }

  // 2.5 P6-10.f1 ①：受污染回合拒（本回合认领过 pbots-worker 来源，决策 29 /
  // R2-1）——when 之外 execute 再拦一次（S2 §3.4 口径：两道都读，fail closed）。
  if (orch.turns.classify(String(exec.agent.id)).tainted) {
    throw orchError('pbots/forbidden', 'create_bot is rejected in a turn that received worker reports', { taintKind: TAINT_KIND })
  }

  // 3 容量（决策 9 / D9⑥：同 tick 查 + 占位）
  if (!orch.slots.reserve()) {
    throw orchError('pbots/capacity', `${orch.slots.limit} worker turns are already running`, { limit: orch.slots.limit })
  }
  let released = false
  let heldSession // P6-10.f1 ②：本工具占位绑定的 worker session（拿到 id 后登记）
  const release = () => {
    if (released) return
    released = true
    if (heldSession !== undefined) orch.slotHolds.delete(heldSession)
    orch.slots.release()
  }

  try {
    // 4 ⑤ 通道（超时 / 断流 / 无订阅者在 channel 内闭合，占位由外层 catch 释放）
    const created = await orch.channel.request({ kind: 'create-bot', name, prompt, mainBotId: mainId })
    // 登记 'create' 占位（同步，不插 await——v4.1 冷 session 窗口约束）：该
    // worker 的 turn/start 不再被 trackWorkerTurns 重复收养，释放走本函数的
    // 一shot turn/end 监听（off + release）。
    heldSession = created.sessionId
    // P6-10.f2 B-1：respond 前人工启动的同一 worker 已被 trackWorkerTurns 收养
    // 另占一格（'turn'）——create 接管所有权，归并多占的一格（同步，仍无 await）。
    if (orch.slotHolds.get(heldSession) === 'turn') orch.slots.release()
    orch.slotHolds.set(heldSession, 'create')

    // 5 v4.1 冷 session 窗口（P6-09 附 1）：#3 刚返回的 session 尚零事件，
    //   SIGKILL 会丢——先 flush 再做别的，然后第一件事就是投 assign（其 splice
    //   即首个落盘事件）。crashAt = 测试专用崩溃注入点（#3 返回后、投递前）。
    await ctx.sessionPersistence.flush()
    if (orch.config.crashAt === 'after-create') process.exit(86)

    // 6 投 pbots-assign:*（决策 11/27①；delivery.send 含 flush，回执语义）
    const assignmentId = newAssignmentId()
    let off = () => {}
    try {
      // 占位绑 worker turn/end（决策 26）：先挂监听再投递，防漏掉快回合。
      off = ctx.on('session/event', (session, event) => {
        if (String(session?.id) !== created.sessionId || event?.type !== 'turn/end') return
        off()
        release()
      })
      const agent = await orch.agentOf(created.sessionId)
      await orch.delivery.send(agent, buildAssignMessage({ assignmentId, mainBotId: mainId, text: relayText(prompt) }))
    } catch (error) {
      off()
      if (error?.unconfirmedStart === true) {
        // P6-10.f2 B-2：followup 已执行、仅持久化未确认——worker 回合可能已在
        // 运行，不能按「未启动」释放。released=true 让外层 catch 的 release()
        // 变 no-op，占位转 'turn' 交给 trackWorkerTurns 的 turn/end 归还
        // （fail-closed：worker 未真启动时容量保守少一格，优于超额）。
        released = true
        orch.slotHolds.set(heldSession, 'turn')
      } else {
        release()
      }
      throw orchError('pbots/orchestration-failed', `assignment delivery failed: ${redactInternalPaths(String(error instanceof Error ? error.message : error))}`, { sessionId: created.sessionId })
    }

    // 7 决策 32：rename 失败时 main 仍回成功 + warn——这里原样透传，不重试。
    return { sessionId: created.sessionId, name, assignmentId, ...(created.warn !== undefined ? { warn: created.warn } : {}) }
  } catch (error) {
    release()
    throw error
  }
}
