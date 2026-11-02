seat: A
verdict: REVISE
confidence: high
findings:
- [HIGH] PLAN.md:36（`$OFFLINE`）— 「外网必须失败」这条正检查在本机是**空检查**：宿主机本身有外网，但连 registry.npmjs.org 的 TCP 握手超过 3s，`curl -sm3` 以超时（exit 28）失败，`! curl` 照样通过。所以这条命令在没断网时也会通过，HIGH-2 要求的正向证明并没有成立。另外机器上如果没有 curl，`! curl` 会得到 127，取反后同样通过。— 证据: 宿主机上连跑 3 次 `curl -s -m3 … -w code/t/connect`，3 次都是 `code=000 t=3.00 connect=0`、exit=28；`sh -c '! curl -sm3 https://registry.npmjs.org >/dev/null && echo HOST_PASSED_WRONGLY'` 输出了 HOST_PASSED_WRONGLY；同一台宿主机 `curl -m8` 返回 200；在 unshare -rn 里面得到 exit=6（无法解析）或 7（无法连接）— 建议: 探测改成判定具体失败原因，不再接受任意失败：`ip -o link | grep -qv ': lo:' && exit 1`（命名空间里除了 lo 不能有别的网卡），加上 `curl -sm10 https://registry.npmjs.org >/dev/null; rc=$?; [ $rc -eq 6 ] || [ $rc -eq 7 ]`。evidence 里再附一条宿主机对照：同一探测在命名空间外必须失败。
- [HIGH] PLAN.md:32（T-08 ③④）— zstd 扫描在系统 Node 22 上**只解第一帧**，而 dsh 的会话文件是多帧的。④ 的正对照用 `zstdCompressSync` 生成的是单帧样本，所以发现不了这个漏检。T-08 ⑤ 的真 key 扫描最可能直接用系统 `node` 跑，那样哨兵只要不在第一帧（header），扫描结果就是假绿。— 证据: dsh 先单独写一个 header 帧，再追加压缩流（repos/deepseek-harness `packages/session/session-persistence-jsonl/src/generation.ts:748,757`），读取时自己逐帧扫描（`zstd.ts:48 scanZstdFrames`，`generation.ts:441,590`）；实测把两个帧拼在一起：Node v22.23.4 的 `zstdDecompressSync` 和 `createZstdDecompress` 都只返回 `"frame1|"`；pnpm 钉定的 Node v24.22.2 返回 `"hdr|sk-canary-in-frame2"`（完整）；`zstd -dc` 也完整 — 建议: ④ 的正对照改成把哨兵**追加为一个新帧**，写在一份 dsh 实际产出的会话文件末尾（不能替换第一帧）；扫描器入口断言 `process.versions.node` ≥24.9，并且只通过 `pnpm -C app/sdk exec` 或 `pnpm test` 调用。
- [HIGH] PLAN.md:27（T-03 ③）— 「加载 / 不加载本项目 patch 后，方法表的差集恰好是 1 个」这条按现在的写法**不可能满足**。T-03 自己的 `market.yml` 必须装配 plugin-market 服务，这一步就会把 `pluginMarket/listIndexes`、`search`、`setIndexes` 等 dsh 自带的远程方法一起带进差集。T-05、T-07 的 patch 如果启用了带 remote 的服务，也是同样的情况。builder 只能自己改基线，这是本轮吸收 MEDIUM（p2temp 可枚举）时新引入的问题。— 证据: base 只装配了 `@deepseek-ai/dsh-plugin-manager`（repos/deepseek-harness `packages/bundle/base/cordis.patch.yml:21`）；web-app 只在 presets 里加载 `dsh-plugin-market/tools`（`packages/bundle/web-app/presets/cordis.patch.yml:136-137`），没有装配市场服务本体；reuse/market-backend.md:86,97 写的是需要「把 plugin-market 补入宿主装配」，装配后会注册 `/api/pluginMarket/*` — 建议: 基线改成「同一 profile，所有 `@deepseek-ai/*` 插件启用项都保留，只去掉 `app/sdk/src/` 里的自有插件」，这样差集才恰好是 `p2temp/session.createWithConnectors`。出口汇合 ③ 按同一口径复跑。
- [HIGH] PLAN.md:48（§4 D1 改写）— 可证伪性**少了一项**。原文的证伪项「commit 校验被跳过」被删掉了，「钉版本」这一维度却没有补上新的证伪项。setup 如果跑的是不带 frozen 的 `pnpm install`，lockfile 可以被静默改写，钉版本就失效了。这正是死因 2 的防线（BRIEF:44）。— 证据: BRIEF.md:64 的证伪项清单原有「或 commit 校验被跳过」；PLAN.md:48 的 ①–⑤ 只加了「Node 低于 24.9.0」这一项；`grep -n frozen PLAN.md` 0 命中 — 建议: R-5 的 D1 文字加一句证伪：「setup 使用 frozen lockfile；setup 后 `git status --porcelain app/sdk/package.json app/sdk/pnpm-lock.yaml` 非空，或 `node_modules/@deepseek-ai/dsh/package.json` 的 version ≠ 钉定版本」。T-01 ① 同步这一句。
- [HIGH] PLAN.md:50（§4 D8 改写 ①）、:32（T-08 ③）— 可证伪性**少了一项**：哨兵改成注入 fake 驱动的 runtime 之后，mock provider 根本不读 key，哨兵从来没经过任何可能泄漏它的代码，0 命中是空证明。原文「用哨兵跑 D2」会让哨兵走真实 provider 的取 key、构造请求头、处理鉴权错误这条路径，也就是最典型的泄漏点（错误日志）。改写后这条路径只剩真 key 的正常路径，鉴权失败的分支没人覆盖。— 证据: reuse/dsh-as-dependency.md:66（注册 `mock` 路由后「不需要真模型密钥」）；dsh-npm-details.md:88-90（pi-ai 通过 `apiKeyEnv` → `credentials.resolve(ref)` 取 key，这才是 key 实际经过的代码）；reuse/dsh-as-dependency.md:77（`dsh-llm-mock-server`「可用于真实 provider HTTP 适配器集成测试」，只走 loopback）— 建议: R-5 的 D8 文字加一句：「哨兵还须走一次真实 provider 代码路径：pi-ai 路由的 `apiKeyEnv` 指向哨兵，baseURL 指向测试进程里的 loopback stub（`dsh-llm-mock-server`，或一个记录请求头、先回 401 的 `http.createServer`）；stub 必须断言收到的鉴权头含哨兵（注入有效性正对照），随后照常扫描，0 命中」。这条完全离线，可以并进 `$OFFLINE`。
- [MEDIUM] PLAN.md:32（T-08 ⑤）vs :25（T-01 合并闸门）— 依赖倒置：⑤ 要用 T-08 的扫描器去扫 T-01④ 真 key 冒烟的产物，但 T-01④ 已经从合并闸门里拆出去了，T-08 的 deps 里也没有它。到 T-08 收尾时 ④ 可能还没跑；④ 先跑的话，扫描器又还不存在。— 建议: 把「真 key 冒烟 + 同一扫描器复扫（只输出计数）」移到出口汇合，列为第 ⑤ 项，由 verifier 在 main 上执行。T-08 只交付扫描器和离线部分。
- [MEDIUM] PLAN.md:32（T-08 ③ 扫描范围）— 「受跟踪文件、运行日志等普通文件」这个范围不够明确：默认 `DSH_HOME = app/sdk/.dsh/` 已经 gitignore（PLAN:16），「受跟踪文件」覆盖不到它；Settings 服务写的配置（`setIndexes` 走 Settings，market-backend.md:59）、credentials 服务的落盘位置，也都不在 sessions 子目录里。dsh 子组件如果绕开 DSH_HOME 写到 `~/.cache` 一类目录，同样会漏掉。— 建议: 写死范围：递归扫描整个 `$P2SDK_HOME`；跑测试时 `HOME`、`TMPDIR` 也设成 mkdtemp，并一起递归扫描；再加 git 工作树里的全部文件（含未跟踪和已忽略的）、日志和 cmdline。
- [MEDIUM] PLAN.md:50（D8 ③）、:25（T-01 ②）— 只用 start 进程树（`pgrep -P` 递归）过滤 `ss`：子进程如果 setsid 或二次 fork 后被重新挂到 init 下，它开的监听就会逃过检查。T-02 ② 已经在用「无新增监听」的差集口径。— 建议: D8 ③ 写成「start 进程树内的监听行，以及 start 前后 `ss -ltn` 的新增行，都只能是 loopback」，两个口径同时判定。
- [LOW] PLAN.md:25（T-01 捷径）— `.npmrc use-node-version` 这条退路实际走不到：本席实测 pnpm 11.0.9 原生支持 `devEngines.runtime`（`onFail:"download"`），install 38s 装好 node 24.22.2；`pnpm run` 和 `pnpm exec node -v` 都是 v24.22.2，lockfile 里记录为 `node@runtime:24.22.2`，package.json 没被改写。— 建议: 删掉退路，免得 builder 去踩 pnpm 11 读 `.npmrc` 的语义问题；同时加 `devEngines.packageManager`（或 `packageManager: pnpm@11.0.9`）钉住 pnpm 本身，因为 pnpm 低于 10.14 不认 `devEngines.runtime`。
- [LOW] PLAN.md:36（`$OFFLINE`）— D7 要求「没有 API key」，命令本身没有强制，目前只靠 harness 自己清（T-02①）。— 建议: 命令前加 `env -u P2SDK_LLM_API_KEY`，把 key 变量从命令层面清掉。
- [LOW] PLAN.md:34（T-10）vs :38（出口汇合）— T-10 要求 evidence 下 D1–D8 各有一个文件，但 D7 的判定发生在 T-10 之后。— 建议: 写明 T-10 时 D7 文件只放阶段性验证，出口汇合时追加最终判定。
- [LOW] PLAN.md:25（T-01 ④）— 「`pnpm -C app/sdk exec node …`」：`-C` 会把工作目录切到 app/sdk（实测 `pnpm -C <dir> exec node -e 'process.cwd()'` 输出的就是 `<dir>`），脚本路径要相对 app/sdk 写，即 `examples/min-client.mjs`。见下文 D2 意见。
reverse_take: 最可能的失败方式是「检查器全绿，却什么都没测到」：外网探测是靠超时通过的，zstd 只解了第一帧，哨兵走的是根本不读 key 的 mock，三处都是空通过。更笨也更稳的做法是：每个否定式检查都配一个在本机实测会变红的正对照，即宿主机上跑探测必须红、哨兵埋在第 2 帧、stub 必须收到哨兵。

---

## 结论
**REVISE（第 2 轮 = 有条件通过，清单转为派发附加要求，不再开第 3 轮）**。没有 BLOCKER。G2-r1 的四条 HIGH 在结构上都落实了，但 HIGH-2 和 HIGH-4 新加的两个正检查，经本席在本机实测都会空通过（上面第 1、2 条 HIGH）。另外，吸收 MEDIUM 时引入了一条不可能满足的验收（T-03③，第 3 条 HIGH）。D1、D8 的改写各少了一项证伪（第 4、5 条 HIGH），都只需补一句文字，不必回 G1。以上都是机械修补，不涉及任务拆分。

## 关注点 1：G2-r1 四条 HIGH
| HIGH | 落实 | 本席核验 |
|---|---|---|
| 1 Node 钉版 | 已改：§1-13、T-01 ⓪ 与捷径、D1⑤、T-10 README | **实测成立**：pnpm 11.0.9 + `devEngines.runtime ^24.9.0 / onFail download` → node 24.22.2，`pnpm run` 和 `pnpm exec` 都是 v24；`pnpm -C <dir> setup` 跑的是 package 脚本，不是 pnpm 内置的 setup（用假 HOME 实测）。只剩 LOW：退路删掉，pnpm 也钉版本 |
| 2 $OFFLINE | 已改：lo up 已加，「外网必败」写进去了 | **lo 部分成立，正检查是空的**（HIGH-1）：宿主机 `-m3` 超时也能通过 |
| 3 出口汇合 | 已改：T-10 deps 补了 T-09，出口汇合四项，D7⑤ | 成立。附带两条新的不一致（T-08⑤ 依赖倒置 MEDIUM，T-10 与 D7 文件时序 LOW） |
| 4 zstd 解码扫描 + 正对照 | 已改：先探测、解码、未知格式判 FAIL、正对照 | **方向对，正对照没有区分力**（HIGH-2）：Node 22 只解第一帧，单帧样本测不出来 |

## 关注点 2：MEDIUM 七行全吸收
表态合理，七行都有落点，本席逐行对过 PLAN。唯一的问题是「p2temp 可枚举」这一行的落点（方法表作差）基线选错了，变成不可能满足（HIGH-3）。「真模型冒烟不挡第二波」已经在 T-01 合并闸门里落实，但 T-08⑤ 又把它重新耦合了回来（MEDIUM）。

## 关注点 3：D1 / D7 / D8 限定回审（逐条）
- **D1：批准（条件：R-5 文字同时写入 HIGH-4 的证伪句）**。①–④ 忠实反映了 S4=b 的结论（npm 精确版本，不碰 repos/）；⑤ 把 Node 运行时列进允许事项，本席已实测可行。问题出在原证伪项「commit 校验被跳过」删了没有替代，可证伪性减少，必须补上 frozen lockfile 和已装版本核对。不补的话，本席对 D1 的意见是不批准。
- **D7：批准**。①③④⑤ 都忠实；② 首块屏障加上整轮缓冲判 FAIL，是增强。「$OFFLINE 探测空通过」属于 PLAN 层面的命令错误（HIGH-1），不影响 D7 的文字（「外网探测必须失败」这个本意没错）。建议 R-5 顺手写成「外网探测须以无法解析或无法连接失败，不接受超时」，更稳。
- **D8：批准（条件：R-5 文字同时写入 HIGH-5 的真实 provider 路径哨兵句）**。①「真 key 只用于 D2，同样扫描」解开了 G1-r2 的矛盾，这部分忠实；②「解码后扫描 + 正对照」是增强，正对照的具体做法按 HIGH-2 修正，属于 PLAN 层面；③ 进程树过滤属于精确化，建议补差集口径（MEDIUM）。不过 ① 把哨兵挪到 mock 路径之后，真实 provider 鉴权失败那条路径就没有哨兵覆盖了，可证伪性减少。不补的话，本席对 D8 的意见是不批准。
- **D2 措辞（`node` → `pnpm -C app/sdk exec node`）：批准随 R-5 记账，并且建议现在就无条件改，不要「跑不了再改」**。理由：① BRIEF.md:56 本来就允许 PLAN 在保持「一条命令」粒度的前提下改命令名，这次改动不改变 D2 的三项断言、退出码和 key 来源，可证伪性不变，严格说用不着回 G1，记进 R-5 是为了留痕。② 条件分叉等于把选择权交给 builder，而且「Node 22 今天能跑」证明不了什么：gateway 的 `./client` 在 registry 上**没有声明 engines**（本席查过 `@deepseek-ai/dsh-api-gateway@0.2.2-alpha.2` 是 `engines None`），能不能跑没法事先判定；本席又实测到 Node 22 和 24 在 zlib 上的行为确实不同（HIGH-2）。客户端和 runtime 跑在不同的 Node 版本上，是一个真实存在的不一致来源。定稿写法：`pnpm -C app/sdk exec node examples/min-client.mjs "你好"`，或者在 package.json 加一个 `demo` 脚本，用 `pnpm -C app/sdk demo "你好"`。README「启动」节也照这个写。

## 关注点 4：新引入的不一致
- T-03③ 的方法表作差不可能满足（HIGH-3）。
- T-08⑤ 依赖 T-01④，但 deps 里没有，扫描器的交付时序也是反的（MEDIUM）。
- T-10 的 evidence D7 文件和出口汇合的时序（LOW）。
- 编号、区域：T-00～T-10 连续；只有 T-01 改 package.json、lockfile、`.npmrc` 和 `tests/support/runtime.ts`（PLAN:44）；T-02 的 `tests/support/fake/` 和 T-01 的 `tests/support/runtime.ts` 不重叠；各任务的 profile 改动分别落在 `market.yml` / `presets.yml` / `approval.yml` / `market-source.yml`，按文件合并没有冲突。deps 图除 T-08⑤ 外没有环、没有缺项。gate 文件路径在 T-01⑧、T-02、T-04 和 §7 MEDIUM 表里口径一致（`$P2SDK_HOME/gates/<id>`）。

## 实测记录（本席，2026-11-01）
- 宿主机 `curl -s -m3 https://registry.npmjs.org`：3 次都是 exit 28，t≈3.00s，connect=0；`-m8` → 200。命名空间里是 exit 6（域名）或 7（IP）；`unshare -rn` 里 `id -u` = 0。
- 两帧拼接的 zstd 样本：Node v22.23.4 的 sync 和 stream 解码都只得到第一帧；`pnpm exec node` 下的 v24.22.2 得到完整内容；`zstd -dc` 也完整。
- pnpm 11.0.9 的 devEngines.runtime 探针：install exit 0，耗时 38.2s，`pnpm run`、`pnpm exec node -v` 都是 v24.22.2；`pnpm -C <dir> setup` 跑的是 package 脚本。探针目录已清理。
- registry 查询：`@deepseek-ai/dsh-api-gateway@0.2.2-alpha.2` 没有 engines 字段，`./client` 有 node 构建（`lib/client.node.js`）。
