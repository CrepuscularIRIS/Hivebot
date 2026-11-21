import { serialize } from '/tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/shim/src/entries.ts'
import { projectTranscriptEntry, projectTranscriptFeedEntries, projectTranscriptPageResult } from '/tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/overrides/modules/model.ts'
import { createTranscriptAcknowledgementController, retryWireNonces } from '/tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/overrides/modules/acknowledgement.ts'
import { withWireSendPromptNonce } from '/tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/overrides/modules/coordinator-client.ts'
const tool={kind:'tool-call',id:'tool-1',timestampMs:1,name:'bash',status:'done',summary:'printf result',args:'{"command":"printf result"}',result:'VFY-UNIQUE-FULL-RESULT'}
console.log('R2 projection paths', JSON.stringify({direct:projectTranscriptEntry(tool,0,'Bot','A')?.toolResult,feed:projectTranscriptFeedEntries([tool],'Bot','A')[0]?.toolResult??null,tail:projectTranscriptPageResult({entries:[tool]},'Bot','A').entries[0]?.toolResult??null}))
const ack=createTranscriptAcknowledgementController();ack.setScope('s','A')
ack.insertOptimistic({accountSlot:'s',agentId:'A',nonce:'N1',entries:[{id:'e1',kind:'message',clientNonce:'N1'}],phase:'pending'})
const wires=['N1'];for (const [old,fresh] of [['N1','N2'],['N2','N3']]) {ack.markFailed('s',old,1);const ok=ack.retryFailed({accountSlot:'s',agentId:'A',nonce:old,freshNonce:fresh,entries:[{id:fresh,kind:'message',clientNonce:fresh}]});wires.push((withWireSendPromptNonce('sendPrompt',{agentId:'A',clientNonce:fresh}) as any).clientNonce);console.log('R5 retry',JSON.stringify({old,fresh,ok,map:[...retryWireNonces]}))}
console.log('R5 actual wire requestIds',JSON.stringify(wires))
const old:any={kind:'user',id:'old-u',at:'2026-11-04T00:00:00.000Z',text:'repeat this'}
const raw=serialize({items:[old],hasMore:false,running:false,streaming:null,agentName:'Bot',clientNonce:'new-N',clientPrompt:'repeat this'})
console.log('R4/O2 historical same-text before new message',JSON.stringify(raw))
const a=createTranscriptAcknowledgementController();a.setScope('s','A');a.insertOptimistic({accountSlot:'s',agentId:'A',nonce:'new-N',entries:[{id:'pending-new-N',kind:'message',clientNonce:'new-N'}],phase:'pending'})
const echo:any=raw.find(e=>e.clientNonce==='new-N');if(echo) a.ingestTranscriptEvent({accountSlot:'s',agentId:'A',entry:{id:echo.id,kind:'message',clientNonce:echo.clientNonce}})
console.log('R4/O2 records after historical echo',a.getSnapshot().records.length)
