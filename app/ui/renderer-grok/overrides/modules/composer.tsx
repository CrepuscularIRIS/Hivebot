// P5-57 覆盖（D10c composer 禁发）：连接器失效的 bot 只读——composer 禁用并在 notice 槽说明原因（历史照常可读）。
// B2.2 覆盖（RE-DRAFT-SEND-1.1.0.md）：草稿发送失败卡——refused/timed-out 显示
// "Didn't go through"/"Failed to send"（RE 键 cCCVzA/lDjxmT）+ Retry（重发）与
// Discard（丢弃，键 +zYUxF）两动作；unconfirmed 超时后转 timed-out 同卡。1.1.0
// 的 retry 有 under-card/actions 两 placement（B2 只做 under-card——composer notice
// 槽即其位置语义）。agentId 取自 scopeKey（ProductionRenderer 传 `${accountSlot}:${agentId}`）。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ConversationComposer as Upstream, type ConversationComposerProps } from '../../frontend/src/recovered/features/conversation/workspace/composer'
import { SandButton, SandIconButton } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import { useBotConfig, useUiVersion, ui } from './pbots-ui'
import type { DraftSendState } from '../../shim/src/draft-send'
import { startDictation, type DictationHandle } from './dictation'

export * from '../../frontend/src/recovered/features/conversation/workspace/composer'

export const READ_ONLY_NOTICE = "This bot's connector is no longer installed. Create a new bot to keep going."

/** B2.2 失败文案（1.1.0 锚：cCCVzA "Didn't go through" / lDjxmT "Failed to send" / 01Zgfk "Timed out"）。 */
export function draftFailureNote(state: DraftSendState): string {
  if (state.state === 'refused') return `Didn't go through. ${state.error}` // cCCVzA + 错误详情
  if (state.state === 'timed-out') return 'Failed to send · Timed out' // lDjxmT + 01Zgfk
  return 'Not delivered yet' // qq3pY2（unconfirmed 兜底——正常路径等待回执，不应久挂）
}

function DraftSendFailureCard({ agentId }: { agentId: string }): ReactNode {
  useUiVersion() // draft 状态变化（shim push.agents）驱动重渲
  const state = ui()?.draftSendState(agentId) as DraftSendState | undefined
  if (state === undefined || state.state === 'unconfirmed') return null
  return (
    <div className="sand-pbots-draft-failure" data-pbots-draft-failure={state.state} role="alert">
      <p className="sand-pbots-draft-failure__note">{draftFailureNote(state)}</p>
      <div className="sand-pbots-draft-failure__actions">
        <SandButton size="sm" variant="secondary" onClick={() => { void ui()?.retryDraft(agentId) }}>Retry</SandButton>
        <SandButton size="sm" variant="secondary" onClick={() => { ui()?.discardDraft(agentId) }}>Discard</SandButton>
      </div>
    </div>
  )
}

/** B12 听写钮（Web Speech 活流；1.1.0 dictation 语义：interim 临时段+final 定稿）。 */
function DictationButton({ onFinal }: { onFinal: (text: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [interim, setInterim] = useState('')
  const ref = useRef<DictationHandle | null>(null)
  // Review Focus 1：unmount 必停，防 recognition 泄漏
  useEffect(() => () => ref.current?.stop(), [])
  const toggle = (): void => {
    if (ref.current !== null && ref.current.active()) { ref.current.stop(); return }
    ref.current = startDictation({
      onInterim: setInterim,
      onFinal,
      onState: setRecording,
    })
  }
  return <div className="sand-pbots-dictation" data-dictating={recording ? 'true' : undefined}>
    {interim !== '' && <p className="sand-pbots-dictation__interim" data-dictation-interim>{interim}</p>}
    <SandIconButton aria-label="Dictate" aria-pressed={recording} className="sand-pbots-dictation__mic" disabled={false} icon="mic" onClick={toggle} shape="circle" size="sm" variant={recording ? 'primary' : 'default'} />
  </div>
}

export function ConversationComposer(props: ConversationComposerProps) {
  const agentId = props.scopeKey?.slice(props.scopeKey.lastIndexOf(':') + 1)
  const readOnly = useBotConfig(agentId)?.readOnly === true
  const [dictated, setDictated] = useState('')
  const appendDictation = (text: string): void => {
    const chunk = text.trim()
    if (chunk === '') return
    setDictated((prev) => (prev === '' ? chunk : `${prev} ${chunk}`))
  }
  if (!readOnly) return (
    <>
      <DraftSendFailureCard agentId={agentId ?? ''} />
      {dictated !== '' && <p className="sand-pbots-dictation__final" data-dictation-final>{dictated}</p>}
      <DictationButton onFinal={appendDictation} />
      <Upstream {...props} />
    </>
  )
  return (
    <>
      <DraftSendFailureCard agentId={agentId ?? ''} />
      <Upstream {...props} disabled notice={READ_ONLY_NOTICE} placeholder="Read only" />
    </>
  )
}
