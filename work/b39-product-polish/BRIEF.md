# B39 产品级打磨批（planner: b39-planner，2026-11-19）

## 工单（planner 回报，按价值序）
1. **B39-A 运行中断链无全局反馈**（M）——只有市场面知道掉线；聊天主界面零提示；徽章恒绿。证据 data.ts:672-674 静默重试无退避、:1013 online()、composer 无 offline 门禁、ProductionRenderer.tsx:1826 徽章失真、:633 subscribeTransport seam 无实底。修法：mux 存活→transport 订阅 seam；transcript 顶部 "Reconnecting…" 行（复用 B19 older-loading 样式）。⚠️ planner 自己标了风险：断链徽章现状未实测，施工前先实测。
2. **B39-B Skills 对话框键盘可达性**（S）——Esc 只在焦点在输入框内生效；无焦点陷阱/归位。skills-dialog.tsx:28-47/98。修法：容器 onKeyDown Escape 两级层级（先退编辑器再关对话框）+焦点归位。同仓先例 new-bot-dialog 原生 dialog、market-surface 容器级 Esc。
3. **B39-C transcript 焦点环缺失**（S）——tabIndex=0 可聚焦但 outline:none。view.css:108。0.78.1 锚：[role=log]:focus-visible outline:2px solid var(--sand-border-focus-primary) offset:-4px。一行 CSS。
4. **B39-D inline #f87171 未 token 化+守卫盲区**（S）——local-tool-view.tsx:122/:150、settings-panels.tsx:39 三处 inline 红；B38a 守卫只扫 CSS 不扫 tsx inline。修法：换 var(--sand-text-danger-primary,#f87171)+守卫加 tsx inline hex 白名单规则。

## planner 排除的假问题（勿重开）
- 白屏（RootShellErrorBoundary 已挂 main.tsx:5/root-shell-state.tsx:153）
- 会话数据损坏（localStorage 读取点全有 try/catch 回退：data.ts:187-191/avatars.ts:16-24/draft-state.ts:87-98）
- composer 草稿持久化（draft-state.ts 全套+desktop.ts:290-298 落盘）
- boot-cover 启动失败面（已有 failed+Reload）
- p5-57.css/scrollbar-t78.css hex 兜底（var fallback 第二参数=死代码）
- draftSend 失败卡不持久（原版即规格）

## 施工记录
（进行中）
