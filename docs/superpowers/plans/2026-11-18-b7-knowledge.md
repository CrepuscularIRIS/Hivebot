# B7 bot 设置面 Knowledge 区（learnings 审批 + 文件库）

日期：2026-11-18 · 域：bot 经营 C4 · 来源 RE：work/grok-1.1.0-re/（re-botmanage 报告 + RE-COVERAGE-MAP §2 C4）

## Goal
在 bot 设置 info pane（agent-settings.tsx）追加 Knowledge 区：①Learnings 审批列表（Approve/Reject）②Bot 文件库（上传/列表/删除）。对齐 1.1.0 knowledge chunk 行为（kind=skill/memory 按天分组；25MB/文件·200 文件·1GB 总限；上传拖拽+按钮双通道）。

## Architecture（2026-11-18 01:30 修正：DSH 实底探空后收口）
- 探空记录：DSH 无 automation/schedule/files RPC 面（六层实证：DSH asar 无 / Tauri resources node_modules 无 / dsh-tauri-extension+remote 仅 scheduleRestart 重连调度非任务系统 / M1_ALLOW 无 automation 无 files 行 / Grok Bot asar 的 listTeamBotAutomations 是其云端私有 RPC）。
- 上游 1.1.0 是独立 manage screen tabs 之一；HiveBot 主线形态=info pane AgentSettingsPanel（141 行，upstream+BotConfigSections）。**落点=BotConfigSections 尾追加两 section**（Learnings / Routines），复用 pb-pane 样式族，不建新屏不建路由（ponytail：info pane 已是 HiveBot 的 bot 设置事实形态，1:1 到「区内容与行为」，不到「屏形态」）。
- B7.1 Learnings 只读=skills 展示：shim skillsCatalog/syncPluginSkills 有挂点（coordinator.ts:46 stub 区）——补真实现读 DSH skills，列表项=skill 名+描述（kind=skill 按天分组：天=skill 安装日），无 Approve/Reject（DSH 无 review-item RPC，不做假审批，真审批记 Q-066）。
- B7.2 Routines 空态+onAsk：1.1.0 同款「Set up a routine」引导（kFvfud→StuxPK 文案链），点击=往当前会话发「Set up a routine: ...」消息（sendPrompt 实底在）；不建数据列表（无 DSH automation 面）。

## Tech Stack / Spec 路径
- 改动面：app/ui/renderer-grok/overrides/modules/agent-settings.tsx（+2 section）；shim coordinator+data（files RPC 口）；单测+e2e。
- 规格锚：RE 报告 re-botmanage（b43 块）题2/题7 全部细节。

## Global Constraints
- 文案出自 1.1.0 i18n 键组（Approve=Z7ZXbT/Reject=1t/NnN/Learning=wqxglO/文件限 25MB=26214400 等——从 deb110 index.eager-common-DcDxc78C.js 原文取）。
- 上传硬限三档：单文件 26214400B / 200 文件 / 1073741824B 总量，超限前端拒绝并提示。
- e2e 走 fake overlay（writeScriptCalls 预置），不依赖真上传后端。

## Review Focus（5 条）
1. Learnings 只读降级的语义诚实性——UI 不得呈现假 Approve/Reject（无后端实义）。
2. 文件三档限的边界（恰好 25MB/第 201 个文件/恰 1GB）拒收+提示文案。
3. 上传失败（RPC error）不静默——错误行可见可重试。
4. 删除需确认对话（1.1.0 同款），删除后列表即时刷新。
5. readOnly bot（connector dead）Knowledge 区降级或不渲染的分支正确。
