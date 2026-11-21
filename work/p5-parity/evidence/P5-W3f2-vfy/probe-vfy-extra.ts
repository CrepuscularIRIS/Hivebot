// P5-W3.f2 验收员坏路径探针（独立于 builder 的 probe-f2）
// 1) R4/O2 对抗变体：旧消息无 rpcId + 新消息带 rpcId 并存 → nonce 只落新消息；echo 到达前 ack 不被提前对账
// 2) R5 对抗变体：重试树分叉（N1→N2 后又直接重试 N1 铸出 N4）→ wire 仍恒 N1
import { serialize } from '/tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/shim/src/entries.ts'
import { createTranscriptAcknowledgementController, retryWireNonces } from '/tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/overrides/modules/acknowledgement.ts'
import { withWireSendPromptNonce } from '/tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/overrides/modules/coordinator-client.ts'

// 1) 旧消息无 rpcId（老快照/其他来源），新消息带 rpcId=new-N
const oldNoRpc: any = { kind: 'user', id: 'old-u', at: 1, text: 'repeat this' }
const newWithRpc: any = { kind: 'user', id: 'new-u', at: 2, text: 'repeat this', rpcId: 'new-N' }
const raw = serialize({ items: [oldNoRpc, newWithRpc], hasMore: false, running: false, streaming: null, agentName: 'Bot', clientNonce: 'new-N' })
const withNonce = raw.filter((e: any) => e.clientNonce === 'new-N').map((e: any) => e.id)
console.log('EXTRA-R4 bind ids (期望仅 new-u):', JSON.stringify(withNonce))
// 新消息未到（只有旧的无 rpcId 消息）→ 不消费、ack 保持
const rawBefore = serialize({ items: [oldNoRpc], hasMore: false, running: false, streaming: null, agentName: 'Bot', clientNonce: 'new-N' })
console.log('EXTRA-R4 pre-arrival nonce leaked (期望 false):', JSON.stringify(rawBefore.some((e: any) => e.clientNonce === 'new-N')))
const a = createTranscriptAcknowledgementController(); a.setScope('s', 'A')
a.insertOptimistic({ accountSlot: 's', agentId: 'A', nonce: 'new-N', entries: [{ id: 'p1', kind: 'message', clientNonce: 'new-N' }], phase: 'pending' })
const leak = rawBefore.find((e: any) => e.clientNonce === 'new-N')
if (leak) a.ingestTranscriptEvent({ accountSlot: 's', agentId: 'A', entry: { id: leak.id, kind: 'message', clientNonce: 'new-N' } })
console.log('EXTRA-R4 ack records after pre-arrival echo (期望 1):', a.getSnapshot().records.length)

// 2) 重试树分叉：N1→N2，再直接重试 N1 铸 N4；随后重试 N2 铸 N3
const ack = createTranscriptAcknowledgementController(); ack.setScope('s', 'A')
ack.insertOptimistic({ accountSlot: 's', agentId: 'A', nonce: 'N1', entries: [{ id: 'e1', kind: 'message', clientNonce: 'N1' }], phase: 'pending' })
const wires = ['N1']
const retry = (old: string, fresh: string) => {
  ack.markFailed('s', old, 1)
  ack.retryFailed({ accountSlot: 's', agentId: 'A', nonce: old, freshNonce: fresh, entries: [{ id: fresh, kind: 'message', clientNonce: fresh }] })
  wires.push((withWireSendPromptNonce('sendPrompt', { agentId: 'A', clientNonce: fresh }) as any).clientNonce)
}
retry('N1', 'N2'); retry('N1', 'N4'); retry('N2', 'N3')
console.log('EXTRA-R5 map:', JSON.stringify([...retryWireNonces]))
console.log('EXTRA-R5 wires (期望全 N1):', JSON.stringify(wires))
