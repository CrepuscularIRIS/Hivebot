// P6-15/16 e2e 专用（不是产品代码）：在真实 Loader 里按 PLAN 决策 27 / 28 的 wire 形状投递编排来源消息，
// 替 P6-10 / P6-11 / P6-12 尚未合并的那一段（UI 侧只认 wire：user/message.source.kind = pbots-main / pbots-worker）。
// 骨架复制自 work/p6-orchestration/evidence/p6-09/probe.mjs（P6-09 spike，deliver 分支：Agent.followup + 自有 source kind，
// MessageSourceMap 可合并扩展、运行时不校验 kind），只留投递与两个同名桩工具：
//   - p615/control {op:'deliver', sessionId, id, text, source}：对目标 session followup 一条消息（冷会话按 id resume）
//   - p615/control {op:'stub', name, sessionId}：create_bot 桩按 name 返回该 sessionId（Messaging 行的「可点」形态）
//   - 工具 create_bot{name,prompt} / send_to_bot{botId,prompt}：只回结果，不建会话不投递（建会话与投递由测试显式做）
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const marketEntry = fileURLToPath(new URL('../../../sdk/node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js', import.meta.url))
const require = createRequire(realpathSync(marketEntry))
const { TypertRemoteService, RemoteError } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')).href)
const marker = '@deepseek-ai/dsh-typert-protocol/remote-methods'

const json = { type: 'object' }
const render = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]

export default class P615Peer extends TypertRemoteService {
  static inject = ['tools', 'agents', 'sessionController']
  constructor(ctx) {
    super(ctx, 'p615Peer', { namespace: 'p615' })
    this.stubs = new Map()
    ctx.tools.register({
      name: 'create_bot', description: 'P6-15 e2e stub of the orchestration create tool',
      parameters: { type: 'object', properties: { name: { type: 'string' }, prompt: { type: 'string' } } },
      output: { schema: json, render },
      execute: async (args) => {
        const sessionId = this.stubs.get(String(args.name ?? ''))
        if (sessionId === undefined) throw new Error('pbots/capacity: stub has no slot for this name')
        return { sessionId }
      },
    }, { when: () => true })
    ctx.tools.register({
      name: 'send_to_bot', description: 'P6-15 e2e stub of the orchestration send tool',
      parameters: { type: 'object', properties: { botId: { type: 'string' }, prompt: { type: 'string' } } },
      output: { schema: json, render },
      execute: async () => ({ accepted: true }),
    }, { when: () => true })
  }

  async agentOf(sessionId) {
    const live = this.ctx.agents.get(sessionId)
    if (live !== undefined) return live
    const found = await this.ctx.sessionController.resolveAgent(sessionId)
    if ('error' in found) throw new RemoteError('p615/not-found', String(found.error), { sessionId })
    return found.agent
  }

  async control(request) {
    if (request.op === 'stub') { this.stubs.set(request.name, request.sessionId); return { ok: true } }
    if (request.op === 'deliver') {
      const agent = await this.agentOf(request.sessionId)
      agent.followup({ id: request.id, role: 'user', content: [{ type: 'text', text: request.text }], source: request.source })
      return { status: agent.status }
    }
    throw new RemoteError('p615/invalid-args', `unknown op ${request.op}`, {})
  }
}
Object.defineProperty(P615Peer.prototype, marker, { value: { version: 1, methods: [{ method: 'control', invocation: { kind: 'direct' } }] } })
