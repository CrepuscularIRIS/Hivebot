# 主流框架与平台：围绕 pbots（Grok Bot 复刻）

2026-11-04。状态列：**已集成**（在依赖或代码里）· **改造**（搬了文件或片段）· **参照**（只读不搬）· **否决** · **未调研**（凭记忆列出，没有 scout 核验，不作决策依据）。
证据按「锚点」一列可查。外部事实以 REUSE 文件里的日期为准。

## 0. 一张图

```
用户 ─ Electron 壳(electron-vite) ─ renderer-grok(0.18 前端 1:1) ─ shim(window.pbotsUi)
                                         │ M1 /api · M2 mux-port · M3 bots-meta
                                         ▼
                         dsh / deepseek-harness（agent runtime、preset、MCP、ask-user）
                           │ tools/pre-execute → guard.mjs（NEVER/ASK 档位、常驻授权）
                           │ runnerCommand → bwrap 断网遮蔽 ─(request_network)→ slirp4netns
                           ▼
                 LiteLLM 网关 127.0.0.1:4001 → GLM 5.3 / Opus 5.5 / 6.1 Sol / K3.1
p6：主 bot 编排 worker（R2 自建，参照 dsh-superagent + Claude Cowork 侧栏形态）
```

## 1. Agent runtime / harness（后端底座）

| 平台 | 是什么 | 在本项目 | 原因 / 锚点 |
|---|---|---|---|
| **dsh（deepseek-ai/deepseek-harness）** | DeepSeek 的 agent harness：session、preset、插件（cordis）、MCP client、ask-user、gateway `/api` + mux WebSocket | **已集成**，是后端底座。以 npm 精确版本 `0.2.2-alpha.2` 依赖，不走 workspace link | 在维护（2026-10-30），MIT。`work/p2-sdk/reuse/dsh-as-dependency.md`。接缝：`runnerCommand`、`tools/pre-execute`、preset patch |
| **dsh-superagent-prototype** | dsh 官方的多 agent 编排研究原型 | **改造 / 参照**（第 3 级），p6 主 bot 编排的思路来源 | 2026-10-31 首次导入、无 release、issue 关闭，维护状况属「边缘」，不能当第 1/2 级依赖。`work/p6-orchestration/reuse/s1-superagent-maintenance.md` |
| **OpenAI Codex CLI** | OpenAI 的终端 coding agent，带 `execpolicy` 规则引擎 | **参照**（R6 常驻授权） | 规则引擎太重、授权主体不是 bot，所以否决整套引入，自建最小精确键。`repos/openai__codex`、`work/p5-parity/reuse/r6-grant-format.md` |
| **opencode（anomalyco/opencode）** | 开源终端 agent，有持久授权 CRUD | **参照**（R6） | 最接近我们的需求，但授权主体是 project 不是 bot。同上 |
| **gemini-cli** | Google 的终端 agent，有 persistent policy，支持 subagent 规则 | **参照**（R6） | 同上，逐个否决，这本身也算「上游确实没有」的反向确认 |
| **Claude Agent SDK**（`@anthropic-ai/claude-agent-sdk`） | Anthropic 官方 agent SDK，Claude Code 的内核 | **未采用**，只在 S-5 里核过它在 npm 上存在（0.3.318） | 它不是 Cowork 的 UI 包；我们的底座已定为 dsh，换底座要重开 p2。`s5-coworker.md` §5 |
| **Claude Code** | 本项目的**开发工具**，不是产品底座 | 开发工具链：一层派发、worktree、panel、mm-review | `.claude/`、`docs/harness/` |
| Gas City | 旧版 v2 的执行底座 | **否决 / 归档** | 2026-10-28 推倒重来。`docs/harness/CLAUDE.bots-v2.md` |

## 2. 多 agent 编排（p6 superagent 方向）

| 平台 | 在本项目 | 说明 |
|---|---|---|
| **dsh-superagent-prototype** | 参照 / 改造 | 见 §1。p6 的 1b 选了 R2 自建编排（D-2 契约 ②a③a④b⑤A），跨 session 通道是 Q-021 的暂定 A |
| **Claude Cowork**（官方，闭源） | 参照形态 | worker 默认不可见、在侧栏按需展开看进度，需要人决策时回到原审批入口。具体像素和行为要对齐的话走逆向（第 4 级）。`s5-coworker.md` |
| **OpenCoworkAI/open-cowork** | 改造候选（第 3 级） | MIT，`SubagentProgress/SubagentTracker` 进度卡可以借。整仓是桌面 app，不是库。`repos/OpenCoworkAI__open-cowork` |
| composio open-claude-cowork | 否决 | 许可证出处不一致（LICENSE 写 MIT，package.json 写 ISC），commit 停在六个月边界 |
| Claude Code agent teams / subagents | 开发流程在用（就是这套 harness） | 不进产品 |
| LangGraph / CrewAI / AutoGen(AG2) / OpenAI Agents SDK / Mastra | **未调研** | 都是通用的编排框架：图状态机、角色队伍、对话式多 agent、handoff 等。它们跟 dsh 的 session / preset 模型不同构，引入就等于换 runtime。真要比较时派 scout |

## 3. 桌面 personal agent 产品（竞品与参照）

| 产品 | 在本项目 | 说明 |
|---|---|---|
| **Grok Bot 0.18**（`b-nnett/grok-bot-0.18-reconstructed`） | **参照的标杆**：前端 332 文件 1:1 移植到 renderer-grok，overrides 层改动不碰上游文件 | 非官方重构快照（2026-08-23），没有独立许可证，私用不分发 |
| **Grok Bot 0.78.1**（本机 deb） | **逆向**：视觉数值、审批模型、编排、跨 session | `work/p1-re/RE-COVERAGE.md`：198 个面，已逆 39、部分 56、未逆 97 |
| Claude Cowork / Claude Desktop | 参照（编排可见性） | 见 §2 |
| Cursor / Windsurf / Cline / Goose / OpenHands | **未调研** | 偏 IDE 或 coding agent，和「多 bot personal agent」不是同一类形态 |

## 4. 沙箱与执行隔离

| 技术 | 在本项目 | 原因 |
|---|---|---|
| **bubblewrap（bwrap）** | **已集成**：`app/sdk/sandbox/bwrap-wrap.py`，接在 dsh `runnerCommand` 上 | 断网（`--unshare-net`），遮蔽 HOME、数据目录、`/run/user`，工具链只读挂回。wrapper 不可用时 fail closed |
| **Landlock** | **否决**（dsh 自带的回退方案） | R5 实测：它与宿主共享 `/tmp`，隔离不等价，而且配置 wrapper 后不会退回 Landlock |
| **slirp4netns** | **已集成**：`request_network` supervisor | 按需给 netns 接外网，许可是一次性 argvHash、60s TTL，无需 sudo。GPL-2.0，作为外部二进制调用 |
| passt / pasta | 备选（同为第 1 级） | 功能等价，选了 slirp4netns |
| firejail / nsjail / gVisor / Docker | **未调研** | bwrap 已满足威胁模型。容器方案违反「凭证不进容器」时需要另行设计 |

## 5. 工具生态：MCP

| 项 | 在本项目 | 说明 |
|---|---|---|
| **MCP（Model Context Protocol）** | **已集成**，走 dsh `mcp-client` | 连接器即 MCP server，市场装 filesystem 等 |
| dsh 市场（market backend，109 个条目） | **已集成** | 三分类实测 browse 109 / installed 1 / installable 1。`work/p2-sdk/reuse/market-backend.md` |
| `publicToolName` 稳定工具名 | 改造（第 3 级） | 从 `mcp-client/src/tools.ts` 复制。`work/p5-parity/reuse/d2-mcp-meta.md` |
| 官方 MCP Registry / Smithery 等目录 | **未调研** | 现在只用 dsh 自带源，不开源写入口 |

## 6. 模型网关与模型

| 项 | 在本项目 | 说明 |
|---|---|---|
| **LiteLLM**（127.0.0.1:4001） | **已集成**（本机基础设施，沙箱外，不碰） | 统一 Anthropic 协议入口。真模型 e2e（d1-real-model）就走它 |
| 模型分工 | GLM 5.3：实现、验收；Opus 5.5：方案、UI 定稿；6.1 Sol：调研、panel 席 B；K3.1：不用 | 见 `CLAUDE.md` §2 |
| OpenRouter 等托管网关 | 未调研 | 私用场景下本机 LiteLLM 就够了 |

## 7. 前端与工程工具

| 项 | 状态 | 说明 |
|---|---|---|
| Electron 44.7 + **electron-vite 6.0.0** | 已集成 | Forge 8 被否决：它要求 Vite 8，而 dsh 用的是 6 |
| React 18 + **react-markdown 10.1** + Shiki（复用 dsh 的 `useCodeHighlighter`） | 已集成 | 关闭 raw HTML，不加载远程图片 |
| **Playwright 1.64** `_electron` + Xvfb | 已集成 | e2e 默认在 Xvfb 里跑，不弹窗 |
| dsh `ui-user-questions`（QuestionComposer） | 改造 | 提问卡 |
| Tailwind / Grok stylex 全量 CSS | 否决 | 改为把 `--sand-*` token 映射到 `--dsw-*` |

## 8. 结论

- **底座只有一个：dsh**。其他 harness（Codex、opencode、gemini-cli、Claude Agent SDK）都只在单项能力上做参照，不做替换。
- **安全边界靠 OS 拦得住**（bwrap + guard + slirp4netns），不靠「人点一下」。这是和原版 Grok Bot 差异最大的地方。
- **编排（p6）没有可直接依赖的在维护上游**：superagent 只是边缘维护的原型，Cowork 闭源，open-cowork 是整个 app。所以走 R2 自建，形态参照 Cowork。
- 标「未调研」的那几类（通用编排框架、IDE agent、容器沙箱、MCP 目录），哪一项需要认真比较，就派 scout 补决策行。
