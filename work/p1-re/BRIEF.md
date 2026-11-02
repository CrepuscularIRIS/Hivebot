# p1-re · BRIEF v2 · 回应 G1-r1，见 panels/G1-r1-response.md（2026-11-01）
v2 审定 · 2026-11-01 · director（审改 10 处）

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
| 做法 | 每个 RE 直接在 0.78.1 解包树里回答问题 | 每个 RE 拿到对应的 0.18 路径当地图，逐项标「同 / 改 / 新 / 删 / 推定」，再给出 0.78.1 的证据锚点 |
| 代价 | 重复 0.18 已有成果；混淆代码没有名字，RE 慢；产物和 0.18 代码对不上，P4 复用 0.18 renderer 时还要再对一遍 | 容易被 0.18 带偏，漏掉 0.78.1 新增的子系统 |
| 防漏 | – | W0.5 用 0.18 原版 asar 做 4 轴机械 diff，另做只看 0.78.1、不依赖 0.18 的入口扫描归属表；新增项必须在某个 RE 中有归属（D7） |

**放弃 A 的理由**：A 的成本有一大半花在重新发现 0.18 已经写成可读代码的东西上；B 的产物天然带有「改哪个 0.18 文件」的映射，P3 选路线 A 时能直接用。

## 4. 逆向一问：三个月后 P1 被判失败，最可能的死因
1. **文档写得漂亮，P3/P4 却用不上**：锚点无法复现（`/dev/shm` 重启即丢），也没有按 MVP 旅程组织。防法：RE-unpack 记录 deb sha256 和解包命令；ipc-rpc 按 4 条 MVP 旅程列出最小方法集（D2、D3）。
2. **时间耗在非 MVP 区域**：box / VNC / computer-use 在 Grok Bot 里体量最大，最容易把 RE 吸进去。防法：§5 的清单级定义是硬约束，非 MVP 一项只占一行（D6）。
3. **市场没有数据源，到 P4 才发现**：0.18 的市场目录来自 Cursor 云端 dashboard 服务（`source/packages/proto/generated/aiserver/v1/dashboard_connect.ts` 的 `Marketplace*` 消息），大概率要登录。如果 0.78.1 也一样，MVP 的「浏览市场」就无源可拉。防法：marketplace 随并行批一起派发、不排后，Q1 第一个回答这件事（D4）。
4. **host 不在客户端里，RE 被迫拿 0.18 当答案（锚定偏差）**：0.78.1 的 host 由云端下发（`dist/electron-main/main-app.cjs#"incoming-host-bundle.tgz"`），解包树里没有 host 实现。防法：对照标记加「推定」并要求负证据（D2b、D2c）。产品判断：MVP 的后端是 dsh，P3 要的是客户端「期望 host 提供什么接口」，用不上 host 内部实现，因此 host 不可得对 MVP 伤害有限，前提是客户端边界画清楚。

## 5. 深度定义
- **深挖**：每个编号问题都要有答案、≥1 个证据锚点、0.18 对照（0.18 路径 + 同 / 改 / 新 / 删 / 推定）。锚点主格式为 `<路径>#"<字面串>"`，命中定义为 `grep -cF -- '<字面串>' <路径>` ≥1；字面串 ≥12 字符、不含单引号，优先选全文件唯一的。路径根：0.78.1 相对 `/dev/shm/grok-re/0.78.1/app/`，0.18 原版相对 `/dev/shm/grok-re/0.18.0/`，0.18 地图（含「对照：」行）相对 `repos/grok-bot-0.18-reconstructed/`。`<路径>:<行>` 只用于 RE-unpack 里标明未 minify 的文件；beautify 之后的行号不进锚点——字面串在 beautify 前后都能命中，不需要再维护一棵 beautify 树。`work/p1-re/evidence/` 下的截图也算锚点。
- **对照标记**：同 / 改 / 新 / 删 / 推定。推定 = 0.78.1 客户端里不可得，答案取自 0.18。标「推定」必须同时附：①负证据（一条可直接复跑的 `grep -rcF` 命令及 0 命中结果）；②不可得原因的正证据：host 侧固定引 `dist/electron-main/main-app.cjs#"incoming-host-bundle.tgz"`，云端侧引该端点 / 服务名的锚点；③0.18 路径。
- **清单**：只要一张表，列为 名称 | 位置 | 一句话用途 | MVP?（Y/N） | 0.18 对照。不追调用链，不还原协议字段。每个清单主题只派一次 RE，不补派。
- **非 MVP 项**（云电脑 / box、SSH、远程连接、VNC、computer-use、账号体系、移动端）：在任何 RE 里都只能作为表格行出现，不开小节。

## 6. 波次与问题（每个 RE 的派发提示：目标 `/dev/shm/grok-re/0.78.1/`，次选 `/opt/Grok Bot`，外加下面列出的 0.18 地图路径（根见 §5）、W0.5 表中归属本 RE 的新项；一律禁止拉取 host-bundle、禁止登录、禁止进入 box，也不靠运行应用去补齐答案，见 §8）
**W0（完成）unpack → `RE-unpack.md`**。已交付：deb sha256、可复现的解包命令、asar 文件树概览，以及与 0.18 的模块清单 diff。

**W0.5（待派，一个 RE，其余全部 RE 的前置）**
- **A 部分（4 轴机械 diff）**：0.18 原版产物在本机 `repos/grok-bot-0.18-reconstructed/research-archives/original/0.18.0/`：`windows-x64/Grok_Bot_0.18.0_Setup.exe`（125,825,552 B，PE32 NSIS）与 `macos-arm64/Grok_Bot_0.18.0.dmg`（155,793,020 B，zlib UDIF），均为实体文件，`sha256sum -c SHA256SUMS` 通过。从 Setup.exe 解出 0.18 原版 `app.asar`（x64，比 dmg 更接近 linux；dmg 作备选），记录 exe 与 asar 的 sha256，解到 `/dev/shm/grok-re/0.18.0/`。本机没有 7z / p7zip，bsdtar 两个安装包都打不开：`npm i --prefix /tmp/7zb 7zip-bin@5.2.0`，用其 `linux/x64/7za` 解 NSIS；7za 不认 NSIS 外壳时，按 7z 签名 `37 7A BC AF 27 1C` 从 exe 切出内嵌的 `app-64.7z`（Python 标准库，`-I` 运行）再解。不用 sudo（apt 装 7zip 需要 sudo，走用户）。asar 一律用 `npx -y @electron/asar@4.3.1 extract`。对比轴：①package.json 的 `@anysphere/*`、`@sand/*`；②renderer chunk 去 hash 后的语义名；③preload 入口及 contextBridge 暴露的键；④proto service / method 名。另回答两件事：0.18 asar 里是否真有 `dist/host`——有的话，「host 从本地移到 box 下发」就是一条有硬证据的「改」；package.json 依赖的 `@sand/host` 有多少被打进 main / coordinator——不能直接说「host 代码 0 字节」。
- **B 部分（入口扫描，只看 0.78.1，不依赖 0.18；即使 A 部分解不出来也照做）**：扫进程入口、IPC / service、路由 / chunk、扩展 id，每个新能力映射到「RE-x Qn」或「RE-x 清单行」或「非 MVP 行」。产出入口归属表，列为 入口文件 | 拉起方锚点（`fork` / `spawn` / `utilityProcess.fork` 附近的文件名字面串）| 职责一句话 | 归属 RE。`local-exec-daemon`、`node-agent-coordinator` 各一行，必须给出拉起方锚点；找不到就写「未知」并附负证据。
- 4 张 diff 表和入口表都由一个脚本生成，脚本放 `work/p1-re/w05/`，verifier 能复跑。同一脚本另从 0.78.1 `proto.cjs` 导出 message → 字段表到 `work/p1-re/w05/proto-fields.tsv`，供 ipc-rpc Q2 引用（不手抄）。结果替换 RE-unpack §5；旧 §5 是用 0.18 重建仓推导的，降级为「推导，已被 W0.5 取代」，只保留 W0.5 解不出来的行。另在 RE-unpack §0 补 `app.asar` 的 sha256，并把 `@electron/asar` 锁到具体版本——有了 asar 哈希，解包树就可以验证，与解包工具版本无关。
- **native 并入本波**（原单列的清单主题）：用 RE-unpack §3 的 9 行各加一句用途，产出 `RE-native.md`。
- **卡住处理**：解包失败两次，A 部分退回到重建仓推导，标「推导」；B 部分照常完成。

**并行批（W0.5 完成后全部并行派出，主会话按机器负载限流；取消 v1 的 W1 / W2 / W3 分波）**
- **ipc-rpc（深挖）**。0.18 地图：`frontend/src/recovered/contracts/`、`source/electron-preload/`、`source/electron-main/production-ipc-contract.ts`、`source/node-agent-coordinator/`、`source/host/gateway-protocol.ts`
  - Q1 进程拓扑：0.78.1 是否仍是 renderer→preload→main→coordinator→host？host 的交付机制是什么（`incoming-host-bundle.tgz` 云端下发，谁解包、谁启动）？host 只在云端 box 里，还是有本地模式？（「MCP 进程归 main 还是 host」不在本 RE 问，只在 marketplace Q3 回答。）
  - Q2 renderer 可调用的全部通道 / RPC 方法（名称、方向、是否流式、0.18 对应项）。另外单列「MVP 最小面」表，4 条旅程：①建 bot 并选 agent 配置→发消息→收流式回复；②多 session 同时开、切换；③市场安装 MCP→启用→bot 调用该工具→审批卡往返；④冷启动恢复 bot 列表和历史。每条旅程各用到哪些方法，给出计数；每条旅程一张静态链路表，列为 调用方锚点 → 方法 → 处理方锚点 → 事件 / 返回 → 边界。只对旅程用到的方法要求参数 / 返回：优先给可定位的 schema（如 `proto.cjs#"<pkg>.<Msg>"` 的 message 名，字段引用 W0.5 脚本从 proto.cjs 导出的结果，不手抄）；没有 schema 的 IPC 才在调用点按字面串列字段名；非 MVP 方法维持只列名。链路只追到客户端边界：在 main / coordinator 发往 host 或云端的那一跳截止，跨过边界的部分允许推定（附负证据）。0.78.1 如果没有「每个 bot 选 agent 配置」，旅程①该项写「新（复刻自建）」并附负证据。
  - Q3 流式事件：传输格式、多 session 并发怎么多路复用、断线后怎么重连和补发。
- **ui-shell（深挖）**。0.18 地图：`frontend/src/recovered/{features,ui}/`、`frontend/src/production/`、`frontend/manifests/`
  - Q1 路由 / 页面 / 顶层面板清单，标出 MVP 项，并对照 0.18 的 `recovered/features/*`。另外回答：未登录状态能到达哪些界面。
  - Q2 设计 token、字体、图标集、CSS 的位置，能否原样提取。输出资产清单（路径、大小、格式）。
  - Q3 MVP 页面的组件树，以及与 0.18 recovered 的差异。MVP 页面包括：bot 列表 / 侧栏；会话流（含工具调用卡和审批卡）；市场页；设置里的 bot / agent 配置。
- **marketplace（深挖）**。0.18 地图：`frontend/src/recovered/features/plugins/`、`source/electron-main/mcp/`、`source/host/extensions/mcp/`、上面的 `dashboard_connect.ts`
  - Q1 市场目录从哪里拉取（端点或服务方法）？要不要登录 token？有没有内置 / 离线目录或第三方源（GitHub、MCP registry）？
  - Q2 安装与启用的流程：有哪些步骤、落盘到哪里、插件 / MCP 的 manifest 格式；OAuth 连接器的授权流程（只要形状）。
  - Q3 MCP 进程由谁拉起——看客户端证据：main 里有没有 `mcp-core` 的 stdio spawn 锚点，还是 main 只把安装配置经 RPC 转给 host（给方法名）？工具调用和审批的往返只追到客户端边界。都找不到时答「host 侧，不可得」，附负证据，用 0.18 `source/host/extensions/mcp/` 推定。
- **features（深挖，只限多 bot / 多 session）**。0.18 地图：`frontend/src/recovered/features/roster/`、`source/host/{agents,groups,storage,transcript-mirror}/`
  - Q1 只问客户端看得到的模型：renderer / main 中 bot、agent 配置、session 的类型字面串、store 键、proto message。Primary Bot 与普通 bot 的差异只取客户端证据，其余标推定。
  - Q2 冷启动链路（对应旅程④）：重启后 renderer / main 从哪里拿 bot 列表和历史——是 userData 下的本地文件（给路径字面串），还是 host RPC（给方法名）？main 本地落盘写什么？host 内部存储（0.18 `source/host/storage`）只占一行，标推定。
  - Q3 引用 ipc-rpc Q3 的多路复用结论，只补 bot 维度：renderer 怎么同时订阅多个 bot 的流而不串线。
  - 另附一张清单表：跨会话消息、群聊、自动化、记忆、审批分级，各写位置、一句话说明、0.18 对照。
  - features Q1 与 ipc-rpc 旅程①的结论若不一致，由 director 在 ARCH 合并时裁决，不补派。
- **cloud-deps（清单）**：所有云端端点 / 服务（推理、box、账号、遥测、更新、市场、团队），列为 端点或服务名 | 调用方（renderer / main / host） | MVP 是否需要本地替身 | 非 MVP 键。0.18 地图：`source/packages/proto/generated/aiserver/v1/`
- **host-ext（清单）**：改为「客户端可见的 host 面」，四张表：①host 交付机制（bundle 路径、`host_bundle_channel` 开关、谁解包谁启动）；②main / coordinator 引用的扩展 id 和能力枚举（字面串锚点）；③客户端与 host 之间的通道和方法名（只到边界）；④0.18 的 35 个扩展回退表——每行标推定，附 `grep -rlF '"<id>"' dist` 0 命中的负证据，或写「仅出现在 coordinator 枚举」。启动顺序只问「客户端侧可观测的启动顺序」，host 内部的启动顺序标推定。0.18 地图：`source/host/extensions/registry.ts`。

**出口**：director 合并成 `work/p1-re/ARCH-0.78.md`，共五节：mermaid 架构图、UI 清单、云端依赖表、「P3 输入」、「已知未覆盖」。「P3 输入」写四样东西：路线 A 所需的最小接口面、renderer 直连云端的点数、需要本地替身的云服务、全部推定项清单（即 P3 的风险清单，D2c）。「已知未覆盖」记 W0.5 之后才发现、按约不补派 RE 的新项（D7）。

## 7. DONE 条款（verifier 逐条证伪）
- D1 `ls work/p1-re/RE-{unpack,ui-shell,ipc-rpc,marketplace,features,cloud-deps,host-ext,native}.md` 8 个文件全部存在。
- D2 每份深挖 RE 的每个 Q 下都有 4 行：「答案：」「对照：」「证据：」「未知：」（「未知：」允许写「无」），缺一行即 FAIL。verifier 从每份深挖 RE 随机抽 3 个锚点，在解包树（不在了就按 RE-unpack 的命令重新解包）里按 §5 的命中定义验证（`grep -cF -- '<字面串>' <路径>` ≥1），有 1 个不中即 FAIL。
- D2b 每个深挖 Q 的「对照：」行为「<0.18 路径或 —> | 同/改/新/删/推定」：0.18 路径必须能 `ls` 到；标「同」「改」的附 0.78.1 锚点；标「删」「推定」的附负证据命令；标「新」的 0.18 路径写「—」。verifier 每份深挖 RE 抽 3 行做机械检查。
- D2c `ARCH-0.78.md` 的「P3 输入」节列出全部推定项（即 P3 的风险清单），每项都能在对应 RE 里 grep 到「推定」行。
- D3 RE-ipc-rpc 有「MVP 最小面」表，4 条旅程都有行、各有静态链路表。verifier 随机抽 1 条完整旅程，链路表上该旅程的所有锚点都要命中；链路核验只适用客户端边界以内——在 main / coordinator 发往 host 或云端的那一跳截止，跨边界环节允许推定（附负证据）。方法名核验限定在 `dist/renderer`、`dist/electron-preload`，用带引号的全名，泛名改带 service 前缀。
- D4 RE-marketplace 对「目录是否需要登录」给出 是 / 否 / 部分 的明确结论并附证据。结论为「是」或「部分」时：scout 在 P1 内即派出（与 RE 并行），且 RE-marketplace 须引用一份已核实的公开目录样例和安装字段映射；拿不到就在 `work/QUESTIONS.md` 写阻塞项。
- D5 RE-ui-shell 资产清单里列出的 token / 字体 / 图标文件路径，在解包树中 `ls` 全部存在。截图范围按待用户确认第 1 条执行，且至少包含未登录可达页面各 1 张；截图一律以 `--user-data-dir=/tmp/grok-p1-profile` 启动截取，不碰任何登录框。
- D6 非 MVP 项不开小节的 lint：`grep -iE '^#+.*(\bbox\b|云电脑|ssh|vnc|computer[- ]?use|账号体系|移动端|远程连接)' work/p1-re/RE-*.md | grep -vE '^[^:]+:#+ Q[0-9]+ '` 输出必须为空；豁免只认 `^#+ Q[0-9]+ ` 这种完整编号边界的问题标题。正文里的命中由 verifier 逐条看，每处只允许 ≤1 句边界说明。RE-cloud-deps 表固定一列「非 MVP 键」，7 个键（box / 云电脑、ssh、远程连接、vnc、computer-use、账号体系、移动端）各占至少一行，没有端点就写「无端点」。
- D7 W0.5 的 4 张 diff 表和入口归属表中每个「新」项，都能在某份 RE 中 grep 到归属行，不允许悬空；D7 只校验 W0.5 表（RE-unpack 旧 §5 已降级为推导，不作为输入）。W0.5 表中的新项在派发时写进对应 RE 的提示；派发后才发现的新项不补派 RE，记入 ARCH 的「已知未覆盖」节。W0.5 本身：verifier 复跑 `work/p1-re/w05/` 脚本，输出与 RE-unpack §5 的表 `diff` 为空；入口表 `local-exec-daemon`、`node-agent-coordinator` 两行的拉起方锚点按 §5 命中，或为「未知」+ 可复跑负证据。
- D8 `ARCH-0.78.md` 包含 §6 出口列出的五节，且可溯源：表格数据行（`^\|`，表头行与分隔行豁免）必须含 `RE-[a-z0-9-]+\.md §`；每个 mermaid 块后面紧跟一行「来源：RE-x §n」；标题、空行、围栏豁免。lint 命令（紧邻分隔行之前的一行判为表头，自动豁免）：`awk '/^\|[-:| ]+$/{h="";next} {if(h!="")print h; h=""} /^\|/ && !/RE-[a-z0-9-]+\.md §/{h=$0} END{if(h!="")print h}' work/p1-re/ARCH-0.78.md`，输出必须为空。verifier 另抽 3 个链接，检查对应 RE 文件的 § 存在。

## 8. 非目标与放弃（及理由）
- **不追 host 内部实现**：host 不随 deb 发布（`dist/electron-main/main-app.cjs#"incoming-host-bundle.tgz"` 云端下发）。禁止拉取 host-bundle、禁止登录、禁止进入 box，也不靠运行应用去补齐答案；客户端边界以内拿不到的一律 0.18 推定 + 负证据（§5）。
- **不还原 0.78.1 可读源码，也不反混淆整个 renderer**：0.18 recovered 已经是底图。P3 如果选路线 A，再针对性还原差异部分。
- **不维护 beautify 行号树**：锚点主格式是字面串，beautify 前后都能命中（§5）；`路径:行` 只用于 RE-unpack 标明未 minify 的文件。
- **不动态抓包云端流量**：需要登录，碰凭证红线。云端只做到「端点名 + 静态可见的请求形状」。
- **跨会话消息、群聊、自动化、记忆、审批分级降为清单**（roadmap 原写跨会话消息要深挖）：它们不在 MVP 里，P6 每个功能有自己的 slug，届时会再做 RE，现在深挖到那时已经过期。审批卡只作为会话流组件出现在 ui-shell Q3 里，因为 MVP 调用 MCP 工具时就会弹出来。
- **不做 native 模块的替换决策**：只列用途，等 P3/P4 真用到时再决定。
- **不做竞品分析**：Compare.md 留给 P6 排优先级，P1 只引用其中的版本事实。
- **不改 0.18 参考仓**：只读（W0.5 从其 `research-archives/original/` 解 0.18 原版产物，同样只读）。

## 9. 待用户确认（默认值先执行，不阻塞）
1. **截图**：`/opt/Grok Bot` 已装 0.78.1。能否由你本人登录后，让 RE 截取 MVP 页面？截图可能带有你账号的个人数据。凭证全程不进模型。暂按「不登录」执行，待 Q-002 答复：只截未登录可达的页面，其余靠静态分析，且一律以 `--user-data-dir=/tmp/grok-p1-profile` 启动，不碰任何登录框；用户若选登录，再由你本人登录后补截 MVP 页面。
2. **降级**：跨会话消息由深挖降为清单（§8），暂按清单执行，待 Q-003 答复；用户若拒绝则补深挖。

## 10. 待查（主会话派发）
- → reverse-engineer ×1（W0.5，其余全部 RE 的前置）：A / B 部分见 §6——0.18 原版 asar 的 4 轴机械 diff、只看 0.78.1 的入口扫描归属表、生成脚本（`work/p1-re/w05/`）、`RE-native.md`；替换 RE-unpack §5，补 RE-unpack §0 的 app.asar sha256 与 `@electron/asar` 版本锁。
- → reverse-engineer ×6（W0.5 完成后全部并行，主会话按机器负载限流）：ipc-rpc、ui-shell、marketplace、features、cloud-deps、host-ext，问题见 §6。
- → scout（仅当 D4 结论为「是」或「部分」时，P1 内即派，与 RE 并行）：无账号市场目录的替代源可行性，候选包括 MCP 官方 registry、dsh `apps/plugin-market-generator`、公开的插件 marketplace JSON。并入 `work/p2-sdk/reuse/market-backend.md`，不另起文件。
- → /panel D：本 BRIEF 无。路线 A/B 留给 P3。

## 修订账
（空。G1 未通过，v1→v2 的改动不计账，逐条对照见 `panels/G1-r1-response.md`；G1 通过后对 DONE 条款的任何改动都记在这里，PROTOCOL:81。）
