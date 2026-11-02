seat: A
verdict: REVISE
confidence: medium
findings:
- [HIGH] BRIEF §6 W3 host-ext（:57）、features Q1/Q2（:50-51）、marketplace Q3（:46）、ipc-rpc Q1（:36）— 方案默认 host 侧代码在 0.78.1 解包树里能查到，实际 host 不随 deb 发布，而是在 box 里由 supervisor 下发 — 证据: `dist/electron-main/main-app.cjs:4` 含 `tS="/tmp/sand-supervisor"…TCe=\`${tS}/incoming-host-bundle.tgz\`…lX=\`${sX}/sand-host\`,YHt=\`${lX}/host-main.cjs\``（sX="/opt/sand"）；`main-app.cjs:351` 有实验开关 `host_bundle_channel`；0.18 `source/host/extensions/registry.ts:2` 的扩展 id 中，managed-setup / cross-user-sharing / state-backstop / box-store-sync / webauthn-proxy / notify-bus / host-upgrade / box-lifecycle / turn-execution / content-search / cloud-agents 在 `/dev/shm/grok-re/0.78.1/app/dist` 下 `grep -rlF '"<id>"'` 均为 0 命中（forever-box、teach-recording 只出现在 coordinator 的枚举表里）— 建议: (1) W0 补充项先回答「host 是否随 deb 发布、从哪里下发」；(2) host-ext 改成「客户端可见的 host 面」：coordinator/main 引用的扩展 id 与能力枚举、host bundle 下发机制，再加 0.18 回退表；(3) DONE 允许「不可得」作为答案，但必须附负证据（grep 命令 + 0 命中），并明确标「0.18 推定」；(4) 明文禁止为补齐答案去拉取 host-bundle（要登录、走云端，碰红线）。features Q2（存储）在 0.18 里属于 `source/host/storage`，同样受影响。
- [HIGH] §5:27 锚点格式 `<路径>:<行>` 与 D2（:64）的「grep -n 命中」— 0.78.1 全部是 minify 后的长行，行号几乎没有区分度；beautify 之后的行号在解包树里又不存在；解包命令也没有锁版本 — 证据: `preload.cjs` 133,662 B / 32 行；`main-app.cjs` 3.5 MB / 1195 行；`index.eager-app-iGTgHP_Q.js` 4.3 MB / 156 行（每行约 27 KB）；RE-unpack.md:7 用的是 `npx -y @electron/asar extract`，没有版本号，也没有 sha256；RE-unpack.md:115 要求先 beautify 再读 — 建议: 锚点主格式改为 `<路径>#"<字面串>"`，D2 的「命中」定义为 `grep -cF '<字面串>' <路径>` ≥1（字面串越独特越好）。`路径:行` 只允许用于 RE-unpack 标明未 minify 的文件。如果要用 beautify 后的行号，必须在 RE-unpack 里写一条锁定版本的 beautify 命令，产出 `beautified/` 树，锚点指向这棵树。
- [HIGH] §3:17 防漏与 §6:32「与 0.18 的模块清单 diff（新增 / 删除的目录和 bundle）」— 粒度没定，基线也选错了。0.78.1 的 dist 只有 6 个顶层目录，在目录级做 diff 什么都兜不住；0.18 reconstructed 是「partial evidence-backed reconstruction」，而且是 macOS arm64 版，重构里没有的东西不等于 0.18 里没有，平台差异还会造成假的新增 / 删除。0.18 的原始安装包本机已有 — 证据: `ls /dev/shm/grok-re/0.78.1/app/dist` 只有 deps / electron-main / electron-preload / local-exec-daemon / node-agent-coordinator / renderer；`repos/grok-bot-0.18-reconstructed/PROVENANCE.md`（"The readable `frontend/` tree is therefore a partial evidence-backed reconstruction"）；`research-archives/original/0.18.0/windows-x64/Grok_Bot_0.18.0_Setup.exe`（125 MB）和 `macos-arm64/Grok_Bot_0.18.0.dmg`（155 MB）都是实体文件，不是 LFS 指针 — 建议: 改成两个打包产物之间的 diff（0.18 原始 asar 对 0.78.1 asar），轴固定为 4 条：①package.json 里的 `@anysphere/*` / `@sand/*` 依赖；②renderer chunk 的语义名（`chunk-*-<hash>.js` 去掉 hash）；③preload 入口文件；④proto service / method 名。每条轴一张表，D7 按这 4 张表里的「新」行检查归属。这份 diff 要在 **W1 派发前**完成，归属写进各 RE 的派发提示；否则 D7「不允许悬空」会和 §5:28「每个清单主题只派一次 RE，不补派」冲突，事后发现的新子系统将无处可归。
- [HIGH] §6 ipc-rpc Q2 旅程③（:37）— 旅程只写到「在市场安装 MCP 并启用」，roadmap 的 MVP DONE 是「bot 能调用它的工具」（roadmap.md:83）。BRIEF 自己也承认 MVP 调 MCP 工具时会弹审批卡（BRIEF:75），可是工具调用和审批往返的 RPC 都不在最小面里。旅程①没有覆盖「每个 bot 选不同 agent / harness 配置」（roadmap.md:7）；「重启后列表和历史还在」（roadmap.md:82）也没有对应的旅程 — 证据: BRIEF.md:37 对 roadmap.md:7、:82、:83 — 建议: 旅程③改成「安装→启用→bot 调用该工具→审批卡往返」；旅程①加上「选 agent 配置」；新增旅程④「冷启动恢复 bot 列表和历史」。D3 要求 4 条旅程都有行。
- [HIGH] D 条款缺「0.18 对照」检查 — 路线 B 的核心价值（§3:19「产物天然带有改哪个 0.18 文件的映射」）和深度定义（§5:27）都要求 0.18 对照，但 D1–D8 没有一条检查它。这正是「被 0.18 带偏」最便宜的出口：RE 照抄 0.18 结论，再标一个「同」 — 证据: BRIEF.md:62-70 全文没有出现「0.18」或「同 / 改 / 新 / 删」 — 建议: 加 D2b：每个 Q 都有「0.18 对照：<0.18 路径> | 同/改/新/删」行，0.18 路径能 `ls` 到；标「同」的必须同时给出 0.78.1 锚点（光有 0.18 路径不算）。
- [MEDIUM] D6（:68）grep 语义 — 大小写敏感，又按子串匹配，结果两头错：标题里出现 sandbox / Inbox / Toolbox 会误报；Box、ssh、Computer Use 会漏报。「账号」还会误伤 MVP 标题：D4 本身就要求「不需要账号的替代源」，ui-shell Q1 也问「未登录可达」，写成「## 无账号替代源」这类标题就会被判 FAIL。「RE-cloud-deps 对上述 7 项各有 1 行」也没有给出检查方法，而且 SSH、移动端未必有云端端点 — 证据: BRIEF.md:44、:66、:68 — 建议: 改成 `grep -iE '^#+.*(\bbox\b|云电脑|ssh|vnc|computer[- ]?use|账号体系|移动端|远程连接)'`；cloud-deps 表固定一列「非 MVP 项」，用 7 个固定键各 grep 一次，不存在的写「无端点」。
- [MEDIUM] D8（:70）「每节的每一行」— mermaid 代码块和正文段落的「行」没有定义，没法机械判 — 建议: 规则改为每个表格数据行（`^\|`，表头和分隔行除外）都含 `RE-[a-z-]+\.md`；mermaid 块之后紧跟一行「来源：RE-…」。检查命令写进 D8。
- [MEDIUM] D3（:65）grep 范围 — contextBridge 暴露的方法名可能只出现在 preload / main，而短方法名（send、list）在 4 MB 的 bundle 里一定能命中，证明不了任何事 — 建议: 改成 `grep -rlF '"<全名>"' dist/renderer dist/electron-preload`；抽到泛名时重抽，或者要求带 service 前缀。
- [MEDIUM] §6 波次重叠 — features Q3（:52）与 ipc-rpc Q3（:38）都在问多 session 怎么多路复用；marketplace Q3（:46）与 ipc-rpc Q1（:36）都在问 MCP 由 main 还是 host 管。W1 并行的 RE 可能给出矛盾结论。cloud-deps 不依赖任何人，却放在 W2，而它恰好能喂死因 3。W1→W2 的先后也没有写理由 — 建议: features Q3 改为「引用 ipc-rpc Q3，只补 bot 维度」，这样 W2 排在 W1 之后才真有依赖；MCP 归属问题只交给 marketplace；cloud-deps 提到 W1，或者并入 W0 补充。
- [LOW] §6 W3 native（:58）— RE-unpack.md:77-87 已经列全 9 个 .node 的包名和大小，用途大多能从名字看出来，单开一个 RE 不划算 — 建议: 并入 W0 补充，或者并入 cloud-deps RE。
- [LOW] §6:32「W0（在途）」— RE-unpack.md 已产出，但追加要求（sha256、可复现命令、模块 diff）还没做，状态应改为「补充在途」，W1 以它为前置。
- [LOW] §9-1 截图 — 当前不存在 `~/.config/Grok*` 或 `~/.grokbot`（ls 无结果），不登录这个默认安全。建议派发时写明用 `--user-data-dir=/tmp/...` 的隔离 profile 启动，不填任何登录框；roadmap.md:17「本机没有安装」需要同步更正（`dpkg -l` 显示 `ii grok-bot 0.78.1`，已复核）。
reverse_take: 最可能的失败方式：RE 面对 minify 的 0.78.1，加上根本不在 deb 里的 host，只能用 0.18 recovered 填答案并标「同」，再配上在 27 KB 长行上「命中」的行号锚点，结果 P3 拿 0.18 当 0.78.1 设计。更笨也更稳的做法：先用一个脚本（不必派 RE）对 0.18 原始 asar 和 0.78.1 asar 做 4 轴机械 diff，每个 RE 只拿到变化项和 host 缺失的结论。
```

## 理由

### 1. 范围
做得忠实。7 个主题全部保留（BRIEF:9-10），非 MVP 项按 §5:29 只占表格行。跨会话消息的降级写在 §8:75，也同步进了 QUESTIONS.md:22 Q-003，默认值先执行、不阻塞，呈现得当。有一处小的夸大：roadmap.md:50 的深挖列本来只写「多 bot、多 session、跨会话消息」，群聊、自动化、记忆、审批原本就不是深挖，所以 §8 说「降为清单」时，真正降级的只有跨会话消息一项。不影响结论。真正的范围缺口在 MVP 旅程的定义（HIGH-4）：最小面会少掉工具调用、审批往返和冷启动恢复。这三样正是 P4 DONE 的三条验收（roadmap.md:81-83）。

### 2. 路线 B
放弃 A 的理由成立：0.78.1 全部是 minify 产物，从零逆向的边际成本极高。0.18 地图的 21 个路径我逐一 `ls` 过，全部存在。问题出在防漏机制上：
- 模块 diff 没定粒度，又拿「部分重构的源码树」去对「打包产物」（HIGH-3）。0.18 原始安装包就在本机，应该两个打包产物对着 diff。
- host 不在 deb 里（HIGH-1）。这是对路线 B 最大的冲击：0.18 的 host 侧（35 个扩展、storage、agents）在 0.78.1 里没有可对照的静态证据。RE 按 D2 必须给锚点，压力之下最容易把 0.18 的内容直接当成 0.78.1 的答案。
- 没有任何 DONE 条款检查「0.18 对照」，也没有要求「同」必须附 0.78.1 证据（HIGH-5）。

单就这三条，D7 兜不住「被 0.18 带偏」。

### 3. DONE
- D1、D4 可以证伪。
- D2 的锚点格式在 minify 文件上失效（HIGH-2）。
- D3 的 grep 范围和泛名问题（MEDIUM）。
- D5 可行，前提是先明确「未登录可达页面」列表来自 ui-shell Q1。
- D6 的 grep 会误报、漏报，还会和 D4 的措辞互相打架（MEDIUM）。
- D7 依赖一份还没定义的 diff（HIGH-3）。
- D8 的「每行」没法机械判（MEDIUM）。

### 4. 死因
三个死因都真实，但漏掉了两个更可能发生的：
- (a) host 和存储不在客户端产物里，深挖题没有证据可拿（HIGH-1）；
- (b) 锚定偏差：0.18 照抄 + 标「同」，而 DONE 不检查（HIGH-5）。

死因 1 的防法（sha256 + 解包命令）还不完整：解包命令没锁版本，beautify 步骤也不可复现（HIGH-2）。

### 5. 波次
W1 的三项都在 P3/P4 关键路径上，划分合理。但 W1 内部和 W1/W2 之间有重复提问（MEDIUM）；cloud-deps 没有依赖，放在 W2 只是排队；native 已经基本由 W0 产出，单独派一次 RE 不值（LOW）。真正需要的前置是「W0 补充（含 4 轴 diff 和 host 位置结论）完成 → 再派 W1」，现在的 BRIEF 没有写出这个依赖。

### 结论
问题都能靠修改文本解决，没有违反安全红线，也不是建立在已被证伪的事实上的根本性错误：ipc-rpc Q1 已经把 host 本地或云端当作开放问题在问。因此判 REVISE，不判 BLOCK。5 条 HIGH 修完后，r2 预计可以 PASS。
