// P5-57 覆盖（D10c composer 禁发）：连接器失效的 bot 只读——composer 禁用并在 notice 槽说明原因（历史照常可读）。
// agentId 取自 scopeKey（ProductionRenderer 传 `${accountSlot}:${agentId}`）。
import { ConversationComposer as Upstream, type ConversationComposerProps } from '../../frontend/src/recovered/features/conversation/workspace/composer'
import { useBotConfig } from './pbots-ui'

export * from '../../frontend/src/recovered/features/conversation/workspace/composer'

export const READ_ONLY_NOTICE = "This bot's connector is no longer installed. Create a new bot to keep going."

export function ConversationComposer(props: ConversationComposerProps) {
  const agentId = props.scopeKey?.slice(props.scopeKey.lastIndexOf(':') + 1)
  const readOnly = useBotConfig(agentId)?.readOnly === true
  if (!readOnly) return <Upstream {...props} />
  return <Upstream {...props} disabled notice={READ_ONLY_NOTICE} placeholder="Read only" />
}
