# REPORT · P5-58 双主题质量收口 + 去 mock 审计

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-58 @ d6809bf（基 d24cf6c），6 文件。ui 367/367+e2e 65/65；sdk 305/305（复跑）。

## ① 双主题
**P6-03 OBS=取证时机缺陷非样式缺陷**：emulateMedia 后 DOM 即时翻转（10 采样全 dark），像素分叉只在截图过早（Xvfb 合成器换帧滞后）——settle() 方法论（等 token 变化+2×rAF）写进 spec 立规矩。暗色真实渲染无对比度缺陷；14 组部件亮暗成对图；**23 目标×亮暗 WCAG 审计全过**（最低 4.94）；emulateMedia+nativeTheme 双路翻转锁回归。市场部件留待 P5-57 合并后加行复用框架。

## ② 去 mock（处置表全落，两处接线）
- **market.yml 进默认链**：生产 pluginMarket/*+p2temp 开箱可用（实测 listIndexes→[] 不再 404）；目录源不内置（无官方默认），P2SDK_MARKET_INDEXES 配、缺省诚实空态——「看似有面板其实无后端」的 mock 感根因之一拔除。connectors.test ③ 语义变更已申报
- **置顶 localStorage 落盘**（原 reload 静默丢）
- 保持有据：cursorAccount 中性文案（Pbots/pbots.local 自明本地）、能力关返回（P5-52 e2e 锁零死入口）、win32 控件不可达、localToolPermission 恒 ask=L-AP 设计

## OBS
sdk 首跑 request-network 探针 load 12.7 时限抖动（单跑绿复跑 305 绿）；P5-06 残留 2 进程（主会话已 reap）。
