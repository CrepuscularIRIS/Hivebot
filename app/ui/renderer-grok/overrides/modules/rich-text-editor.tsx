// P5-54 覆盖：composer 编辑器按 scopeKey（= 账户槽:agentId）重挂。
// 上游重建树的作用域栅栏（rich-text-editor.tsx:792-796 装栏、:773-778 放行）只放行带 `uiEvent` meta 的事务，
// 而 ProseMirror 只给 paste / drop / cut 打这个 meta——切到另一个 bot 后键盘输入的事务全被栅栏吞掉，
// onChange 不触发、草稿恒空、「Send message」不出现（P5-51 坑⑨「切 bot composer 不接输入」的根因）。
// 主 bot 能发是因为首个 scopeKey 不装栏。按 scopeKey 重挂 = 每个 bot 都是「首个作用域」，
// 栅栏要防的串草稿由上游 draft 外部内容 effect（按 prompt/richText 回填）自己保证。
import { PromptRichTextEditor as Upstream } from '../../frontend/src/recovered/features/conversation/workspace/rich-text-editor'

export * from '../../frontend/src/recovered/features/conversation/workspace/rich-text-editor'

export function PromptRichTextEditor(props: Parameters<typeof Upstream>[0]) {
  return <Upstream key={props.scopeKey ?? ''} {...props} />
}
