// P5-52 覆盖：会话头剥掉 trailing（ProductionRenderer 只用它放 Channels 按钮；channels RPC 无实底）。
// P5-54：顺带把当前 agentId 交给 transcript 覆盖的未读线（markers.ts activeAgent）。
// P6-15：上报当前 agentId（pbotsUi.setActive）。
// P5-57：trailing 槽改放「停止」——运行中才出现，session/cancel（P5-27 同链路）；失败复位并提示可再点（旧 GU-3 口径）。
import { useEffect, useState } from 'react'
import { ConversationAgentHeader as Upstream, type ConversationAgentHeaderProps } from '../../frontend/src/recovered/features/conversation/workspace/chat-header'
import { SandButton } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import { activeAgent } from './markers'
import { ui } from './pbots-ui'

export * from '../../frontend/src/recovered/features/conversation/workspace/chat-header'

function StopButton({ agentId }: { agentId: string }) {
  const [phase, setPhase] = useState<'idle' | 'stopping' | 'failed'>('idle')
  useEffect(() => { setPhase('idle') }, [agentId])
  const stop = (): void => {
    const u = ui()
    if (u === null) return
    setPhase('stopping')
    void u.cancel(agentId).then((r) => setPhase(r.ok ? 'idle' : 'failed'), () => setPhase('failed'))
  }
  return <span className="pb-stop">
    {phase === 'failed' ? <small className="pb-stop__error" role="alert">Couldn't stop</small> : null}
    <SandButton aria-label="Stop" data-action="stop" leadingIcon="stop" onClick={stop} pending={phase === 'stopping'} shape="pill" size="sm" variant="secondary">
      {phase === 'stopping' ? 'Stopping…' : 'Stop'}
    </SandButton>
  </span>
}

export function ConversationAgentHeader(props: ConversationAgentHeaderProps) {
  activeAgent.id = props.agent.id
  // P6-15：当前打开的 bot 交给 shim（worker 打开即已读，主 bot 汇总随之消失）；放 effect 里，不在渲染期推 roster
  useEffect(() => { ui()?.setActive(props.agent.id) }, [props.agent.id])
  return <Upstream {...props} trailing={props.agent.isRunning === true && ui() !== null ? <StopButton agentId={props.agent.id} /> : undefined} />
}
