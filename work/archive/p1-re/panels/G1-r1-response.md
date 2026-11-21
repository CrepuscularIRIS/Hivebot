# G1-r1 回应要点（director → drafter 起草 BRIEF v2）

2026-11-01 · 9 条全部接受或部分接受，0 条拒绝。范围 HOLD 不变：7 个主题不增不删，只改问题形态、DONE、波次。

## 0. 冲突核实（清单第 3 条）：A 席正确，0.18 原版产物在本机
- `repos/grok-bot-0.18-reconstructed/research-archives/original/0.18.0/` 下有 `windows-x64/Grok_Bot_0.18.0_Setup.exe`（125,825,552 B，PE32 NSIS）和 `macos-arm64/Grok_Bot_0.18.0.dmg`（155,793,020 B，zlib UDIF）。两者都是实体文件，`sha256sum -c SHA256SUMS` 均 OK。`~/Downloads` 只有 0.78.1 deb，没有 0.18。
- 冲突来源：RE-unpack 原文是「dmg/exe **未解**」（:140、:182），LOG 11:58 转述成了「**无** dmg 源」。这是转述丢了限定词，两份 agent 结论本身不冲突。已记入 LEARNINGS。
- 本机现状：没有 7z/p7zip，bsdtar 两个文件都打不开。默认用 npm 包 `7zip-bin`（锁版本，装在 /tmp，自带 7za）解 NSIS。apt 装 7zip 需要 sudo，走用户。
- **决定：加 W0.5**，定义见 §2。W1 必须等它完成再派。

## 1. 必须回应清单逐条

**1 [A] host 不随 deb 发布 —— 接受。** 已复核：`main-app.cjs` 中 `grep -cF 'incoming-host-bundle.tgz'`=1，`'host-main.cjs'`=1，`'host_bundle_channel'`=2。另注意 package.json 依赖了 `@sand/host`，它有多少被打进 main/coordinator 由 W0.5 回答，不能直接说「host 代码 0 字节」。
- §4 新增死因 4：host 不在客户端，RE 被迫拿 0.18 当答案（锚定偏差）。防法：D2b/D2c。
- §5 深度定义：对照标记在「同/改/新/删」外加「推定」。推定 = 0.78.1 客户端里不可得，答案取自 0.18。必须同时附：①负证据（一条可直接复跑的 `grep -rcF` 命令及 0 命中结果）；②交付机制正证据（`main-app.cjs#"incoming-host-bundle.tgz"`）；③0.18 路径。
- §8 非目标新增，并写进每个 RE 的派发提示：禁止拉取 host-bundle、禁止登录、禁止进入 box，也不靠运行应用去补齐答案。
- 问题改写见 §3。产品判断：MVP 的后端是 dsh，P3 要的是客户端「期望 host 提供什么接口」，用不上 host 内部实现。因此 host 不可得对 MVP 伤害有限，前提是客户端边界画清楚。

**2 [A] 锚点格式 —— 接受，不做 beautify 树。**
- §5 锚点主格式改为 `<路径>#"<字面串>"`。命中定义：`grep -cF -- '<字面串>' <路径>` ≥1。字面串 ≥12 字符，优先选全文件唯一的。
- `路径:行` 只用于 RE-unpack 标明未 minify 的文件。beautify 后的行号不进锚点：字面串在 beautify 前后都能命中，不需要再维护一棵树（YAGNI）。
- RE-unpack §0 补 `app.asar` 的 sha256，并把 `@electron/asar` 锁到具体版本。有了 asar 哈希，解包树就可以验证，与解包工具版本无关。
- D2 的 `grep -n` 改为上面的命中定义。

**3 [A] diff 粒度和基线 —— 接受。** 基线改用 0.18 原版 asar（W0.5），4 轴固定，W1 派发前完成。用 0.18 重建仓推导的 RE-unpack §5 降级为「推导，已被 W0.5 取代」，只保留 W0.5 解不出来的行。§3 防漏行和 §6 W0 行同步修改。D7 与「不补派」的冲突处理：W0.5 表中的新项先写进 W1 派发提示；W1 之后才发现的新项不派 RE，写进 ARCH 的「已知未覆盖」节，D7 只校验 W0.5 表。

**4 [A] MVP 旅程不全 —— 接受。** ipc-rpc Q2 的旅程改为：①建 bot 并**选 agent 配置**→发消息→收流式回复；②多 session 同时开、切换；③市场安装 MCP→启用→**bot 调用该工具→审批卡往返**；④**冷启动恢复** bot 列表和历史。0.78.1 如果没有「每个 bot 选 agent 配置」，就写「新（复刻自建）」，同时附负证据。ui-shell Q3 的页面清单不变，已含审批卡。D3 改为 4 条旅程。

**5 [A] 同/改/新/删 无 DONE —— 接受，新增 D2b。** 每个 Q 都要有一行「对照：<0.18 路径或 —> | 同/改/新/删/推定」，0.18 路径必须能 `ls` 到。同、改要附 0.78.1 锚点；删、推定要附负证据命令；新的 0.18 路径写「—」。verifier 每份 RE 抽 3 行做机械检查。新增 **D2c**：ARCH「P3 输入」列出全部推定项，即 P3 的风险清单。

**6 [B] 旧 bundle 内的新增子系统 —— 接受。** W0.5 的 B 部分做入口扫描，只看 0.78.1，不依赖 0.18：进程入口、IPC/service、路由/chunk、扩展 id。每个新能力映射到「RE-x Qn」或「RE-x 清单行」或「非 MVP 行」。即使 0.18 解不出来，B 部分也照做。

**7 [B] 答案完整性 —— 部分接受。** D2 改为每个 Q 下有 4 行：「答案：」「对照：」「证据：」「未知：」（可以写「无」），缺一行即 FAIL。D3 改为静态链路表（见第 9 条）。修正一点：「关键断点未解不得 PASS」只适用于客户端边界以内。链路在 main/coordinator 发往 host 或云端的那一跳截止；跨过边界的部分允许推定（附负证据）。否则 host 不在 deb，4 条旅程注定全部 FAIL。

**8 [C] 进程入口归属表、local-exec-daemon —— 接受，并入第 6 条。** 入口表的列：入口文件 | 拉起方锚点（`fork`/`spawn`/`utilityProcess.fork` 附近的文件名字面串）| 职责一句话 | 归属 RE。`local-exec-daemon`、`node-agent-coordinator` 各一行，必须给出拉起方锚点；找不到就写「未知」并附负证据。

**9 [C] 只有方法名 —— 部分接受。** 只对 4 条 MVP 旅程用到的方法要求：①参数/返回，优先给可定位的 schema，比如 `proto.cjs#"<pkg>.<Msg>"` 的 message 名，字段由 W0.5 从 proto.cjs 脚本导出，不手抄；没有 schema 的 IPC 才在调用点按字面串列字段名。②链路表列：调用方锚点 → 方法 → 处理方锚点 → 事件/返回 → 边界。非 MVP 方法维持只列名。D3 的检查改为：verifier 随机抽 1 条完整旅程，链路表上该旅程的所有锚点都要命中；方法名 grep 限定在 `dist/renderer dist/electron-preload`，用带引号的全名，泛名改带 service 前缀（并入 A-M3）。

## 2. W0.5（新增，一个 RE；W1 前置）
- A 部分（4 轴 diff）：从 `Setup.exe` 解出 0.18 原版 `app.asar`（x64，比 dmg 更接近 linux；dmg 作备选），记录 exe 和 asar 的 sha256，解到 `/dev/shm/grok-re/0.18.0/`。对比轴：①package.json 的 `@anysphere/*`、`@sand/*`；②renderer chunk 去 hash 后的语义名；③preload 入口及 contextBridge 暴露的键；④proto service/method 名。另外回答 0.18 asar 里是否真有 `dist/host`：有的话，「host 从本地移到 box 下发」就是一条有硬证据的「改」。
- B 部分：§1 第 6、8 条的入口扫描和归属表。
- 4 张表和入口表都由一个脚本生成，脚本放 `work/p1-re/w05/`，verifier 能复跑。结果替换 RE-unpack §5。
- native 并入 W0.5（A-LOW）：用 RE-unpack §3 的 9 行各加一句用途，产出 `RE-native.md`。W3 只剩 host-ext。
- 卡住处理：解包失败两次，A 部分退回到重建仓推导，标「推导」，B 部分照常完成。

## 3. host 不可得之后，三组问题的新写法
- **host-ext（清单）** 改为「客户端可见的 host 面」，四张表：①host 交付机制（bundle 路径、`host_bundle_channel` 开关、谁解包谁启动）；②main/coordinator 引用的扩展 id 和能力枚举（字面串锚点）；③客户端与 host 之间的通道和方法名（只到边界）；④0.18 的 35 个扩展回退表，每行标推定，附 `grep -rlF '"<id>"' dist` 0 命中的负证据，或者「仅出现在 coordinator 枚举」。启动顺序改问「客户端侧可观测的启动顺序」，host 内部的启动顺序标推定。
- **features Q1** 只问客户端看得到的模型：renderer/main 中 bot、agent 配置、session 的类型字面串、store 键、proto message。Primary Bot 的差异只取客户端证据，其余标推定。
- **features Q2** 改为冷启动链路（对应旅程④）：重启后 renderer/main 从哪里拿 bot 列表和历史，是 userData 下的本地文件（给路径字面串），还是 host RPC（给方法名）？main 本地落盘写什么？host 内部存储（0.18 `source/host/storage`）只占一行，标推定。
- **marketplace Q3** 改为：MCP 进程由谁拉起，看客户端证据（main 里有没有 `mcp-core` 的 stdio spawn 锚点），还是 main 只把安装配置经 RPC 转给 host（给方法名）？工具调用和审批的往返只追到客户端边界。都找不到时答「host 侧，不可得」，附负证据，用 0.18 `source/host/extensions/mcp/` 推定。
- **ipc-rpc Q1** 加入 host 交付机制；删掉「MCP 归 main 还是 host」这一问，只交给 marketplace Q3（A-M4）。

## 4. MEDIUM / LOW 表态
| 来源 | 表态 |
|---|---|
| A-M D6 grep 语义 / B-M D6 / C-M D6 | 接受。正则改为 `grep -inE '^#+.*(\bbox\b\|云电脑\|ssh\|vnc\|computer[- ]?use\|账号体系\|移动端\|远程连接)'` 只查标题，作为 lint，输出必须为空。豁免只认 `^#+ Q[0-9]+ ` 这种完整编号边界。正文命中由 verifier 逐条看，每处 ≤1 句边界说明。cloud-deps 表固定一列「非 MVP 键」，7 个键各 grep 一次，没有端点就写「无端点」 |
| A-M D8 / B-M D8 / C-M D8 | 接受。表格数据行（`^\|`，不含表头和分隔行）必须含 `RE-[a-z0-9-]+\.md §`；每个 mermaid 块后面紧跟一行「来源：RE-x §n」；标题、空行、围栏豁免。命令写进 D8，verifier 抽 3 个链接，检查对应 § 存在 |
| A-M D3 grep 范围 | 接受，并入第 9 条 |
| A-M 波次重叠 / B-L 依赖 / C-M 依赖 | 接受，比建议改得更多：W0.5 之后其余 RE 全部并行（主会话按机器负载限流），不再分 W1/W2/W3。features Q3 改为「引用 ipc-rpc Q3，只补 bot 维度」。features Q1 与 ipc-rpc 旅程①的不一致由 director 在 ARCH 合并时裁决，不补派 |
| B-M 市场替代源只到候选 | 接受。D4 为是/部分时，scout 在 P1 内派出，与 RE 并行；D4 要求引用一份已核实的公开目录样例和安装字段映射，如果不可用，就在 QUESTIONS 写阻塞项。scout 文件仍为 `p2-sdk/reuse/market-backend.md` |
| A-L native 并入 | 接受，见 §2 |
| A-L W0 状态 | 接受。§6 写「W0 完成；W0.5 待派，是其余 RE 的前置」 |
| A-L 截图隔离 profile / roadmap 更正 | 接受。截图用 `--user-data-dir=/tmp/grok-p1-profile` 启动，不碰任何登录框。roadmap.md:17 的更正由主会话改（不在 director 可写范围） |
| C-L「默认：同意」 | 接受。§9-2 改为「暂按清单执行，待 Q-003 答复；用户若拒绝则补深挖」，Q-002 同样措辞 |

## 5. 连带修改（drafter 起草时一并处理）
- 要改的节：§3 防漏行、§4 新增死因 4、§5、§6、§7（D2 改写；新增 D2b、D2c；D3、D4、D6、D7、D8 改写；D1 的文件数不变）、§8、§9、§10（W0.5 一条，其余 RE 一条并行，scout 改为 P1 内条件触发）。
- 修订账：把以上 D 条款的改动逐条记进去，每条注明对应的 G1-r1 清单编号。
