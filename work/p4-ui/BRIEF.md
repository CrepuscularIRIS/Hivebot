# BRIEF · p4-ui（Grok 风格前端 MVP，4 页封顶）

v1.2 · 2026-11-02 · director（Opus 5.5）· 输入：`work/p3-contract/CONTRACT.md` v1.3（下称 C）、`panels/G1-r2{,-A,-B}.md`、`p1-re/RE-ui-shell.md`、`p1-re/evidence/01-boot.png`、`p1-re/ARCH-0.78.md` §4、`p3-contract/reuse/dsh-client-packages.md`（下称 scout-C）、QUESTIONS Q-008/Q-009、LEARNINGS、本目录 `panels/G1-r1{,-A,-B}.md`。
口径：接口形状一律以 C 为准，本 BRIEF 不改任何接口；P4 任务需要改接口时，写 QUESTIONS（契约类）。

## 1. 目标与需求证明
- **谁用**：用户本人，私用。P4 交付的就是用户说的「先把 demo 跑出来」的那个 demo：一个桌面窗口，能建多个 bot、和它们对话、给它们装连接器。
- **现在怎么凑合**：Grok Bot 0.78.1 不登录 x.ai/Cursor 账号只能看到封面（01-boot.png，AX 树 46 个节点）；P2 SDK 只能通过 CLI 和测试驱动，没有界面。
- **凭什么换成我们的**：本地 dsh 后端，模型走 LiteLLM，不需要账号；连接器按 bot 启用；审批默认是「问」。外观沿用 Grok 的品牌和 token。
- **没有证明的部分**：「Grok 风格」的像素级还原对用户价值多大，没有证据。只要求 token、字体、品牌级别的风格对齐，不追求像素一致（§4）。

## 2. 范围模式：HOLD
用户已经定了 4 页封顶，C §1 的旅程和 C §6 的排除项都过了 G1，照单做好，不扩也不砍。范围是 4 页加 C §7.4 的首日 spike：
| 页 | 内容（RE-ui-shell 对应物） | 不含 |
|---|---|---|
| P-A bot 列表/侧栏 | 主 bot 置顶、bot 项、运行态角标、新建入口（最小建 bot 对话框：preset + 模型）、市场入口（§3.1 AgentsSidebar 去掉账号脚部、section、多选） | 拖拽、pin、分组、搜索 palette |
| P-B 会话流 | 消息气泡、逐 chunk 流式、tool-call 紧凑行（wrench/loading/x-circle）、审批卡（按 callId 挂在行下）、composer、打断 | 33 型 send-message 卡、12 型 event 卡、info-pane、语音 |
| P-C 市场 | 目录源列表、搜索、详情、安装（固定 `enabled:false`）、已装列表（§3.3 只做 plugins tab） | bots/模板 tab、技能、发布、自定义插件 |
| P-D 设置·bot 配置 | 建 bot 对话框补连接器勾选、bot 头部只读配置、改模型、「用此配置新建」、主 bot 设定、失效态显示 | general/integrations/computer/permissions/vault/usage/updates 七节 |
**明确不做**：75 个 lazy entrypoint 中除上表以外的全部；云电脑、box、SSH、VNC、computer-use、账号（登录、AccessGate、onboarding、getAccessToken）、计费、语音、Teams/Slack/OAuth、bot 模板市场（C §6）；superagent 主 bot 思路①（C §5，默认②）；**任何权限 preset 切换入口**（§D9）。

## 3. 路线（强制双方案）
| | A 第 2 级集成（**选**） | B 第 3 级改造：去掉 Cordis，复制 JSX 自建 React 壳 |
|---|---|---|
| 做法 | git submodule 接入 `repos/deepseek-harness@ce7073d`（到 `app/ui/vendor/`，submodule 内 build）后 workspace 引用其 `packages/client/*` 和 `api/*/src/client`，原样不改；保留浏览器 Cordis、SlotRegistry、store、ClientSessions，以及 ui-chat、ui-approval、ui-tool、ui-plugin-market 等（C §2.1）；替换 root/layout 壳、bot 导航、品牌 slot、theme 插件和 Connection carrier | 只搬 `*.tsx` 展示层，注入 hooks、slot 渲染器、session 作用域、controller，全部自己补 |
| 代价 | 插件闭包可能偏大（chat 要 sidebarRight/fileDrag，uiSession 要 remoteAccess），只能靠 spike 实测才知道 | 装配和订阅逻辑归我们自己维护，上游修 bug 我们拿不到，违背「搬运工优先」 |
**放弃 B 的理由**：scout-C:18 判它为第 3 级，只在「不允许保留 Cordis」时才用；npm latest 版本与已核实的源码不一致（scout-C:17），第 1 级也走不通。B 只留作 spike 止损后的回退路线（§7 W0）。路线 C（保留 0.78.1 renderer 加适配层）已被 Q-007 否决。
**样式**：按 scout-C §4，新写一个 theme 插件，把 Grok 的色板、间距、圆角映射到 `--dsw-*` token，字体映射到 `--dsh-font-family-text/code`，品牌 wordmark 走其独立变量（scout-C:160-162）；图标由 woff2 字形导出 SVG 后按 icon id 替换（待查 1④）；品牌换掉 `ui-brand-official`。**不**全局导入 Grok 那份 766KB stylex CSS，不引入 Tailwind 或其他样式库。

## 4. 逆向一问：三个月后 P4 失败，最可能的死因
1. **桥和闭包拖死 demo**：W0 一天里同时搭壳、搭桥、量闭包，三件都做一半又没有超时规则，悄悄拖成 W1。防线：W0 前置待查 2；spike 桥只做到 spike 级；止损线加时限（§7 W0）。
2. **静默降级**：连接器 bot 刚建好就变成只读，一次失败的创建卡住所有 bot 的冷启动，或审批卡永远挂着。防线：§8 四条附加要求各有 DONE（D7–D10），单测加 E2E 双证据；失效态必须显示（D10c），审批无人应答必须有终态（D4③）。
3. **长得像 dsh，不像 Grok**：防线：先补 token 表和图标表（待查 1），每页 ux-proposer 的输入固定为 RE 组件树 + 01-boot.png + token 表，/panel GU 跑一轮；D12③ 加 computed-style 断言。

## 5. 用户与核心旅程（≤3）
1. **建 bot 并对话**（C J1+J2）：冷启动后看到主 bot → 新建 bot（选 preset、模型，连接器可选）→ 发消息看流式回复 → 多个 bot 同时干活，切换时互不干扰。
2. **装连接器并安全使用**（C J3+A）：市场浏览 → 安装 → 建 bot 时勾选 → bot 调工具 → 审批卡上批准或拒绝。
3. **第二天接着用**（C J4、J3×J4）：退出后重开，bot 列表、主 bot、历史都还在；连接器 bot 能用，或者明确显示为失效。

## 6. DONE 条款（证据放 `work/p4-ui/evidence/`，E2E 用 playwright 驱动 Electron，截图随附）
通用约束：测试一律在临时目录跑（`HOME=/tmp/bot-p4-<任务>`，`PBOTS_DATA_DIR` 同样指向临时目录）；确定性断言用 P2 的 fake LLM（K≥3 个 chunk，带首块屏障），preset 用 `app/sdk/profile/patches/presets.yml` fixture（p2-alpha/p2-beta，经 P2SDK_PATCH 注入）；另用 LiteLLM glm 5.3 flash 跑一次真模型冒烟（Q-002）。「重启」只用 playwright 的 `electronApp.close()` 后再 launch，shell 里不手工 kill 任何进程（CLAUDE.md §5）。**[T-16]** 标记的子项在 T-16（preset.ensure）合入 main 前为 blocked，不连带同条其他子项。
| # | 条款（对应 C） | 证伪方式（任一不成立即 FAIL） |
|---|---|---|
| D1 | J1：用两个不同 preset 各建一个 bot，各发一条消息，回复逐 chunk 出现 | fake LLM 发出首块后挂起，此时 DOM 里有部分文本、没有定稿气泡；放行后 chunk 文本分 ≥3 步增长，最后被 assistant/message 定稿替换；两个 bot 的 header.agentPreset 分别为 p2-alpha、p2-beta |
| D2 | J2：三个 bot 并发流式，不串线 | A、B、C 的 fake 回复各带本 bot 独有的标记；A 正在流式时切到 B 发消息、再切到 C 发消息；三轮结束后每个 transcript 只含自己的标记；**在 main 的 M2 原帧 tap 计数**，A 的 chunk 数等于 K；切回 A 显示完整定稿消息，无残留半截流 |
| D3 | 审批往返（C §4 不变式） | X 的模型调 bash → 审批卡只出现在 X 的会话流，挂在对应 callId 的 tool-call 行下，Y 的会话流里没有；点拒绝 → 副作用文件不存在，tool/result 是错误；再来一次点批准 → 副作用文件存在；UI 没有「始终允许」入口 |
| D4 | $events 补发与 fail-closed（C §4、§7.2） | 审批卡未决时：① 重载 renderer → 卡片重新出现（clientId 是新的），批准后正常执行；② main 断开 mux socket 再重连 → 结果同 ①（①② 只验宽限内补发）；③ 无人应答且交互客户端断开：观察窗口 = 2× 已知超时，未知时固定 5 分钟；窗口内必须出现拒绝/错误终态（tool/result 错误或 decided≠allowed），且全程零副作用。窗口到期仍 pending → FAIL，记实测「无超时」，转修复任务 |
| D5 | J3 市场（对齐 P2 T-09） | 用 T-09 选定的目录源和连接器走一遍：P-C 浏览 → 安装（main 收到的 `enabled` 恒为 false）→ P-D 建 bot X 时勾选 → X 的一轮对话里出现该工具的 tool-call 行和结果；同时建一个没勾选的 bot Y，Y 的工具表里没有这个工具。T-09 没合入时 blocked |
| D6 | J4 + J3×J4 重启恢复（Q-008=A） | a（J4 主干，不 blocked）close 后重开，bot 列表、主 bot（置顶，没有删除入口）、各 bot 的历史（含 #11 分页取更早的记录）都在，普通 bot 发消息能收到回复；b **[T-16]** 连接器 bot 不是只读态，能调用它的工具 |
| D7 | §8-1 失败配方隔离 | 直接调 M1 #4 传未安装的连接器（UI 候选只来自已装列表，选不到）→ UI 报错，列表里不出现这个 bot → 重启 → 其他 bot 能用；单测：孤儿处理不删除被其他 session 共用的 recipe；**[T-16]** 另一个连接器 bot 重启后仍可用、一个 recipe ensure 失败不阻塞 M1/M2 就绪（与 D10c 合并验证） |
| D8 | §8-2 preset id 单点解析 | 两次建连接器 bot，一次省略 agentPreset、一次显式传 defaultId，两次的 `header.agentPreset === presetIdOf(defaultId, 排序后的 connectors)` 都成立，且两个 bot 都非只读；**[T-16]** 重启后仍非只读；单测：p2temp 和 presetIdOf 收到缺省 agentPreset 时抛错 |
| D9 | main 边界拒绝（§2.2 三条 + §8-3），**永久判据** | 直接调 M1，下面每种请求都返回 `{ok:false,error:{code:'pbots/forbidden'或'pbots/invalid-args'}}`，并断言 dsh 没有收到调用：installBundle 省略 enabled；installBundle `enabled:true`；`$events/result` 传 `'allowed-always'`，或 clientId/eventId 不匹配；以 `/permission` 开头的 `commands/execute` 行；任何 configForms 写操作；任何 credentials/account 方法。DOM 里没有权限 preset 切换入口（不加载 ui-permission-presets，或只读显示），never 类权限 preset（danger-full-access）不出现在任何可选列表。**Q-009=A 只改 SDK 侧 shell-ask（T-12.f1：尊重用户在 profile 里显式配置的 never），不授权 P4 UI 暴露该选项**；本条全部拒绝与任何 QUESTIONS 答复无关，放宽须引用户原话另开安全红线问题。T-12.f1 未合入期间，只有「never preset 下 bash 放行」这一条 SDK 侧验证 blocked，本条不受影响 |
| D10 | §8-4 五条 LOW | a 判断 preset 已存在用 `definitions.has` 加按 id 的 in-flight 表：并发两次 #4 同一个 id 都成功、只 register 一次，grep 不到对 `Duplicate agent preset` 文案的匹配；b 编排顺序单测：mock dsh #4 抛错或挂起时 recipe 已落盘，抛错留下的孤儿 recipe 不出现在 bot 列表；**E2E**：屏障停在 recipe 已落盘、session 已建而 #4 响应未返回时重载 renderer → 同一 session 恢复且连接器配置完整（C:96）；c **[T-16]** #21 按 allSettled，失败的 recipe 标 `live=false`；**E2E**：临时 HOME 里删掉某已装连接器的 bundle → close 再 launch → 该 bot 显示「连接器已失效，请新建 bot」，不自动重试，其他 bot 正常；d bots.json v1 不含 `bots` 字段，runtime 一律推导为 `'dsh'`；e bots.json 写入走单一 Promise 队列：N 个并发 patch 和 recipe 写全部落盘，没有丢更新 |
| D11 | 品味项（C §7.5） | 建 bot 对话框明示「配置随 bot 固定，换配置需新建」；bot 头部只读显示 preset 和连接器，提供「用此配置新建」；模型可以改（#5 只对本 bot 生效）；DOM 里不存在改 preset 或连接器的入口 |
| D12 | 拓扑、范围与外观 | ① renderer 没有任何外网请求（playwright 网络日志只出现本地资源），window 和 DOM 里搜不到 launch token；② DOM 里没有 Sign in、账号、computer、SSH、billing 相关入口；③ computed-style：body 的 font-family 含 XVF，抽 ≥5 个 `--dsw-*` 值等于 token 表；4 页亮/暗各截一张图，/panel GU 一轮 PASS |

## 7. 波次建议（PLAN 细化；UI 任务的 owner 是 frontend-dev，桥任务的 owner 是 builder）
- **W0 首日 spike**（C §7.4）。**前置**：待查 2（Electron 壳 scout）回报后才开。**spike 桥**（spike 级，非 W1 交付物）：M1 = C §2 业务表已列方法直通、不做 §2.2 参数约束，表外一律默认拒绝并记日志（凭证/account、§8-3 两类即使在 spike 也拒）；M2 = §2.3 端口转交 + 原帧直通，只复用 `client.mjs` 的 `connect()`。代码留在 spike 分支，可作 W1 起点，但不免除 W1 的约束和测试。场景：**冷启动、两 bot 并发流式、一次审批往返、renderer 重载**（不能只看启动日志）。产出：① 最小插件清单；② 实际需要的 M1 方法与 M2 endpoint；③ Connection generation 如何就绪。批量判据（预先定好）：凭证/account、workspace 写、`setIndexes`、通配加行一律拒，`/permission` 开头的行、configForms 写一律拒；其余逐个列名，一次批完。② 合成**一条** QUESTIONS（契约类）作为增补审批闸门：批之前不开工依赖新增接口的 UI 任务，被拒请求不因 spike 记录而自动获得授权。**止损线（任一触发即停，带已测数据回 G1 评估路线 B，不默默延期）**：闭包拖进 workspace-controller 这类深度绑定的供应者；白名单拒绝项超过约 30 个；用时超过 1 个工作日。
- **W1 三通道桥**（builder，review 档 M）：M1 白名单加参数约束、M2 端口转交与 streamId 归属、M3 bots.json 写队列、#4 编排、`presetIdOf` 共用模块。出口：临时最小页面跑通 D1，D7–D10 的非 [T-16] 单测全绿。#21（preset.ensure）随 T-16 合入后接入，单列一条任务。
- **W2 逐页**：P-A（含最小建 bot 对话框）+P-B（demo 链路，D1–D4）→ P-D（D6、D8、D10c 失效态、D11）→ P-C（D5，等 T-09）。每页流程：ux-proposer×2（Sol 席 C 和 Opus 席 A，互不可见）→ frontend-dev 定稿实现 → verifier → /panel GU 一轮。ux-proposer 的输入固定为：RE-ui-shell §3 组件树、01-boot.png、scout-C 的包清单（加 W0 最小插件清单）、待查 1 的 token 表与图标表。
- **W3 收口**：全旅程 E2E（D1–D12）、真模型冒烟、整条分支 `mm-review L`。

## 8. 非目标（放弃了什么、为什么）
- 像素级还原 Grok：没有登录后的运行态截图（RE L3），追不了，做到 token 级对齐即可。
- 改 preset 或连接器、bot:session 1:N、多窗口：C §7.5 和 §2 的 ponytail 注记里都写了，YAGNI。
- 权限 preset 切换、never 类 preset：放宽审批默认值属安全红线（LEARNINGS 2026-11-02），P4 不做。
- 非英文 i18n、虚拟滚动占位表、拖拽和 pin：都不在 3 条旅程的路径上。

## 9. 待用户确认（≤3）
无。Q-008=A：D6b、D7/D8/D10c 的 [T-16] 子项依赖 T-16，不阻塞其他条款。Q-009=A：仅 SDK 侧（T-12.f1），P4 边界见 D9（永久判据）。

## 10. 待查（主会话派发）
1. **→ reverse-engineer**：目标是 0.78.1 解包树里的 APP（`index.eager-app-iGTgHP_Q.js`）与 cursor-icons woff2。问题：① 把 `pa[light|dark]` 调色板解成色值表；② 提取 ARn/jRn 模板串里的布局常量（radius、menu-row-height、agent-item-radius、info-pane 宽度）；③ 给出到 `--dsw-*`、`--dsh-font-family-*`、wordmark 变量的候选映射；④ 用 fonttools 从 woff2 导出 4 页用到的约 20 个字形的 SVG path，附 dsw icon id 对照表（namespace/viewBox 按 scout-C:163）。隔离：`HOME=/tmp/<目录>`，只做静态分析。
2. **→ scout（W0 前置）**：Electron 壳与 E2E 的搬运阶梯。① 先答：`repos/deepseek-harness@ce7073d` 的 `apps/desktop`（electron ^44.7.0）能否第 2 级整仓集成，靠替换 transport 满足「main 是唯一 mux 客户端」；不能再找模板；② 有没有在维护的 electron-vite 类模板，能和 dsh client 的 Vite 约定（CSS Modules、`?inline`、单一 React identity、模块表 `C/web/src/platform.ts`）接上；③ playwright `_electron` 能不能断言 MessagePort 场景（D2、D4），给出 Electron 版本建议。
3. **→ 主会话**：P2 T-09（市场验收）还是 todo，D5 依赖它；确认排期，否则 P-C 排最后且 blocked。

## 11. G1-r1 回应（`panels/G1-r1.md`）
| 项 | 表态 | 落点 |
|---|---|---|
| HIGH-1 D9 歧义（A-HIGH/B-MEDIUM） | 已改：无条件表述，Q-009=A 限 SDK 侧，§8-3 两条为永久判据，T-12.f1 blocked 范围写明 | D9、§2 不做、§8、§9 |
| HIGH-2 W0 前置与止损（A） | 已改：待查 2 前置；spike 桥 M1 默认拒绝记日志 + M2 原帧直通；超 1 天止损回 G1 | §7 W0、§10-2 |
| B 创建中重载 E2E | 吸收：C:96 明文要求，单测替代不了 | D10b |
| B/A 审批终态 + 等待上限 | 吸收，按 B 收紧：窗口内无终态判 FAIL，不按 A 记「无超时」即算过（C:123 要求 fail-closed） | D4③ |
| A D6 拆分 + #21 子项标 blocked | 吸收 | D6a/b、D7、D8、D10c 的 [T-16] |
| A 失效态无 DONE | 吸收 | D10c E2E、P-D |
| A W2 首批缺建 bot 对话框 | 吸收：P-A 先做最小对话框（preset+模型），P-D 补连接器 | §2 表、§7 W2 |
| A D2 计数点 | 吸收：main M2 原帧 tap；补切回 A 无半截流 | D2 |
| A 图标字形→SVG | 吸收 | 待查 1④、§3 样式 |
| A LOW×5（presets fixture、D7 注入、computed-style、字体变量、待查 2 先答 ①） | 吸收，均一句话落地 | 通用约束、D7、D12③、§3、§10-2 |
| A LOW QUESTIONS 标题仍 [open] | 不改：非本文件，转主会话 | — |

## 修订账
| 版本 | 改动 | 依据 |
|---|---|---|
| v1 | 首版 | — |
| v1.1 | D6 删降级分支与 `degraded (Q-008 pending)` 标注，只留恢复可用分支，注明依赖 T-16 preset.ensure（未合入则 blocked）。**补记**：v1.1 未同步 D9 末句「Q-009 暂定 B / 答 A 之前保持默认拒绝」，与 §9「已答 A」矛盾（G1-r1 HIGH-1），v1.2 修正 | QUESTIONS Q-008 落实行（2026-11-02 06:30） |
| v1.2 | HIGH×2：D9 无条件化（永久判据）；W0 前置待查 2、spike 级桥、1 天止损。MEDIUM×8 全吸收：D10b 创建中重载 E2E、D4③ 终态与窗口、D6 拆 a/b 及 [T-16] 标记、D10c 失效态、P-A 最小建 bot 对话框、D2 计数点、图标 SVG。LOW×5 吸收，1 条转主会话 | `panels/G1-r1{,-A,-B}.md` |
