# GU-P5-11 · 席 B（6.1 Sol）

> 代录，未经改写（席 B 运行约束禁写文件，主会话机械转录，2026-11-03）

seat: B
verdict: PASS
confidence: medium
reverse_take: 最可能的退化是折叠后只保留图形、遗漏可达名；保留现有布局，补语义比回退更稳。
findings:
- [MEDIUM] /home/lingxufeng/bot/app/ui/renderer/plugins/bots/sidebar.css:30 — 折叠后市场按钮无可访问名称，也无名称 tooltip — 证据：Sidebar.tsx:206–208 无 aria-label/title，文字被 display:none；theme/theme.tsx:32 图标 aria-hidden — 建议：按钮补 aria-label="市场" 与 title，不必回退布局。
- 展开态可接受：三钮同组、间距与规格吻合 R2；已目视全部 10 张截图。市场位置、条目高度属 P5-16 已登记差异，不冒充像素级还原。
- 78px 布局成立：头像、主 Bot 星标、选中底均不拥挤；Sidebar.tsx:92 保留完整名称与状态。运行/审批角标沿用原 DOM，但截图未覆盖动态组合，故 confidence=medium。
- 三处偏离可接受：原位搜索避免列表跳动；78px 为明确标注的推导值而非原版实测；按钮折叠与拖拽调宽分工清楚，理由不能仅靠"旧测试不能红"，但无需改回。无 HIGH/BLOCKER，无必须回退的视觉问题。
