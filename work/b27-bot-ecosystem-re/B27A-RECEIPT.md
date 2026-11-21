# B27a 回执：composer skill 引用面（getAgentWorkflows 实底）

日期：2026-11-18 · 分支 feat/B27a-create-bot · base 6862977b

## 改动（4 files, +183/-1）
- app/ui/renderer-grok/shim/src/coordinator.ts：CoordinatorDeps 加可选 getAgentWorkflows?(id)；defaultReply 移除 getAgentWorkflows；dispatch case 'getAgentWorkflows'（有实底走实底/缺省回 []）
- app/ui/renderer-grok/shim/src/data.ts：实底=ui.skills({op:'list',botId:id})→onBot.filter(name 非空).map({id:s.name,name:s.name,scheduleDescription:s.description??''})
- app/ui/tests/unit/grok-shim/b27a-workflow-suggestions.test.ts（4p）
- app/ui/tests/e2e/b27a-workflow-suggestions.spec.ts

## 对照 0.78.1（chunk-prompt-editor-DpaS0rI9.js hi() @54508）
- 行形状 {id,label:slug(name),kind:'skill',tag:trigger==null?skill:automation,subtitle:trigger==null?description:…}——我方 workflowRows 同判（category==='automations'&&trigger==null）→Skill tag
- description→scheduleDescription 映射：projectWorkflow（editor-suggestion-provider.ts:135）的 subtitle 只认 scheduleDescription

## shortcut
- suggestion 快照在 setScope（agent 切换/transport）才刷新，非 0.78.1 store 实时订阅；skill 增删后需切 agent 触发刷新。订阅化留待需要时
- skills-enable 回归挂为基线环境性：6862977b（base）同挂 60s timeout（load average 25 GPU 训练中）；0497fe68 全量时过——低负载窗口补跑

## 验证
- worktree：单测 4/4；vitest 842/842（83 files）；build 4/4；e2e b27a 一次过（6.0s）+回归 b24/skills-picker 过+skills-enable 挂（环境性）
- 主线合并后：build+vitest 842/842+e2e b27a+b24 2/2（10.5s）
