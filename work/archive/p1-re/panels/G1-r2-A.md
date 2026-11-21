seat: A
verdict: REVISE
confidence: high
findings:
- [HIGH] BRIEF.md:47（ipc-rpc Q2）、:29 — proto message 锚点模板 `proto.cjs#"<pkg>.<Msg>"` 与产物不符，按 §5 命中定义必然 0 命中 — 证据: `grep -oF 'aiserver.v1.ListGrokBotMarketplaceCategoriesInternalRequest' dist/electron-main/proto.cjs | wc -l` = 0；message 在 proto.cjs 中以 `static $(){return["ListGrokBotMarketplaceCategoriesInternalRequest|1 page_size 5|2 page_token 9"]}` 这种紧凑串编码，共 2373 条（`grep -oE 'static \$\(\)\{return\["[A-Za-z0-9_]+\|'` 计数）；带包名的字面串只有 7 个 `*.v*.*Service` typeName 和 22 个 google.protobuf typeName；去掉包名后有 19 个 message 名重复（AskQuestionResult、ComputerUseResult、ConnectScmGithub …） — 建议: message 锚点改为 `proto.cjs#"<Msg>|"`，这 19 个重名改为 `proto.cjs#"<Msg>|1 <首字段名>"`。proto-fields.tsv 由 W0.5 脚本直接解析 `static $()` 串生成（用标准库就能做），键为 Msg 名加消歧列；service 方法的 I/O 从 `{name:"<Method>",I:<v>,O:<v>,kind:…}` 一起导出。
- [HIGH] BRIEF.md:73（D3） — 「方法名核验限定在 dist/renderer、dist/electron-preload」对 proto RPC 方法必然 0 命中，旅程③会被机械判 FAIL — 证据: renderer 与 preload 中 `typeName:"*.v*.*Service"` 命中文件 0 个，proto.cjs 有 7 个；`ListGrokBotMarketplaceCategoriesInternal` 与 camelCase 形式在 renderer+preload 中 0 个文件命中，只出现在 `electron-main/proto.cjs#"listGrokBotMarketplaceCategoriesInternal:{name:"`。renderer 不直接持有 connect client，RPC 只在 main/coordinator/daemon — 建议: D3 分两类核验：IPC 通道名和 contextBridge 键（preload.cjs 暴露 5 个键：desktop / sandPopout / coordinatorPort / sandRenderTrace / desktopMount）限定 renderer+preload；proto RPC 方法用 `dist/electron-main/proto.cjs#"{name:"<Method>",I:"` 核验。链路表必须显式列出 renderer→main 的 IPC 跳。
- [HIGH] BRIEF.md:39-40（W0.5）、:77（D7） — D7 无法机械复核，且轴②会让归属行数量爆炸 — 证据: (a) B 部分入口表只看 0.78.1，本身没有「新」的概念，D7 却要求校验「入口归属表中每个新项」；(b)「在某份 RE 中 grep 到归属行」没有定义 grep 用的键；(c)「职责一句话」「归属 RE」是人工判断列，:40 却要求由脚本生成，D7 还要求脚本输出与 RE-unpack §5 `diff` 为空，而 :40 又要求 §5 保留 W0.5 解不出的「推导」行，diff 必然非空；(d) 0.78.1 renderer 去 hash 后有 352 个名字（`ls assets/*.js | sed -E 's/-[A-Za-z0-9_-]{8}\.js$//' | sort -u | wc -l`），其中大量是纯 hash 名（如 `chunk-2LRPAJJ6`），0.18 shippedAssets 只有 131 个（RE-unpack.md:177），逐个「新」都要归属行会产出数百行凑数的行 — 建议: 每个新项给一个稳定 id `W05-<轴>-<n>`，RE 里的归属行写 `归属：W05-…`，D7 改为用 `comm -23` 比较两个 id 集合，输出为空；入口表的每一行都要有归属（不按「新」筛选）；人工列放在 `w05/owners.tsv`，由脚本 join 生成；RE-unpack §5 拆成 §5a（脚本输出，即 diff 对象）和 §5b（推导残留）；轴②剔除纯 hash chunk，按语义前缀族聚合，D7 按族校验。
- [MEDIUM] BRIEF.md:58、:90-92 vs QUESTIONS.md:13、:31 — §9 仍写「待 Q-002/Q-003 答复」，两题都已 answered；Q-001 的落实要求把「主 bot=SuperAgent / 日常 bot=DSH」分工猜想并进 features Q1，BRIEF 里 `grep -ciE 'superagent|分工'` = 0；Q-003 落实行末尾附有用户原话「主grok bot用dsh superagent, 剩下的用dsh. 这样还是需要深挖的, 或者是我们先把整个流程跑通过, 然后再决定」 — 建议: features Q1 显式加一问：Primary Bot 与普通 bot 的运行时、agent 配置是否不同（只取客户端证据，例如 bot 类型字面串和 store 键）；§9 改为 answered 状态，Q-003 按「先跑通再决定」处理，清单深度不变。
- [MEDIUM] BRIEF.md:26、:81 — 「host 由云端下发」是把推断写成了事实。字面串实为 `/tmp/sand-supervisor/incoming-host-bundle.tgz`，同一簇常量还有 `/tmp/sand-supervisor/command.json`、`acks`、`/opt/sand/sand-host/host-main.cjs`、`/home/box/sand-data`，指向 box 内 supervisor 的投递目录；tgz 从哪里来（云端拉还是 main 推）客户端侧没有证据，`sand_host_bundle_channel{channel,watchIntervalMs}` 只是 statsig 开关 — 建议: 改写为「host 不在 deb 中，经 box supervisor 投递，来源待 ipc-rpc Q1 确认」；推定项的正证据锚点可以照用。另外在 ARCH「P3 输入」写明：host 在 box 内，所以 MVP 的客户端边界就是 box 边界。
- [MEDIUM] BRIEF.md:34 vs :75（D5） — 「也不靠运行应用去补齐答案」与 D5「截图必须运行应用」冲突；未登录运行时是否会触发 host bundle watch / 遥测外联未知；Electron 是否遵守 `--user-data-dir` 也没验证（本机 `~/.config` 下目前没有 grok/sand 目录） — 建议: 把截图写成唯一允许的运行场景；运行前后各 `ls ~/.config`，确认没有新建 Grok/sand 目录；尽量断网运行；截图只作证据，不能作为答案的唯一来源。
- [MEDIUM] BRIEF.md:71（D2b） — 对照路径有两个 0.18 根（原版在 `/dev/shm/grok-re/0.18.0/`，地图在 `repos/grok-bot-0.18-reconstructed/`），「能 ls 到」没说用哪个根 — 建议: 路径加前缀 `orig:` 或 `map:`。
- [LOW] BRIEF.md:76（D6） — 只有 1 个 RE 文件时 grep 不输出文件名前缀，豁免会失效（实测单文件时 `## Q1 box 拓扑` 被报出；当前 work/p1-re 只有 RE-unpack.md） — 建议: 改用 `grep -H`。多文件时实测豁免正确。
- [LOW] BRIEF.md:29 — `grep -cF` 数的是行数，minify 文件只有 1–4 行（`wc -l proto.cjs` = 4），用它验证不了「全文件唯一」 — 建议: 唯一性改用 `grep -oF … | wc -l`。
- [LOW] BRIEF.md:38 — W0.5 主路径已实测可行：`7zip-bin@5.2.0` 的 `linux/x64/7za l Grok_Bot_0.18.0_Setup.exe` 输出 `Type = 7z`，包内有 `resources/app.asar`（77,815,240 B），656 个文件，附 `Warnings: 1`；`@electron/asar@4.3.1` 在 npm 上存在。按签名切片的回退大概率用不上 — 建议: 派发提示里注明 Warnings: 1 可以接受；0.18 的解包命令和 sha256 要写进 RE-unpack §0（D2 重新解包依赖它）。另外 0.18 的 Windows 包里有 `resources/app.asar.unpacked/dist/native/sand-webauthn-signer.exe`，RE-unpack §5.1 写的「macOS 原生可执行」不对，W0.5 会覆盖掉。
- [LOW] BRIEF.md:78（D8） — awk 实测正确（表头、分隔行、末行都处理到了）；mermaid 后面那行「来源：」没纳入 lint，只能靠人看 — 建议: 可选，再加一条 awk，检查 mermaid 闭合围栏的下一行是否匹配 `^来源：RE-`。
reverse_take: 最可能的失败方式：RE 照 BRIEF 写 `aiserver.v1.<Msg>` 锚点，并把 RPC 方法名放到 renderer 范围核验，D3/D7 被机械判 FAIL，结果要么返工，要么 verifier 放水。更笨更稳的做法：让 W0.5 脚本先把 proto.cjs 的 `static $()` 串和 service 的 `{name:"…",I:,O:}` 导成 tsv，把 W0.5 新项编成 id，所有 RE 只引用 tsv 里的字面串和 id。

---

## 理由

### 1. r1 的 9 条 HIGH 落实情况（逐条核对）
| # | r1 清单 | v2 落点 | 判定 |
|---|---|---|---|
| 1 | host 不随 deb | §4-4、§5 推定三件套、§8、§6 派发头禁令 | 已落实（措辞见 M「云端下发」） |
| 2 | 锚点格式 | §5 `路径#"字面串"` + `grep -cF` | 已落实，但 proto message 子格式与产物不符（HIGH-1） |
| 3 | 原版 asar 4 轴 diff | W0.5 A 部分，基线改为原版 exe | 已落实，工具链实测可用 |
| 4 | MVP 旅程补全 | :47 四条旅程（含选 agent 配置、工具调用 + 审批卡、冷启动） | 已落实 |
| 5 | D2b | :71 | 已落实（根路径歧义见 MEDIUM） |
| 6 | 不依赖 0.18 的入口扫描 | W0.5 B 部分 | 已落实（D7 可复核性见 HIGH-3） |
| 7 | 答案完整性 | D2 四行 + D3 静态链路 | 已落实 |
| 8 | local-exec-daemon 归属 | :39 两行必填拉起方锚点或「未知」+ 负证据 | 已落实 |
| 9 | 参数 / 返回 / schema | :47 schema 优先 + proto-fields.tsv | 已落实，但 schema 锚点格式错（HIGH-1），核验范围错（HIGH-2） |

9 条都有对应落点，没有被忽略的。新发现的 3 条 HIGH 都是 v2 新写的细节和 0.78.1 实物对不上，属于派发时附加要求就能修的问题，不涉及路线或范围。

### 2. W0.5 的可派发性
- 工具：`7zip-bin@5.2.0`、`@electron/asar@4.3.1` 在 npm 上都存在；7za 直接打开 NSIS exe 成功，识别为内嵌 7z，app.asar 就在里面。回退路径（按签名切片）写法正确，但大概率用不上。可以派。
- 交付物：4 张 diff 表 + 入口表 + proto-fields.tsv + RE-native.md + RE-unpack §0/§5 修订，内容齐全。只有「脚本生成人工判断列」和「§5 diff 为空 vs 保留推导行」两处自相矛盾（HIGH-3），按建议拆成 owners.tsv 和 §5a/§5b 即可。
- proto-fields.tsv 实际很好做：proto.cjs 自带 `"<Msg>|<no> <name> <type>|…"` 紧凑串，不需要解 base64 descriptor。

### 3. DONE 可证伪性
- D1、D5、D8：可以机械执行，D8 的 awk 已实测。
- D2、D2b：基本可以机械执行（根路径前缀见 MEDIUM）。
- D3：proto 方法的核验范围错了，原样执行会出假 FAIL（HIGH-2）。
- D6：多文件时正确，单文件时有边界缺陷（LOW）。
- D7：没有 grep 键，判定「新」的口径也没定，目前不可机械执行（HIGH-3）。
- D4、D2c：可证伪。

### 4. 预设结论 / 边界冲突
- 「云端下发」把推断写成了事实（MEDIUM）；ipc-rpc Q1 本身在问这个问题，BRIEF 不应先下结论。
- host 落在 box 内，而 box 是非 MVP 项。BRIEF 用「链路只追到客户端边界」加 Q 标题豁免处理了这个冲突，处理得当；只需要在 ARCH 里把「客户端边界 = box 边界」明说出来。
- Q-001/Q-003 用户的 SuperAgent 分工猜想没有落进 features Q1（MEDIUM）；不改变范围，只补一问。
- 没有违反安全红线：禁止登录、禁止拉 bundle、禁止进 box，凭证不进模型。截图运行的外联风险见 MEDIUM。

### 结论
不 BLOCK：没有安全红线问题，核心旅程可以完成，方案的基础事实（0.18 原版产物在本机、可解包、host 不在 deb）已经实测成立。不 PASS：有 3 条带证据的 HIGH，原样执行会让 D3/D7 机械 FAIL 或无法判定。按第 2 轮规则判 REVISE（有条件通过）：把上面 3 条 HIGH 原样转成 W0.5 和 ipc-rpc 派发的附加要求，MEDIUM 由 director 视情况并入派发提示。
