# DSH 插件生态汇总（用户提供的调研底稿）——2026-11-09

> 来源：用户 2026-11-09 贴入（ChatGPT 调研产物，约 199 个条目名）。**后续插件探索/集成按这份做**（用户原话）。
> 性质：**候选名单，非已验证事实**。真用前逐个查证：源码、最近维护（6 个月内 commit/release + issue 有回应）、DSH 版本兼容、权限面。搬运阶梯（CLAUDE.md §4）照走。
> 注意（原调研自己也强调）：「官方公众号收录」「社区推荐」「真实安装验证」是三种不同证据，不能混谈；dpharness.com 是第三方数据榜非官方。

## 用户偏好信号（从这份调研的取舍读出）

- 优先级表（原文第五节）：**可靠性与上下文优先于界面**——turn-rewind/undo-savepoint（出错恢复）> context（上下文管理）> mnemon/mem9（长期记忆）> agent-teams（多 Agent）> browser/BrowserSkill（真实浏览器）> modsearch（检索）> modlens/vision-toolkit（视觉/OCR）> automation（定时）> better-sidebar > plugin-check/security-audit。
- 明确不默认装：模型限制绕过类（dsh-purge、dsh-infinite-gen-5）、红队类（dsh-redteam-model）。
- 桌宠/主题类：体验线（与 T45a/T45b 对应——名单里有 dsh-dafeiyu、dsh-whale-girl-pet、dsh-plugin-pet、whale-girl、dsh-token-pet、dsh-deep-whale 等，作 T45b 形象库候选补充）。

## 三份名单速查

1. **awesome-dsh-plugins（GordenSun）50 项**：人工精选（功能价值/安装方式/文档/维护四维筛选）。
2. **dpharness.com/best 2026-11 月榜 105 项**：安装检查+实装验证+下载量+综合分，每月重算。
3. **bruc3van/awesome-dsh-plugin 补充 44 项** + 热榜 4 项（billion-context、dsh-windows-mcp、dsh-session-superagent、cc-safety-net）。

全文存档于同目录 `plugin-ecosystem-2026-11-09-source.md`（用户落的原文）；本文件为摘要 + 偏好提炼。

## 与现有工作的接口

- **E2b（能力缺口：web_search/浏览器操作）**：dsh-browser / BrowserSkill / browser-bridge / dsh-playwright-browser 是第一梯队候选（搬运阶梯第 1 级：在维护的上游依赖）。
- **T45b 形象库**：桌宠类插件名单可补 scout G 的形象候选。
- **E 系列（体验打磨）**：better-sidebar、annotation、genui/visualize（对话内渲染）对齐「0.79.3 未接线 24 项」里的对应功能面。
- **可靠性线（新方向候选）**：turn-rewind / undo-savepoint / mnemon / mem9——对齐 Hivebot 的会话/工作区模型，立项前先派探针（dsh 插件接口在 app/sdk 侧的挂点）。

## 来源链接

- DSH 官方 GitHub：github.com/deepseek-ai/deepseek-harness（`dsh-plugin` 社区发现入口）
- github.com/GordenSun/awesome-dsh-plugins（50 项）
- dpharness.com/best（105 项月榜）、dpharness.com/top（热榜）
- github.com/bruc3van/awesome-dsh-plugin（44 项）
- dsh-insights.com（生态索引）
