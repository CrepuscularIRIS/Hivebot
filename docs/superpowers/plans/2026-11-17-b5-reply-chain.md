# 2026-11-17 · 批 5：A5 Reply 引用回复链（消息操作 P0 件）

## Goal

消息 More 菜单 Reply → composer 进 reply 态（引用预览+Cancel）→ 发送后新消息渲染引用块——0.78.1 A5 P0 件；dsh 无 reply 协议字段，shim 元数据先行（发送文本前缀标记，渲染层解析成引用块）。

## 规格锚（RE-UI-FACES-0.78.1.md §4）

- 菜单项：Reply `ImOQa9`（**在菜单里不在 hover 条**——形态对齐 0.78.1；hover 两钮=reaction+More）
- reply 态三键：`Cancel reply` `AnRu/j` + 引用预览 + `Jump to replied message` `i/GPhL`
- aria：用户消息 `Reply to your message`
- recovered 现成件：reply-thread-controller / reply-preview / ComposerReplyTarget 已在（ProductionRenderer :778-779 :1892 :3537 已接 selectReply）

## Architecture

- transcript.tsx:206 onReply=undefined → 透传 props.onReply（selectReply 链已通）
- reply-preview/composer：确认 recovered 链在新 transcript 下渲染（剥除罩摘掉后应自动恢复——e2e 验证）
- 发送侧：sendPrompt 的 prompt 文本前置 `\u2063[reply:id]\u2063`（invisible separator 标记）；渲染层 message-entry 识别标记渲染引用块；dsh 协议无字段不硬造
- transcript.tsx:206 同时剥除的 onStartThread 保持 undefined（线程树不在本批）

## Global Constraints

- e2e 前 build；不动 t91-reaction spec；dead-entries :151 的 Reply count=0 断言**过时**（本批恢复后改断言 Reply 存在）

## 任务

### B5.1 Reply 链恢复 + 引用标记渲染

Files: app/ui/renderer-grok/overrides/modules/transcript.tsx, shim/src/data.ts（sendPrompt 前缀标记）, renderer 引用块渲染位, tests/e2e/b5-reply-chain.spec.ts（新）, tests/e2e/grok-dead-entries.spec.ts（:151 断言翻转）
- onReply 透传；reply 态 e2e：More 菜单 → Reply → composer 引用预览可见 → Cancel reply 可退出
- 发送：prompt 带 [reply:id] 前缀 → 新消息渲染引用块（跳转锚 data-reply-jump）
- commit: feat(b5.1): Reply 引用回复链

## Review Focus

1. reply 标记污染复制文本（Copy 拿到 \u2063 前缀）→ projectTranscriptCardCopy 剥标记
2. readOnly 连接器失效会话 reply 钮可见性 → e2e readOnly 场景断言隐藏
3. replyToId 跨会话悬挂（引用的消息被滚动出窗）→ 引用块容错（找不到源只显示占位）
4. Cancel reply 后 composer 残留态 → e2e 断言清空
5. dead-entries 断言翻转后该 spec 其他剥除断言仍绿（onStartThread 仍 count=0）
