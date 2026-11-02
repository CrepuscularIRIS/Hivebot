# p1-re · BRIEF v1（director，2026-11-01）

## 1. 需求证明
- **谁用产出**：P3 契约 panel（路线 A 保留 renderer / B 重写，要知道接口面多大）；P4 ux-proposer / frontend-dev（照抄 UI）；P2/P3 director（哪些云端能力要做本地替身）。
- **现在怎么凑合**：`repos/grok-bot-0.18-reconstructed/` 已有 0.18 的可读重构：renderer 约 300 文件 / 5.2 万行（`frontend/src/recovered/`），IPC 契约（`frontend/src/recovered/contracts/`），35 个 host 扩展，proto（`source/packages/proto/`）。
- **凭什么还要 P1**：0.18 到 0.78.1 隔了约 60 个周更版本，MVP 涉及的三块（UI 外观、多 bot、市场）都可能已经变了（Compare.md：9/26 Team Bots，10/23 Vault 与审批卡改动）。所以 P1 的真实价值是 **0.78.1 相对 0.18 的差异，加上 MVP 的最小接口面**，不是从零再画一遍。
- 事实更正：roadmap 写「本机没有安装」，实际 `dpkg -l` 显示 grok-bot 0.78.1 已装在 `/opt/Grok Bot`，可作为解包树之外的第二来源。

## 2. 范围模式：HOLD
MVP 边界用户已定。roadmap 的 7 个主题全部保留，不新增主题。在 HOLD 内只做三件事：定深度、定问题、排波次。唯一的降级（跨会话消息，见 §8）交 panel 和用户确认。

## 3. 路线（选 B）
| | A：从零逆向 | **B：以 0.18 为底图做差分** |
|---|---|---|
| 做法 | 每个 RE 直接在 0.78.1 解包树里回答问题 | 每个 RE 拿到对应的 0.18 路径当地图，逐项标「同 / 改 / 新 / 删」，再给出 0.78.1 的证据锚点 |
| 代价 | 重复 0.18 已有成果；混淆代码没有名字，RE 慢；产物和 0.18 代码对不上，P4 复用 0.18 renderer 时还要再对一遍 | 容易被 0.18 带偏，漏掉 0.78.1 新增的子系统 |
| 防漏 | – | W0 先做一次模块清单 diff，新增项必须在某个 RE 中有归属（D7） |

**放弃 A 的理由**：A 的成本有一大半花在重新发现 0.18 已经写成可读代码的东西上；B 的产物天然带有「改哪个 0.18 文件」的映射，P3 选路线 A 时能直接用。

## 4. 逆向一问：三个月后 P1 被判失败，最可能的死因
1. **文档写得漂亮，P3/P4 却用不上**：锚点无法复现（`/dev/shm` 重启即丢），也没有按 MVP 旅程组织。防法：RE-unpack 记录 deb sha256 和解包命令；ipc-rpc 按 3 条 MVP 旅程列出最小方法集（D2、D3）。
2. **时间耗在非 MVP 区域**：box / VNC / computer-use 在 Grok Bot 里体量最大，最容易把 RE 吸进去。防法：§5 的清单级定义是硬约束，非 MVP 一项只占一行（D6）。
3. **市场没有数据源，到 P4 才发现**：0.18 的市场目录来自 Cursor 云端 dashboard 服务（`source/packages/proto/generated/aiserver/v1/dashboard_connect.ts` 的 `Marketplace*` 消息），大概率要登录。如果 0.78.1 也一样，MVP 的「浏览市场」就无源可拉。防法：marketplace 放进 W1，Q1 第一个回答这件事（D4）。

## 5. 深度定义
- **深挖**：每个编号问题都要有答案、≥1 个证据锚点、0.18 对照（0.18 路径 + 同 / 改 / 新 / 删）。锚点格式为 `<解包树相对路径>:<行>`、`<路径>#<符号或字符串>`，或 `work/p1-re/evidence/` 下的截图。
- **清单**：只要一张表，列为 名称 | 位置 | 一句话用途 | MVP?（Y/N） | 0.18 对照。不追调用链，不还原协议字段。每个清单主题只派一次 RE，不补派。
- **非 MVP 项**（云电脑 / box、SSH、远程连接、VNC、computer-use、账号体系、移动端）：在任何 RE 里都只能作为表格行出现，不开小节。

## 6. 波次与问题（每个 RE 的派发提示：目标 `/dev/shm/grok-re/0.78.1/`，次选 `/opt/Grok Bot`，外加下面列出的 0.18 地图路径）
**W0（在途）unpack → `RE-unpack.md`**。追加要求：deb sha256、可复现的解包命令、asar 文件树概览，以及与 0.18 的模块清单 diff（新增 / 删除的目录和 bundle）。

**W1 并行（P3/P4 关键路径）**
- **ipc-rpc（深挖）**。0.18 地图：`frontend/src/recovered/contracts/`、`source/electron-preload/`、`source/electron-main/production-ipc-contract.ts`、`source/node-agent-coordinator/`、`source/host/gateway-protocol.ts`
  - Q1 进程拓扑：0.78.1 是否仍是 renderer→preload→main→coordinator→host？host 只在云端 box 里，还是有本地模式？
  - Q2 renderer 可调用的全部通道 / RPC 方法（名称、方向、是否流式、0.18 对应项）。另外单列「MVP 最小面」表：①建 bot→发消息→收到流式回复 ②多个 session 同时开、切换 ③在市场安装 MCP 并启用。每条旅程各用到哪些方法，给出计数。
  - Q3 流式事件：传输格式、多 session 并发怎么多路复用、断线后怎么重连和补发。
- **ui-shell（深挖）**。0.18 地图：`frontend/src/recovered/{features,ui}/`、`frontend/src/production/`、`frontend/manifests/`
  - Q1 路由 / 页面 / 顶层面板清单，标出 MVP 项，并对照 0.18 的 `recovered/features/*`。另外回答：未登录状态能到达哪些界面。
  - Q2 设计 token、字体、图标集、CSS 的位置，能否原样提取。输出资产清单（路径、大小、格式）。
  - Q3 MVP 页面的组件树，以及与 0.18 recovered 的差异。MVP 页面包括：bot 列表 / 侧栏；会话流（含工具调用卡和审批卡）；市场页；设置里的 bot / agent 配置。
- **marketplace（深挖）**。0.18 地图：`frontend/src/recovered/features/plugins/`、`source/electron-main/mcp/`、`source/host/extensions/mcp/`、上面的 `dashboard_connect.ts`
  - Q1 市场目录从哪里拉取（端点或服务方法）？要不要登录 token？有没有内置 / 离线目录或第三方源（GitHub、MCP registry）？
  - Q2 安装与启用的流程：有哪些步骤、落盘到哪里、插件 / MCP 的 manifest 格式；OAuth 连接器的授权流程（只要形状）。
  - Q3 装好的插件工具怎么被 bot 调到？MCP 进程由 main 管还是由 host 管？

**W2 并行**
- **features（深挖，只限多 bot / 多 session）**。0.18 地图：`frontend/src/recovered/features/roster/`、`source/host/{agents,groups,storage,transcript-mirror}/`
  - Q1 bot 的数据模型：bot、agent 配置、session / thread 三者是什么关系？Primary Bot 和普通 bot 有什么区别？
  - Q2 bot 列表和历史存在哪里（本地文件 / SQLite / 云端）？重启后从哪里恢复？
  - Q3 renderer 怎么同时订阅多个 bot 的流而不串线？
  - 另附一张清单表：跨会话消息、群聊、自动化、记忆、审批分级，各写位置、一句话说明、0.18 对照。
- **cloud-deps（清单）**：所有云端端点 / 服务（推理、box、账号、遥测、更新、市场、团队），列为 端点或服务名 | 调用方（renderer / main / host） | MVP 是否需要本地替身。0.18 地图：`source/packages/proto/generated/aiserver/v1/`

**W3 由一个 RE 产出两份文件**
- **host-ext（清单）**：对照 0.18 的 `source/host/extensions/registry.ts`（35 个扩展），列出新增 / 删除项和启动顺序。
- **native（清单）**：每个 `.node` 模块做什么、MVP 需不需要。

**出口**：director 合并成 `work/p1-re/ARCH-0.78.md`，共四节：mermaid 架构图、UI 清单、云端依赖表、「P3 输入」。「P3 输入」写三样东西：路线 A 所需的最小接口面、renderer 直连云端的点数、需要本地替身的云服务。

## 7. DONE 条款（verifier 逐条证伪）
- D1 `ls work/p1-re/RE-{unpack,ui-shell,ipc-rpc,marketplace,features,cloud-deps,host-ext,native}.md` 8 个文件全部存在。
- D2 每份深挖 RE 的每个 Q 下都有「证据：」行。verifier 从每份深挖 RE 随机抽 3 个锚点，在解包树（不在了就按 RE-unpack 的命令重新解包）里 `grep -n` 或 `ls` 必须命中。有 1 个不中即 FAIL。
- D3 RE-ipc-rpc 有「MVP 最小面」表，3 条旅程都有行。随机抽 5 个方法名，在 renderer bundle 里 `grep` 都能命中。
- D4 RE-marketplace 对「目录是否需要登录」给出 是 / 否 / 部分 的明确结论并附证据。如果结论是「是」或「部分」，至少列出 1 个不需要账号的替代源候选（交 scout 核实）。
- D5 RE-ui-shell 资产清单里列出的 token / 字体 / 图标文件路径，在解包树中 `ls` 全部存在。截图范围按待用户确认第 1 条执行，且至少包含未登录可达页面各 1 张。
- D6 `grep -E '^#+.*(box|SSH|VNC|computer-use|账号|移动端|远程)' work/p1-re/RE-*.md | grep -vE '^[^:]+:#+ Q[0-9]'` 输出为空（非 MVP 项不开小节；问题标题 `### Qn` 引用原题时不算）；RE-cloud-deps 对上述 7 项各有 1 行。
- D7 RE-unpack 模块 diff 中每个「新」项，都能在某份 RE 中 grep 到归属行，不允许悬空。
- D8 `ARCH-0.78.md` 包含 §6 出口列出的四节，每节的每一行都链接回某个 `RE-*.md`。

## 8. 非目标与放弃（及理由）
- **不还原 0.78.1 可读源码，也不反混淆整个 renderer**：0.18 recovered 已经是底图。P3 如果选路线 A，再针对性还原差异部分。
- **不动态抓包云端流量**：需要登录，碰凭证红线。云端只做到「端点名 + 静态可见的请求形状」。
- **跨会话消息、群聊、自动化、记忆、审批分级降为清单**（roadmap 原写跨会话消息要深挖）：它们不在 MVP 里，P6 每个功能有自己的 slug，届时会再做 RE，现在深挖到那时已经过期。审批卡只作为会话流组件出现在 ui-shell Q3 里，因为 MVP 调用 MCP 工具时就会弹出来。
- **不做 native 模块的替换决策**：只列用途，等 P3/P4 真用到时再决定。
- **不做竞品分析**：Compare.md 留给 P6 排优先级，P1 只引用其中的版本事实。
- **不改 0.18 参考仓**：只读。

## 9. 待用户确认（默认值先执行，不阻塞）
1. **截图**：`/opt/Grok Bot` 已装 0.78.1。能否由你本人登录后，让 RE 截取 MVP 页面？截图可能带有你账号的个人数据。凭证全程不进模型。**默认：不登录**，只截未登录可达的页面，其余靠静态分析。
2. **降级**：跨会话消息由深挖降为清单（§8），是否同意？**默认：同意**。

## 10. 待查（主会话派发）
- → reverse-engineer（W0 在途，补充要求）：RE-unpack 补上 deb sha256、可复现的解包命令、与 0.18 的模块清单 diff。
- → reverse-engineer ×3（W1，并行）：ipc-rpc、ui-shell、marketplace，问题见 §6。
- → reverse-engineer ×2（W2，并行）：features、cloud-deps。
- → reverse-engineer ×1（W3）：host-ext 和 native 两份文件。
- → scout（仅当 D4 结论为「是」或「部分」时）：无账号市场目录的替代源可行性，候选包括 MCP 官方 registry、dsh `apps/plugin-market-generator`、公开的插件 marketplace JSON。并入 `work/p2-sdk/reuse/market-backend.md`，不另起文件。
- → /panel D：本 BRIEF 无。路线 A/B 留给 P3。

## 修订账
（空。G1 之后对 DONE 条款的任何改动都记在这里。）
