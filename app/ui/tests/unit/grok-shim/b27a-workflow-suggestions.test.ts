// B27a：composer skill 引用面——coordinator getAgentWorkflows 实底（skills 投影为 suggestion 行）。
// 0.78.1 规格（chunk-prompt-editor-DpaS0rI9 hi()）：items=[{id,label,kind:'skill',tag:Skill(tag 无 trigger 时),
// subtitle:description}]；workflowRows 消费 category:'automations' && trigger==null 的行（projectWorkflow：id/name 必填，
// scheduleDescription 可选 → subtitle；trigger==null → Skill 而非 Routine tag）。
import { describe, expect, it, vi } from 'vitest'
import { createCoordinatorServer, type CoordinatorDeps, type ShimPort } from '../../../renderer-grok/shim/src/coordinator'

function portPair(): [ShimPort, ShimPort] {
  const make = (): ShimPort & { deliver(d: unknown): void } => {
    const listeners: Array<(e: { data: unknown }) => void> = []
    let closed = false
    let peer: ShimPort & { deliver(d: unknown): void } | null = null
    return {
      postMessage(d: unknown): void { if (peer !== null && !closed) peer.deliver(d) },
      close(): void { closed = true },
      start(): void { },
      addEventListener(type: 'message', listener: (e: never) => void): void { if (type === 'message') listeners.push(listener as (e: { data: unknown }) => void) },
      deliver(d: unknown): void { for (const l of [...listeners]) l({ data: d }) },
      link(o: ShimPort & { deliver(d: unknown): void }): void { peer = o },
    }
  }
  const a = make(), b = make()
  a.link(b); b.link(a)
  return [a, b]
}

function handshake(deps: CoordinatorDeps): { client: ShimPort; frames: unknown[] } {
  const server = createCoordinatorServer(deps, portPair)
  let clientSide: ShimPort | null = null
  server.claim({ onPort(port) { clientSide = port } }).request()
  const client = clientSide!
  const frames: unknown[] = []
  client.addEventListener('message', (e) => frames.push(e.data))
  client.start()
  client.postMessage({ kind: 'lifecycle', phase: 'hello', protocolVersion: 1 })
  return { client, frames }
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

function call(client: ShimPort, frames: unknown[], method: string, args: unknown = {}): Promise<unknown> {
  const requestId = `r-${method}`
  client.postMessage({ kind: 'request', requestId, method, args })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no reply for ${method}; frames=${JSON.stringify(frames)}`)), 1000)
    const poll = (): void => {
      const reply = frames.find((f) => rec(f).kind === 'reply' && rec(f).requestId === requestId)
      if (reply !== undefined) {
        clearTimeout(timer)
        const outcome = rec(reply).outcome as { status: string; value?: unknown; failure?: { code?: string } }
        if (outcome.status === 'ok') resolve(outcome.value)
        else reject(new Error(String(outcome.failure?.code)))
      } else setTimeout(poll, 10)
    }
    poll()
  })
}

const baseDeps = (over: Partial<CoordinatorDeps> = {}): CoordinatorDeps => ({
  listAgents: () => [],
  openAgentTail: () => ({ entries: [], nextBeforeSeq: null }),
  transcriptWindow: () => Promise.resolve({ entries: [], threadCounts: {} }),
  sendPrompt: () => Promise.resolve({}),
  getAsyncTasks: () => [],
  sendDraft: () => Promise.resolve({}),
  discardDraft: () => Promise.resolve({}),
  retryDraft: () => Promise.resolve({}),
  reactToMessage: () => Promise.resolve(),
  resolvePermission: () => Promise.resolve(),
  setAgentUnread: () => { },
  createAgent: () => Promise.resolve({}),
  updateAgent: () => Promise.resolve({}),
  deleteAgents: () => Promise.resolve({}),
  ...over,
})

describe('B27a getAgentWorkflows：skills 投影（composer skill 引用面）', () => {
  it('deps.getAgentWorkflows 存在 → RPC 回投影行；无 trigger（Skill tag 非 Routine）', async () => {
    const rows = [
      { id: 'deploy-playbook', name: 'deploy-playbook', description: 'Deploy the service to staging' },
      { id: 'review-checklist', name: 'review-checklist', description: 'Check the PR before merge' },
    ]
    const { client, frames } = handshake(baseDeps({ getAgentWorkflows: () => Promise.resolve(rows) }))
    const value = await call(client, frames, 'getAgentWorkflows', { id: 'bot-1' })
    expect(value).toEqual(rows)
  })

  it('deps.getAgentWorkflows 缺省 → 回 []（旧 defaultReply 行为不回归）', async () => {
    const { client, frames } = handshake(baseDeps())
    const value = await call(client, frames, 'getAgentWorkflows', { id: 'bot-1' })
    expect(value).toEqual([])
  })

  it('deps 抛错 → failed reply（不挂帧）', async () => {
    const { client, frames } = handshake(baseDeps({ getAgentWorkflows: () => Promise.reject(new Error('boom')) }))
    await expect(call(client, frames, 'getAgentWorkflows', { id: 'x' })).rejects.toThrow()
  })

  it('vi.fn 计数：args.id 透传给 deps', async () => {
    const fn = vi.fn(() => Promise.resolve([]))
    const { client, frames } = handshake(baseDeps({ getAgentWorkflows: fn }))
    await call(client, frames, 'getAgentWorkflows', { id: 'bot-42' })
    expect(fn).toHaveBeenCalledWith('bot-42')
  })
})
