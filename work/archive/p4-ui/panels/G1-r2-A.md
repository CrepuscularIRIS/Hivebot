seat: A
verdict: REVISE
confidence: high
findings:
- [MEDIUM] BRIEF.md:53（D10c 整条标 [T-16]）— 失效态显示的 E2E 被 [T-16] 连带锁住，可它恰恰在 T-16 合入**之前**最常出现：C §7.1 写明「未实现 #21 前……UI 对只读 bot 显示『连接器已失效，请新建 bot』」，即 T-16 前每个连接器 bot 重启后都是只读态。现在这条显示要等 T-16 才验，r1 的「失效态无 DONE」只修了一半，§4 死因 2「静默降级」在 T-16 前仍无证据守护；P-D 的「D10c 失效态」（BRIEF.md:60）也随之 blocked — 证据: BRIEF.md:41（[T-16] 子项 blocked）、:53（c 以 **[T-16]** 开头，E2E 在同一子项内）；CONTRACT.md:137；`git merge-base --is-ancestor feat/T-16 main` → not-merged（tip 97cb7cf 仍是 T-15② probe）— 建议: 拆成 c1（不 blocked）：只读 bot 显示「连接器已失效，请新建 bot」、不自动重试、其他 bot 正常；触发方式 T-16 前 = 任一连接器 bot close→launch，T-16 后 = 删 bundle 再 close→launch；c2 **[T-16]**：#21 allSettled、失败 recipe 标 `live=false`。转 W2 P-D 派发附加要求
- [MEDIUM] BRIEF.md:47（D4③）— 判据本身对（按 B 收紧为窗口内无终态即 FAIL），但这是一条可预见会 FAIL 的条款，却没有预置归属：gateway 断连后 pending 保留且无 cursor 补发（CONTRACT.md:121-122，GW/index.ts:729-737），目前没有任何已知超时；一旦 FAIL，「转修复任务」要么改 SDK、要么 main 自己代答 `rejected`（main 是否另开 `$events`、用谁的 clientId）——这是契约类问题，拖到 W3 才暴露会卡收口 — 证据: BRIEF.md:47「窗口到期仍 pending → FAIL……转修复任务」；CONTRACT.md:123 只说边界「列为 P4 验收项」— 建议: W0 产出加 ④「无人应答终态实测」（spike 已有审批往返+重载场景，顺手断开 renderer 等 5 分钟）；若无超时，在 W0 合成的那**一条** QUESTIONS（契约类）里一并提 deadline 方案，W1 前定归属
- [MEDIUM] CONTRACT.md:149 / QUESTIONS.md:89-90（上游残留，非 BRIEF 本身）— BRIEF 的 D9 已无条件化，但 C §8-3 仍是条件句「Q-009 答 A 前保持默认拒绝」，Q-009 落实行也没写 P4 边界；而 BRIEF.md:4 规定「接口形状一律以 C 为准」，W1 builder（GLM）主读 C。两份上位文件对同一安全边界一宽一严 — 证据: CONTRACT.md:149；QUESTIONS.md:90；BRIEF.md:4,52 — 建议: 主会话在 Q-009 落实行补一句「不授权 P4 UI 暴露 never/权限切换；§8-3 两条拒绝为永久判据（见 p4-ui BRIEF D9）」，C §8-3 加同义勘误一行；W1 桥任务派发时附 D9 原文
- [LOW] BRIEF.md:52（D9 末句）— 「T-12.f1 未合入期间，只有『never preset 下 bash 放行』这一条 SDK 侧验证 blocked」：本 BRIEF 的 DONE 里并没有这条验证，读者会以为 P4 要配 never preset 去测 — 建议: 改成「该验证属 T-12.f1 自身验收，不在 P4 DONE 内」
- [LOW] BRIEF.md:52（D9 覆盖面）— C §2.2 第三条的 #3/#4 约束（agentPreset 不得是被 #1 滤掉的 `p2temp-*`；#4 connectors 须非空字符串数组）没有任何拒绝测试 — 证据: CONTRACT.md:61 — 建议: D9 加两例：#3 传 `p2temp-xxx`、#4 传 `connectors:[]`，均返回 `pbots/invalid-args` 且 dsh 未收到
- [LOW] BRIEF.md:58（W0 spike 桥）— spike 的 M1 对业务表方法「不做 §2.2 参数约束」，等于 spike 期间 installBundle `enabled:true`、`allowed-always` 都会直达 dsh；在临时 HOME 下无害，但 W0 段没写临时 HOME（§6 通用约束只说「测试」）。另外冷启动主 bot 要 M3（#19/#20），spike 桥只定义了 M1/M2 — 建议: W0 写明「spike 一律 `HOME=/tmp/bot-p4-spike`、`PBOTS_DATA_DIR` 同」；M3 在 spike 内用内存桩或跳过主 bot，写一句即可
- [LOW] BRIEF.md:45（D2）— transcript 标记只查定稿记录；assistant-stream 不重放（CONTRACT.md:105），流式期间 A 的 chunk 渲染进 B 视图这类串线在定稿后就看不见了 — 建议: 加一条：A 流式且当前视图为 B 时，B 的 DOM 不含 A 的标记
- [LOW] BRIEF.md:3（输入列表）— `panels/G1-r2{,-A,-B}.md` 没带目录前缀，指的是 p3-contract 的面板，和本目录即将产生的 G1-r2 同名 — 建议: 写成 `p3-contract/panels/G1-r2{,-A,-B}.md`

reverse_take: 最可能的失败方式不再是范围或路线，而是「blocked 标记吞掉真实状态」：T-16 迟迟不合，连接器 bot 重启后全是只读，而唯一验证失效态显示的 E2E 被同一个 [T-16] 锁住，demo 上出现的恰是没人验过的界面；更笨更稳的做法是把失效态显示拆成不 blocked 的子项，用「任一连接器 bot 重启」现在就能触发。

## 关注点逐项核对

### 1. 两条 HIGH
- **HIGH-1 D9（已落实）**：BRIEF.md:52 改为无条件表述——列全六类拒绝（installBundle 省略/true、`allowed-always` 与 clientId/eventId 不匹配、`/permission` 行、configForms 写、credentials/account），断言 dsh 未收到；DOM 无权限切换入口、never preset 不入任何可选列表；「Q-009=A 只改 SDK 侧……不授权 P4 UI 暴露」「与任何 QUESTIONS 答复无关，放宽须引用户原话另开安全红线问题」。旧的「暂定 B / 答 A 之前」已删。§2:20、§8:66、§9:70 三处同步，修订账 :96 补记 v1.1 未同步 D9 的缺漏。唯一残留在上游（C §8-3、Q-009 落实行），见 MEDIUM-3。
- **HIGH-2 W0（已落实）**：BRIEF.md:58 写明「待查 2 回报后才开」；spike 桥定为 spike 级（M1 表内直通、表外默认拒绝记日志，凭证/account 与 §8-3 两类即使在 spike 也拒；M2 端口转交 + 原帧直通，只复用 `connect()`）；「代码留 spike 分支，可作 W1 起点，但不免除 W1 约束和测试」；止损线加「用时超过 1 个工作日」，触发即「带已测数据回 G1 评估路线 B，不默默延期」。§4:31 死因 1 防线同步，§10-2 标 W0 前置并先答 ①。与我 r1 的建议相比，M1 从「全拒只记日志」放宽为「业务表直通」，这更实用（否则四场景跑不起来），代价只是 spike 期 §2.2 不生效，在临时 HOME 下可接受（LOW-3）。

### 2. MEDIUM 吸收
| r1 项 | v1.2 落点 | 判定 |
|---|---|---|
| B D10b 创建中重载 E2E | D10b「屏障停在 recipe 已落盘、session 已建而 #4 响应未返回时重载 renderer → 同一 session 恢复且连接器完整（C:96）」，保留编排顺序单测 | 到位 |
| B/A D4③ 终态 + 窗口 | 窗口 = 2× 已知超时 / 未知 5 分钟；窗口内须有拒绝/错误终态且零副作用；到期仍 pending 判 FAIL；①② 只验宽限内补发，与 ③ 分开 | 判据到位；FAIL 后的归属未预置（MEDIUM-2） |
| A D6 拆分 + [T-16] 标注 | D6a 不 blocked（含主 bot 置顶无删除、#11 分页、普通 bot 能回复），D6b [T-16]；D7/D8/D10c 的 #21 依赖子项标 [T-16]；通用约束写明 [T-16] 不连带同条其他子项 | 到位，但 D10c 标得过宽（MEDIUM-1） |
| A 失效态无 DONE | D10c E2E：删 bundle → close/launch → 显示「连接器已失效，请新建 bot」、不重试、其他 bot 正常；P-D 表含「失效态显示」 | 条款有了，但整体被 [T-16] 锁住（MEDIUM-1） |
| A 建 bot 对话框 | P-A「最小建 bot 对话框：preset + 模型」，P-D 补连接器勾选；W2 首批 P-A 含对话框 | 到位；D1/D2 的建 bot 路径在首批可走通 |
| A D2 计数点 | 「在 main 的 M2 原帧 tap 计数」+「切回 A 显示完整定稿，无残留半截流」 | 到位（流式期 DOM 串线见 LOW-4） |
| A 图标 SVG | 待查 1④：fonttools 从 woff2 导出约 20 个字形 SVG path + dsw icon id 表（namespace/viewBox 按 scout-C:163）；§3 样式行同步 | 到位 |
| LOW×5 | presets.yml fixture（:41）、D7 直接调 M1、D12③ computed-style、§3 `--dsh-font-family-*` 与 wordmark 变量、待查 2 先答 ① | 全部到位 |

### 3. 新引入的不一致
- §2/§8/§9 与 D9：三处口径一致，均指向 D9 永久判据，无矛盾。
- §11 回应表「不按 A 记『无超时』即算过」与 D4③「到期仍 pending → FAIL，记实测『无超时』」一致（记录是附带动作，不是通过条件）。
- §9 与 [T-16] 范围：§9 列「D6b、D7/D8/D10c 的 [T-16] 子项」，与条款标注一致；问题在 D10c 标注粒度本身（MEDIUM-1），不是同步错误。
- W1 出口「D7–D10 的非 [T-16] 单测全绿」与 D9（直接调 M1 的拒绝测试）兼容。
- 上游残留：C §8-3 条件句与 D9 的无条件判据并存（MEDIUM-3）；QUESTIONS 中 Q-008/Q-009 标题仍为 [open]（r1 已提，BRIEF 已转主会话，不重复计分）。
- 输入列表 G1-r2 路径歧义（LOW-5）。

### 结论
两条 HIGH 完整落实，MEDIUM 8 条全部有落点；剩余 3 条 MEDIUM 均为一句话级修订或主会话侧勘误，不改路线和范围。按本轮为最后一轮的规则：REVISE = 有条件通过，以下清单转派发附加要求：
1. W2 P-D：D10c 拆 c1（失效态显示，不 blocked）/ c2（allSettled，[T-16]）——MEDIUM-1。
2. W0：产出加 ④ 无人应答终态实测；无超时则并入 W0 那条契约类 QUESTIONS——MEDIUM-2。
3. 主会话：Q-009 落实行与 C §8-3 各补一行永久边界勘误；W1 桥任务附 D9 原文——MEDIUM-3。
4. LOW 1–5 可在 PLAN 细化时顺手吸收。
