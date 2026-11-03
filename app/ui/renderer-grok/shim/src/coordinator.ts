// P5-51 · coordinator 协议 v1 服务端（window.coordinatorPort）。
// 帧格式 = source/shared/rpc/coordinator-port.ts（与 0.78.1 同构，只差版本号=1）；
// 方法表 = source/shared/rpc/coordinator.ts。实底 13 RPC（RE-s0 run-stublogs）走 deps，
// 其余已知方法回空集/null/能力关，未知方法 failed unknown-method。
// 审批作答（D9）：resolution ∈ allow-once→allowed-once；deny/never→rejected；always 经由
// desktop.localToolPermission.set 拒存后的上游降级（allow-once）到达，shim 永不发 always。
export interface ShimPort {
  postMessage(message: unknown): void
  close(): void
  start(): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'close', listener: (event: Record<string, never>) => void): void
}

export interface CoordinatorDeps {
  listAgents(): unknown[]
  openAgentTail(id: string): { entries: unknown[]; nextBeforeSeq: number | null }
  transcriptWindow(id: string, beforeSeq: number | undefined): Promise<{ entries: unknown[]; nextBeforeSeq?: number; threadCounts: Record<string, number> }>
  sendPrompt(args: Record<string, unknown>): Promise<unknown>
  resolvePermission(args: { requestId: string; dshValue: 'allowed-once' | 'rejected'; agentId: string; entryId: string }): Promise<void>
  setAgentUnread(id: string, value: boolean): void
  createAgent(args: Record<string, unknown>): Promise<unknown>
  updateAgent(args: Record<string, unknown>): Promise<unknown>
}

const TEACH_IDLE = { state: 'idle', agentId: null, startedAtMs: null, maxDurationMs: 600_000 }

/** 已知但未实装的方法 → 空/能力关回值（RE-s0 实底口径）。 */
function defaultReply(method: string, deps: CoordinatorDeps): unknown | undefined {
  switch (method) {
    case 'getTrays': case 'getSubagents': case 'getAsyncTasks': case 'getAgentWorkflows':
    case 'listAllAutomations': case 'searchAgents': case 'getAgentAutomations': case 'getConversationOutline':
    case 'skillsCatalog': case 'syncPluginSkills': case 'listRoutedMcpTools': case 'searchMedia':
      return []
    case 'isAgentNetworkEnabled': case 'isGlobalSearchEnabled': case 'isEgressTunnelAvailable':
      return false
    case 'getForeverBoxStatus': case 'ensureForeverBox': case 'getCloudAgentInfo': case 'getSharingState':
      return null
    case 'getTeachRecordingStatus': return TEACH_IDLE
    case 'getListenerIntegrations': return {}
    case 'getPluginSyncStatus': return { syncing: false }
    case 'promptAcceptanceStatus': return { status: 'accepted' }
    case 'getBoxSecretsStatus': return { available: false }
    case 'countAgents': return deps.listAgents().length
    default: return undefined // 未知方法 → failed
  }
}

const dshValueOf = (resolution: unknown): 'allowed-once' | 'rejected' =>
  resolution === 'allow-once' || resolution === 'always' ? 'allowed-once' : 'rejected'

export interface CoordinatorServer {
  claim(consumer: { onPort(port: ShimPort): void }): { request(): void; release(): void }
  emit(family: string, payload: unknown): void
  /** E2E 观测面（U4′）：收到的 request 方法名，按到达顺序。 */
  requests: string[]
  /** E2E 观测面（U4′）：没有 handler 的方法（failed unknown-method）——点击触发它 = 死入口。 */
  unhandled: string[]
  /** 首次 hello → ready 握手完成（P5-54：desktop 持久化读按它排队，见 desktop.ts persistenceGate）。 */
  ready: Promise<void>
}

/** 端口对工厂：页面用 MessageChannel；单测注入内存对（Node 无 addEventListener 语义）。 */
export type PortPairFactory = () => [ShimPort, ShimPort]

const browserPair: PortPairFactory = () => {
  const channel = new MessageChannel()
  return [channel.port1 as unknown as ShimPort, channel.port2 as unknown as ShimPort]
}

export function createCoordinatorServer(deps: CoordinatorDeps, makePair: PortPairFactory = browserPair): CoordinatorServer {
  let active: ShimPort | null = null
  let ready = false
  const queued: Array<{ family: string; payload: unknown }> = []
  const requests: string[] = []
  const unhandled: string[] = []
  let markReady: () => void = () => {}
  const readyOnce = new Promise<void>((resolve) => { markReady = resolve })

  const pushEvent = (family: string, payload: unknown): void => {
    if (active !== null && ready) active.postMessage({ kind: 'event', family, payload })
    else queued.push({ family, payload })
  }

  const reply = (requestId: string, value: unknown): void => {
    active?.postMessage({ kind: 'reply', requestId, outcome: { status: 'ok', value } })
  }
  const replyFailed = (requestId: string, code: string, message: string): void => {
    active?.postMessage({ kind: 'reply', requestId, outcome: { status: 'failed', failure: { code, message } } })
  }

  const handleRequest = async (frame: { requestId: string; method: string; args: unknown }): Promise<void> => {
    const { requestId, method } = frame
    requests.push(method)
    const args = (typeof frame.args === 'object' && frame.args !== null ? frame.args : {}) as Record<string, unknown>
    try {
      switch (method) {
        case 'listAgents': return reply(requestId, deps.listAgents())
        case 'openAgentTail': {
          const id = typeof args.id === 'string' ? args.id : ''
          const page = deps.openAgentTail(id)
          // S0 坑1 解法：回值的同时同步推 transcript snapshot（entriesByAgent 由事件路径填充，
          // 与 RPC 回值竞态解耦——openAgent 世代竞态下回值会被作废，事件不会）。
          // P5-54：先回值、后推事件——事件先到会填 entriesByAgent，引起的重入 openAgent 先 ++世代再因「已有条目」
          // 早退，把在途回值作废，分页游标（只随回值安装）就丢了（#11 永不翻页）。
          reply(requestId, page)
          pushEvent('transcript', { type: 'snapshot', activeAgentId: id, entries: page.entries })
          return
        }
        // P5-54：上游 pagination 的 fetchPage 走 getAgentTranscriptTail({id, limit, beforeSeq})（ProductionRenderer.tsx:976），
        // 与 getAgentTranscriptWindow 同一实底（此前回 null → #11 翻页恒空）
        case 'getAgentTranscriptTail':
        case 'getAgentTranscriptWindow': {
          const id = typeof args.id === 'string' ? args.id : ''
          const beforeSeq = typeof args.beforeSeq === 'number' ? args.beforeSeq : undefined
          return reply(requestId, await deps.transcriptWindow(id, beforeSeq))
        }
        case 'sendPrompt': return reply(requestId, await deps.sendPrompt(args))
        case 'resolveLocalToolPermission': {
          const requestIdArg = typeof args.requestId === 'string' ? args.requestId : ''
          await deps.resolvePermission({
            requestId: requestIdArg,
            dshValue: dshValueOf(args.resolution),
            agentId: typeof args.agentId === 'string' ? args.agentId : '',
            entryId: typeof args.entryId === 'string' ? args.entryId : '',
          })
          return reply(requestId, null)
        }
        case 'setAgentUnread': {
          if (typeof args.id === 'string') deps.setAgentUnread(args.id, args.value === true)
          return reply(requestId, null)
        }
        case 'createAgent': return reply(requestId, await deps.createAgent(args))
        case 'updateAgent': return reply(requestId, await deps.updateAgent(args))
        default: {
          const value = defaultReply(method, deps)
          if (value !== undefined) return reply(requestId, value)
          unhandled.push(method)
          return replyFailed(requestId, 'unknown-method', `coordinator has no handler for ${method}`)
        }
      }
    } catch (error) {
      replyFailed(requestId, 'failed', error instanceof Error ? error.message : String(error))
    }
  }

  const serve = (port: ShimPort): void => {
    active?.close()
    active = port
    ready = false
    port.addEventListener('message', (event) => {
      const frame = event.data as Record<string, unknown>
      if (typeof frame !== 'object' || frame === null) return
      if (frame.kind === 'lifecycle' && frame.phase === 'hello') {
        ready = true
        port.postMessage({ kind: 'lifecycle', phase: 'ready', protocolVersion: 1 })
        markReady()
        while (queued.length > 0) {
          const e = queued.shift()!
          port.postMessage({ kind: 'event', family: e.family, payload: e.payload })
        }
        return
      }
      if (frame.kind === 'lifecycle' && frame.phase === 'shutdown') { port.close(); return }
      if (frame.kind === 'request' && typeof frame.requestId === 'string' && typeof frame.method === 'string') {
        void handleRequest(frame as { requestId: string; method: string; args: unknown })
      }
    })
    port.addEventListener('close', () => { if (active === port) { active = null; ready = false } })
    port.start()
  }

  return {
    claim(consumer) {
      return {
        request() {
          const [ours, theirs] = makePair()
          serve(ours)
          consumer.onPort(theirs)
        },
        release() { active?.close(); active = null; ready = false },
      }
    },
    emit: pushEvent,
    requests,
    unhandled,
    ready: readyOnce,
  }
}
