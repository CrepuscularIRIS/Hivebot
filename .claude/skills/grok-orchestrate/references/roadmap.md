# 项目路线（2026-11-01 起草，用户会持续调整）

目标：复刻 Grok Bot。前端照 Grok Bot 的样子来（逆向 0.78.1），后端用 dsh + superagent，并把它们整理成一层 SDK。分层方式参照 0.18 重构版「产品层叠在 harness 之上」的做法。

## 当前目标：MVP（用户 2026-11-01 定）

**一个 Grok Bot 风格的前端，可以同时开多个 dsh session（每个 bot 对应一个 session，可以选不同的 agent / harness 配置），并接上 Grok Bot 的基础市场连接器（插件 / MCP 市场的浏览、安装、启用）。**

MVP 不做（以后再做）：云电脑 / box、SSH、远程连接、VNC 实时画面、computer-use、账号体系、移动端。逆向时这些部分只做清单，不深挖。

推进方式：自动开发。阶段切换、契约、高风险改动、阶段验收都写进 `work/QUESTIONS.md`（SKILL.md §3），不停工等待。**P1 和 P2 并行**（用户 2026-11-01 定）。

## 输入素材

| 素材 | 位置 | 已知事实（2026-11-01 摸底） |
|---|---|---|
| Grok Bot 0.78.1（最新，闭源） | `~/Downloads/grok-bot_0.78.1_amd64.deb` | Electron；`resources/app.asar` 约 52MB；native 模块：`@anysphere/jpeg-napi`、`cursor-proclist`、`sand-address-lookup` 等；包名 `grok-bot`，Provides `sand`，厂商 Cursor / SpaceXAI。本机没有安装 |
| Grok Bot 0.18 重构源码 | `repos/grok-bot-0.18-reconstructed/` | 见下面「0.18 的分层」 |
| dsh（DeepSeek Harness） | `repos/deepseek-harness/` | Cordis 插件树；有 headless、sdk、acp、web 几个 profile；约 370 个包，其中 `packages/client/*` 约 68 个前端包可以砍掉，但 `client/connection` 的宿主侧（`/api` 路由与鉴权）要保留；Node ≥24.9，pnpm 11；CI 要求每个文件 100% 覆盖 |
| superagent | `repos/dsh-superagent-prototype/` | dsh 的 bundle 插件（`cordis.patch.yml`），没有改 dsh 源码；`src/core` 是纯领域引擎，只通过 `ports.ts` 和外部打交道；只有 loopback HTTP `/orchestrator/api/`，没有推送；peer 依赖 dsh 0.2.1-alpha / rc.3，本地 dsh 是 0.2.2-alpha.2，可能不兼容；没有安装、没有跑过 |
| 竞品对比 | `repos/Compare.md` | Grok Bot / Muse / dots / Duet 的 15 项功能对比，用于 P6 排功能优先级 |

### 0.18 的分层（P2 照这个抄）

1. **底座 harness**：Cursor 自家的 `@anysphere/agent*`（`source/packages/`），提供 agent 循环、工具、子代理、MCP、hooks。
2. **扩展注册表**：`defineHostExtension({id, dependencies, start(ctx)})`，按依赖拓扑顺序启动，共 35 个扩展（`source/host/extensions/registry.ts`）。每个扩展拆成 `extension.ts`（纯逻辑）和 `production.ts`（注入真实依赖）。
3. **Runner 适配层**：`source/host/runner/sand-agent-runner.ts`，用中间件把底座包起来（记忆、审批、computer-use、子代理）。
4. **推理端口**：`AgentPromptSessionOwner.createSession() → getExecutor()`。重构版正是在这里换上了 Claude / OpenAI / Codex（`provider-session.ts`），Grok 的工具则以 MCP 形式桥接过去（`routed-mcp-bridge.ts`）。
5. **进程链**：renderer → preload → Electron main → coordinator 子进程（MessagePort 直连 renderer）→ host（原版在云端沙箱 box 里，重构版加了本地 Docker 版本）。

对应到我们：dsh 就是第 1 层；superagent 的 cordis bundle 相当于第 2、3 层的一部分；cordis 插件相当于 host extension。**结论（待 P2 验证）**：保留 0.18 的 coordinator / RPC 外形和扩展清单，把 host 换成「dsh + superagent」组成的 SDK。

## P0 准备（2026-11-01 已完成）

`git init`（main 分支），`.gitignore` 排除 `repos/*/`，建了 `work/LEARNINGS.md`。产品代码放在 `app/`。slug：P1 用 `p1-re`，P2 用 `p2-sdk`。

## P1 逆向 Grok Bot 0.78.1（Track A）

目的：拿到完整的架构图和 UI 清单，作为 P3 / P4 的参照物。

派发方式：一个 RE 负责解包（`/dev/shm/grok-re/0.78.1/`）；完成后按子系统并行派 RE，每个 RE 带 1～3 个问题。优先级按 MVP：先派「深挖」的，「清单」的只要列出有什么、在哪里。

| 主题 | 深度 | 问题示例 | 产出 |
|---|---|---|---|
| ui-shell | 深挖 | 有哪些路由 / 页面 / 主要组件？用什么设计 token、图标、字体？能否直接拿出可复用的 CSS 和资产？ | `RE-ui-shell.md` 和截图 |
| ipc-rpc | 深挖 | renderer ↔ main ↔ coordinator ↔ host 的协议是什么？proto 服务和方法清单？流式事件怎么传？ | `RE-ipc-rpc.md` |
| host-ext | 清单 | host 扩展清单和启动顺序，与 0.18 的 35 个相比新增 / 删除了什么？ | `RE-host-ext.md` |
| cloud-deps | 清单 | 哪些能力依赖云端（推理、box、账号、遥测）？对应的端点和请求形状？ | `RE-cloud-deps.md` |
| marketplace | 深挖 | 市场连接器（插件 / MCP / OAuth 连接器）的界面、数据来源、安装与启用流程？市场目录从哪里拉取？ | `RE-marketplace.md` |
| features | 深挖（多 bot、多 session、跨会话消息） | 多 bot、跨会话消息、群聊、自动化、记忆、审批在 0.78.1 里怎么实现？和 0.18 有何差异？ | `RE-features.md` |
| native | 清单 | 那几个 `.node` 模块做什么？要不要替换？ | `RE-native.md` |

出口：director 把这些结论合并成 `work/<slug>/ARCH-0.78.md`（架构图、UI 清单、云端依赖表）。然后在 QUESTIONS 加一条「验收」问题。

## P2 SDK 抽取（Track B）

目的：把 dsh（只保留后端）和 superagent 整理成一个可以独立启动的后端，向上暴露一套稳定的接口。

先派 scout 回答以下问题，再由 director 写 PLAN：
1. superagent 能否在本地 dsh 0.2.2-alpha.2 上装起来跑通？（派 builder 实测，跑 `pnpm check`）
2. 只用 headless / sdk profile 能否加载 superagent bundle？`webServer` 依赖怎么处理？
3. 对外接口选哪种：SDK JSON-RPC（stdio）、`/api` + `/api/remote.mux`（WebSocket）、还是两者都要？**这是契约问题，scout 给出对比后写进 QUESTIONS（类型：契约）。** MVP 需要多 session 并发和流式事件，选型时以这两点为准。
5. 市场连接器：dsh 已有 `packages/mcp`、插件管理（`packages/boot/plugin-manager`）和 `apps/plugin-market-generator`，先确认能否直接复用作为市场后端。
4. 0.18 的扩展注册表和 runner 中间件，哪些能直接用 cordis 插件表达，哪些需要新写？

出口：`app/sdk/` 能用一条命令起来；有一个最小客户端脚本能建会话、发消息、收到流式事件；测试是绿的。

## P3 契约（P1、P2 的结论都回来后）

目的：确定 Grok 风格前端和 SDK 之间的接口。两条候选路线先跑 `/panel D`，再写进 QUESTIONS 由用户拍板：
- A. 保留 0.78.1 的 renderer 外形，在 SDK 前面写一个适配层，模仿原版的 coordinator / host 接口（与 0.18 替换推理端口的思路一致）。
- B. 重写 renderer，直接对接 SDK 的接口。

产出：`work/<slug>/CONTRACT.md`。以后改这份文件，都要在 QUESTIONS 里提一个契约问题。

## P4 UI（MVP）

按 P1 的 UI 清单拆任务，每个任务走 SKILL.md §7.2。先打通一条真实链路：建 bot → 发消息 → 看到流式回复；然后是多个 session 同时开着、切换；最后是市场连接器页面。不做假数据页面。

MVP 的 DONE 条款示例（director 在 BRIEF 里定稿）：
- 同时开 3 个 bot，各自发消息，流式回复互不串线（浏览器或 Electron 截图为证）
- 关掉应用再打开，bot 列表和历史还在
- 在市场页安装一个 MCP 连接器，bot 能调用它的工具（日志为证）

## P5 远程与云端（MVP 之后，用户说开始再开始）

远程连接、SSH、云电脑 / box、实时画面、computer-use。

## P6 其他功能（顺序由用户定）

候选取自 0.18 / 0.78.1 / Compare.md：跨会话消息（`SendToAgent`）、群聊、自动化与定时、记忆、审批分级、浏览器、语音、bot 邮箱。

每个功能都是一个独立的 slug，完整走一遍：BRIEF → scout（先找现成 repo，用户也会补充 repo）→ 需要时 RE → PLAN → Build → 验收问题。用户新给的 repo 放进 `repos/`，交给 scout 写决策行。
