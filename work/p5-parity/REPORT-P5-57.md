# REPORT · P5-57 新 renderer 承载 P-C 市场 / P-D 配置 / 停止钮 / 启动封面

> 主会话代录（builder 写报告被拦），2026-11-03。完整版见本文件 git 历史；定稿 ui/P5-57-final.md（含 R-04 修订表）。

分支 feat/P5-57（基 b0e0b25），3 commits：44c2c78 实现/bdbd788 收尾/**984cce8 R-04 对齐**。上游 diff=0；vitest 376/376（+13）；e2e 65/65（+3，重建后重跑）；对照台 open=0+market 三联；visual 基线重写无 diff。

## 做法
shim window.pbotsUi（bots.ts+data.ts：配置投影/createBot #3#4+#5/setMain #20/selectModel/cancel/focus）；①市场=整面替换 desktop-surface（market-surface+store，复制改造自旧 renderer），外壳按 R2 D1/D2，**R-04 对齐：Connect→Connecting…→✓Connected；Not available/Not supported；单组件行（icon40+副题+右态）；Your plugins 预览条（≤4 图标+计数）代 tabs；详情单列（icon56+Information 卡）**；②新建=原生 dialog 选 preset/连接器/模型（取消不建；两入口共用）；③配置面板=Configuration/Model/Main bot 三段（preset/连接器只读）；④停止=会话头 trailing（session/cancel 同 P5-27，失败可重试）；⑤封面=原版图标三态（就绪淡出/8s Still connecting/失败 Reload）。

## D 映射（UI 段全落）
D5 走 UI 全链（由 M1 直调改回）+D10 对话框+D11 只读+D10c 三处失效提示+停止+封面 boot-cover.spec（新）。

## 未做（有据）
Remove/Removing（M1 无卸载）、11 分类/Team picks/From Grok/Apps·Skills/Copy link（目录仅 4 字段）、Tool permissions 四档（归 P5-23/24/32）、自定义 MCP 表单（M1 无 addServer）、药丸 logos、readme 纯文本、停止不进 composer、命令面板仍 Plugins。

## 发现（范围外）
默认 profile 不挂 market 时 listIndexes 404 空态（生产 profile 待定——**P5-58 在接**）；--cursor-radius-xl=12 vs R2 实测 14（本任务直接写 14）；info pane Name/Description 无 0.78.1 样式；**R-04 参照图实为空白 stale frame**（RE 报告局限已提）——本次按静态规格对齐。
