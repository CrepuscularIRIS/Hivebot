# PLAN · p2-sdk

v2 · 2026-11-01 · director · v1 + G2-r1 REVISE 回应（§7）· 输入：BRIEF v2.1（G1-r2 有条件通过 + 修订账 R-1～R-4）、reuse/ 六份、D-iface-r1、QUESTIONS（Q-001=b、Q-002、Q-004=B 已答）、panels/G2-r1{,-A,-B}.md
排序原则（用户 11:56「先把 demo 跑出来」）：demo 纵向链路（T-01）排最前、依赖最少，质量守护（T-02）紧随其后，多 session / 市场在后。每条任务 = 一个 builder、一个 worktree `/tmp/bot-wt/T-xx`、分支 `feat/T-xx`。dsh 基线 = npm `0.2.2-alpha.2`（源码行号对照 `ce7073d`，见待查 Q1）。

## 1. 决策记录（选了什么 / 放弃什么 / 为什么）
1. **路线 A 组合式**：`app/sdk` = dsh web 模板 profile + 自有 patch。放弃 B 门面、C fork（BRIEF §3，panels/G1-r2.md）。
2. **通道 B：`/api` + `/api/remote.mux`**（panels/D-iface-r1.md 两席一致 + 用户 Q-004）。放弃 stdio：无实时 chunk，缺 list / history / per-session 配置（reuse/dsh-api.md:12，dsh-sessions.md:14-15）。契约约束：renderer 经 IPC、main 是唯一 mux 客户端、token 只留 main（P4 执行；P2 的 Node 客户端就是 main 的替身）。
3. **依赖**：npm 精确版本 + lockfile。放弃 workspace link / git / 本地 tarball（dsh-as-dependency.md:9,49-60）。setup 不读写 `repos/`。
4. **进程模型**：一个 runtime 承载 N 个 session。放弃每 session 一子进程：补不了 list/history，常驻成本翻倍（dsh-sessions.md:16,102-104）。S9 关闭。
5. **fake LLM**：`dsh-llm-replay` 优先，动态脚本复制 MockAdapter 最小逻辑。放弃 `dsh-llm-mock-server`（走真 provider HTTP 路径）和 `agent-loop-testkit`（不能聊天）（dsh-as-dependency.md:74-78）。
6. **持久化 / 历史 / per-session 配置**：全部集成 dsh 现有能力，零自建存储（dsh-sessions.md:13-15）。
7. **市场**：集成 plugin-market + plugin-manager + mcp-client（market-backend.md:9-11）。唯一自建：「连接器 → session 组合」适配（ext-mapping.md:32），即 T-03③ 写定的 1 个 `p2temp` 方法，放在 `app/sdk/src/p2temp/`，文件头标「P2-TEMP：P3 可推翻」。
8. **审批**：集成 user-approval + permission-presets。「普通 shell 必问」只有在 preset 表达不了时，才自建一个 `tools/pre-execute` 小插件（ext-mapping.md:33-34）。
9. **真模型**：本地 LiteLLM 的 glm 5.3 flash（Q-002 答复），配置 `P2SDK_LLM_BASE_URL`（默认 `http://127.0.0.1:4001`）、`P2SDK_LLM_MODEL`、`P2SDK_LLM_API_KEY`。key 只从 env 读，不进代码和日志。setup 与 test 不要求 key，只有 start 的真模型模式检查它。
10. **数据目录**：`DSH_HOME` 默认 `app/sdk/.dsh/`（gitignore），可用 `P2SDK_HOME` 覆盖；测试一律用 mkdtemp。绝不指向 `~/.grokbot`。
11. **web 模板自带的 client UI 插件**：patch 里关闭，以贴近 BRIEF「只含后端」；关闭后起不来就保留，并记 evidence（机械决定）。
12. **superagent 不进 PLAN**（Q-001=b，BRIEF R-2）；用户「总 Grok Bot 是 SuperAgent、日常 bot 是 DSH」的猜想已并入 P1 features RE 问题清单，留作未来 superagent slug 的 BRIEF 输入。
13. **Node 运行时**：pnpm 原生 `devEngines.runtime` 钉 `^24.9.0`（dsh `engines.node >=24.9.0`；本机 v22.23.4、无版本管理器，G2-r1-A 实测；本机 pnpm 11.0.9）。放弃系统 Node 22 硬跑（未验证前提）、setup 自写下载脚本（超出 D1 允许事项）、要求用户装 nvm（违背一条命令起）。

## 2. 任务图
| id | 任务 | owner | 区域 | deps | status | review | 捷径 | 验收（可证伪） | evidence |
|---|---|---|---|---|---|---|---|---|---|
| T-00 | BRIEF §3.1 修订（G1-r2 A-HIGH）：S4/S3 行补 D7，S5/S6 行补 D8，D8 改「有条件」，加统一规则 | director | work/p2-sdk/BRIEF.md | – | done | – | 无（文档修订，本轮已由 director 直接改） | 修订账有 R-1；BRIEF 中「D1、D7、路线 A」「D4、D5、D8」「D3、D4、D7、D8」「D8 安全底线（有条件」各 grep 命中 1 次 | BRIEF R-1；主会话 grep 复核 2026-11-01 11:52 四项各命中 1；G2-r1-A 复核 5 项各命中 1 |
| T-01 | **demo 纵向链路**：钉 Node + 钉版 + setup + start + min-client + 共享 launcher（D1、D2） | builder | app/sdk/{package.json,pnpm-lock.yaml,.npmrc,.gitignore,vitest.config.ts,scripts/,src/start.ts,profile/,examples/,tests/support/runtime.ts} | – | todo | M | Node 用 `devEngines.runtime`（`onFail:"download"`；pnpm 不认时退回 `.npmrc` 的 `use-node-version`），不写下载脚本；集成 `@deepseek-ai/dsh@0.2.2-alpha.2` 精确版（dsh-as-dependency.md:9），用 web 模板，patch 按 `profile/patches/*.yml` 逐个加载；连接流程照 gateway `tests/operator-connect.host.spec.ts:249-339`，客户端优先复用 `RemoteStreamMuxClient`（dsh-api.md:126）；follow 带 `assistantStream:true`（dsh-api.md:78） | ⓪ 在 `node -v`=v22 的 shell 里 setup 成功；start 起来的 dsh 进程 `/proc/<pid>/exe --version` ≥ v24.9.0 ① 「/tmp 新 clone」和「本机 clone」各跑一次 `pnpm -C app/sdk setup` 都成功；/tmp 场景 setup 后 `repos/` 不存在或为空，本机场景前后 `git -C repos/deepseek-harness status --porcelain` 都为空、HEAD 不变 ② `pnpm -C app/sdk start` 60s 内输出 ready 并常驻；`ss -ltnp` 中 pid 属于 start 进程树（`pgrep -P` 递归）的行，本地地址全是 127.0.0.1 / ::1 ③ 缺 `P2SDK_LLM_API_KEY` 时 start 非零退出、报错写出变量名；`P2SDK_PROVIDER=mock` 时不查 key、可注入额外 patch；启动逻辑放 `src/start.ts`（计入覆盖率），`scripts/` 只留一行入口 ④ `node app/sdk/examples/min-client.mjs "你好"`（真模型，key 从 env）脚本内自断言 ≥1 个 chunk 早于 turn end、有 turn end，否则退出码≠0；系统 Node 22 跑不了 → 改 `pnpm -C app/sdk exec node …`，D2 命令措辞并入 §4 回审；客户端代码放 `examples/lib/` ⑤ ready 行和日志里没有 launch token（写入 `.dsh/launch-token`，0600）⑥ devDeps（dsh-llm-replay、vitest、coverage）和 T-03 的市场包一次钉齐；vitest 覆盖率阈值 80%，只计 `src/` ⑦ `/usr/bin/time -v` 记 setup 耗时和峰值内存 ⑧ 共享 launcher `tests/support/runtime.ts`：mkdtemp `P2SDK_HOME`、mock provider spawn start、返回已连接的 `examples/lib` 客户端和 `release(gateId)`（touch `$P2SDK_HOME/gates/<gateId>`，即屏障放行通道，不开任何端口）；mock 模式下 min-client 自断言通过。**合并闸门**：⓪–③⑤–⑧ 过即合并、解锁 T-02/T-03；④ 单独补证，通过前 T-01 不记 done | |
| T-02 | **fake provider + 测试骨架 + 伪流式证伪**（G1-r2 B-HIGH，D7 基座） | builder | app/sdk/tests/{support/fake/,e2e/stream.test.ts} | T-01 | todo | S | 集成 `dsh-llm-replay`（dsh-as-dependency.md:10）；测试 patch 选 `mock` provider（:66）；动态脚本复制 `agent-loop/tests/mock-adapter.ts` 最小逻辑并注明出处（:11），首块后轮询 gate 文件（replay 只有 paceMs，:74）；launcher 用 T-01⑧ | ① harness：临时 DSH_HOME、清掉真实 key，`$OFFLINE`（表下）全绿，含其中「外网必须失败」检查 ② 首块屏障：K≥3，fake 发出首块后等 gate 文件，测试经 `examples/lib` 客户端**实际收到**首块才 `release`；5s 超时判 FAIL；断言 K 个 chunk 按序到齐之后才出现 turn end；屏障期间复跑 T-01② 的 `ss` 判据，无新增监听 ③ 负对照：在客户端和 socket 之间插一个「整轮缓冲 relay」，同一测试必须红（测试内用 `rejects` 断言）④ 换一个提示词再跑，验证不是对固定文本过拟合 | |
| T-03 | 市场 dsh 侧 + 连接器按 session 启用（D6 基座，`p2temp`） | builder | app/sdk/{src/p2temp/,profile/patches/market.yml,tests/market/} | T-01 | todo | M | 集成 plugin-market `search`、plugin-manager `installBundle`、mcp-client（market-backend.md:9-11）；自建只有适配层：建 session 时用 preset 选定连接器（ext-mapping.md:32,44）；launcher 用 T-01⑧ | ① `/api/pluginMarket/search` 对本地 format-1 快照能返回条目（快照只作 fixture）② 装一个 MCP bundle fixture（enabled:false）→ 建 X 时启用、建 Y 时不启用 → X 的工具表含 `mcp__<name>__*`，Y 不含 ③ 唯一新增对外方法 `p2temp/session.createWithConnectors({connectors:string[], agentPreset?:string, cwd?:string}) → {sessionId}`（内部 = 注册临时 preset + `session/create`）：测试对 runtime 实际注册的方法表作差（加载 / 不加载本项目 patch），差集恰为这 1 个；`grep -rn "P2-TEMP" app/sdk/src` 与该签名逐字一致；禁止自建安装器（用 installBundle）、存储、跨 session 调度、对已开聊 session 热启用；违反或需第 2 个方法 → 回 G1（死因 5） | |
| T-04 | D3 并发不串线 | builder | app/sdk/tests/e2e/concurrency.test.ts | T-02 | todo | S | 复用 T-02 harness 与 T-01⑧ gate 通道；单 runtime 多 session（dsh-sessions.md:16） | 断言 D3 原文全部内容；屏障 5s 超时判 FAIL（A-LOW）；3 个 session 共用 1 条 mux socket，各开一路 follow；sessionId=X 的流里只有 X 的标记 | |
| T-05 | D4 per-session 配置 | builder | app/sdk/{profile/patches/presets.yml,tests/e2e/config.test.ts} | T-02 | todo | S | 集成 `session/create(agentPreset)` + `session/selectModel`（dsh-sessions.md:15,70-72）、agent-preset-registry（ext-mapping.md:35） | 断言 D4 原文；两个 session 都显式 selectModel（dsh-sessions.md:74）；fake 在请求侧记录的 model、preset 指令和工具集合逐 session 断言；配置查询走 `session/projections`（:76） | |
| T-06 | D5 重启存续 + 断线重连（契约约束） | builder | app/sdk/tests/e2e/{restart,reconnect}.test.ts | T-02 | todo | M | 集成 session-persistence-jsonl、`session/list`、`session/events`（dsh-sessions.md:13-14,42-44）；重连按 follow 的 snapshot/cursor 走（dsh-api.md:80,126） | ① 2 个 session 各聊 1 轮 → `kill -9` → 用同一条 start 命令重启 → list 返回这 2 个 session，events 取回历史 ② 流式输出中途 `kill -9` 再起：已完成的回合都在，中断的回合已被收尾（dsh-sessions.md:50）③ 关掉 mux socket → 重新 `/connect` → 重新 follow → snapshot + cursor 补齐断线期间已持久化的事件；旧 cookie 被拒（dsh-api.md:84）；不断言 transient chunk 会重放 | |
| T-07 | D8 审批 | builder | app/sdk/{src/policy/,profile/patches/approval.yml,tests/e2e/approval.test.ts} | T-02 | todo | M | 集成 user-approval + permission-presets（ext-mapping.md:33）；先试用 preset 的 ask 覆盖普通 shell，不够再写 `tools/pre-execute` 插件（:34,45），写 `src/policy/` 前先在 evidence 放纯 preset 配置跑出的红用例；不得照抄 keyless-smoke / loader-smoke 的放权配置 | fake 发起 shell 调用 `touch <tmp>/canary`，客户端经 `$events`（interactions=answer，dsh-api.md:82）收到带 sessionId 的审批请求：拒绝 → 文件不存在；sessionId 不符的批准 → 文件不存在；正确批准 → 文件存在（正例）；解析后的默认权限不是 bypass，也不是 danger-full-access | |
| T-08 | D8 端口 / 鉴权 / 凭证不落盘 | builder | app/sdk/tests/e2e/security.* | T-02 | todo | M | 复用 connection 的 admission 逻辑（dsh-api.md:59-63），不自写鉴权；zstd 解码用 Node 内置 `zlib.zstdDecompressSync`，不加依赖 | ① T-01② 的进程树 `ss` 判据 ② 不带 cookie 调 `POST /api/session/list` → 401/403；跨站 Origin 被拒；`/connect?token` 换到 cookie 后可用（正例）③ 先探测：`find $DSH_HOME/sessions` 记录实际文件后缀（默认 `session.v4.jsonl.zstd`，dsh-sessions.md:29-34）；扫描器对 `.zstd` 先解码再搜，对受跟踪文件、运行日志等普通文件、`/proc/<pid>/cmdline` 直接搜，遇到不认识的压缩 / 二进制格式判 FAIL 不跳过；哨兵 `sk-canary-p2sdk-<随机>` 注入 provider 环境，用 fake 驱动跑「建 session → 对话 → kill → 重启」，全部 0 命中 ④ 检查器正对照：故意把哨兵写进一个压缩会话文件（`zstdCompressSync`）和一个普通日志 → 扫描必须 FAIL 并报出命中路径；输出只打印路径和 `sk-canary-p2sdk-` 前缀 ⑤ 真 key 只用于 T-01④ 的 D2 冒烟，同一扫描器对真 key 再扫一遍，只输出命中计数，不打印 key | |
| T-09 | D6 市场验收（**有条件：S7 Grok 侧 + P1 RE-marketplace**，前提未回不得 ready） | builder | app/sdk/{profile/patches/market-source.yml,tests/e2e/market.test.ts} | T-02, T-03, RE-marketplace | todo | M | 同 T-03；目录源按 S7 / RE 的结论选 | 断言 D6 原文；N 和连接器名等 RE 回来后按 §6.0-b 填写；replay 脚本强制 X 调用该工具（A-LOW），X 的流里能看到调用和结果事件，Y 的工具表里没有它 | |
| T-10 | README 与 evidence 索引 | builder | app/sdk/README.md | T-01–T-09 | todo | – | 无（文档） | README 有「setup」「启动」（一条命令、`P2SDK_*` 变量、LiteLLM 默认值、Node 由 pnpm 钉定）「临时扩展」三节，临时扩展列出的方法与 T-03③ 签名逐字一致；`evidence/` 下 D1–D8 各有一个文件 | |

`$OFFLINE` = `unshare -rn sh -c 'ip link set lo up && ! curl -sm3 https://registry.npmjs.org >/dev/null && pnpm -C app/sdk test'`（G2-r1-A 实测：userns 可用，新命名空间里 lo 默认 DOWN；`! curl` 是「外网必须失败」正向检查，外网通则整条命令失败）。
**阶段性验证**：T-02～T-08 全部合并后，verifier 在 main 跑一次 `$OFFLINE` + 覆盖率，只作阶段证据，不算 D7 判定。
**出口汇合（P2 唯一的完成判定）**：T-09、T-10 都合并后，verifier 在 main 跑 ① `$OFFLINE` 全绿（含 D3–D6 自动化版）② 覆盖率 ≥80%（`src/`）③ 复跑 T-03③ 方法差集 ④ `evidence/` 的 D1–D8 逐条核对（D6 为真实市场证据）。任一不过 → 不收尾；过了才进 `mm-review L` / G3。

## 3. 波次与并行
- **首批**：T-00（done）→ T-01（demo；合并闸门见 T-01，④ 真模型不挡下游）→ T-02 与 T-03 并行（区域不重叠，都复用 T-01⑧ launcher）。
- **第二波**：T-04、T-05、T-06、T-07、T-08 依赖 T-02，区域互不重叠，可以同时派。机器在跑 GPU 训练，主会话按 iowait / load 限流。
- **后续**：T-09 等 RE-marketplace → T-10 → 出口汇合（表下）。
- 区域约定：只有 T-01 改 `package.json` / lockfile / `.npmrc` 和 `tests/support/runtime.ts`；后续任务的 profile 改动各写自己的 `profile/patches/<名>.yml`，按文件合并不冲突。

## 4. D 文字回审提案（§6.0-b，只审 D1 / D7 / D8；最终稿，由 G2-r2 一并限定回审）
批准归属（G2-r1 B-MEDIUM）：G2-r2 对 D1/D7/D8 逐条给同意 / 不同意；同意的由 director 写进 BRIEF 修订账 R-5，不同意的那条回 G1，不阻塞无关任务。若 T-01④ 退到 `pnpm exec node`，D2 命令措辞随 R-5 同改。
- **D1**（S4 = npm）：①「按钉定 commit 取到固定路径」改为「按 `app/sdk/package.json` 精确版本 + lockfile 从 npm 安装」②「commit 钉在文件」改为「版本钉在 package.json 精确版本 + lockfile」③ 删去「本机 repos/ 已存在时只校验 commit」，改为「setup 不读写 `repos/`」④ 证伪拆成「/tmp 新 clone」和「本机 clone」两个场景，分别留证 ⑤ setup 允许事项加一件：「准备 `package.json` 钉定的 Node 运行时（pnpm `devEngines.runtime`，dsh 要求 ≥24.9.0）」；证伪加「start 的 dsh 进程 Node 低于 24.9.0」。
- **D7**：①「钉定 commit」改为「钉定版本」② 加首块屏障判据：K≥3，fake 发首块后挂起，直到外部客户端观察到首块才放行，带超时；整轮缓冲的实现判 FAIL ③ 加断线重连用例（契约 Q-004，D-iface-r1.md:19）④「断网」落为 `$OFFLINE`：先拉起 lo，且外网探测必须失败 ⑤ 判定只在出口汇合点做（含 D6 自动化版），之前的轮次只算阶段性验证。
- **D8**：①「用哨兵 key 跑 D2/D5」改为「哨兵 key 注入 fake 驱动的同一 runtime 和持久化路径，跑建会话 → 对话 → 重启；真 key 只用于 D2，同样扫描」② 会话存储按实际格式解码后扫描（默认 zstd），扫描器须过正对照（故意植入哨兵 → 必须 FAIL）③ `ss` 判据限定为 runtime 进程树。

## 5. 品味项（交 G2）
- 连接器「在 X 启用」= 建 X 时选定（走 preset），不支持对已开聊的 session 热启用（ext-mapping.md:32：会话开始后不能换 preset）。如果产品要求热启用，就超出 4 项缺口 → 回 G1。

## 6. 待查（主会话派 scout；T-01 不等这些结论，builder 先就地读 node_modules，scout 结论与之矛盾时再改）
- Q1：**packument 无 gitHead（G2-r1-A 实测），原问法答不了，等 scout 改用 dist-tags / 发布时间与 `ce7073d` 提交时间对照**。结论前由 T-01 builder 对 provider 注入、follow assistantStream、session list/events 3 处就地 diff tarball 与 `ce7073d` 兜底。
- Q2：**已核实（G2-r1-A）**：dsh 依赖 `dsh-web-app@0.2.2-alpha.2`；`dsh-api-gateway` 导出 `./client`（node 构建 `lib/client.node.js`）；市场 / 审批相关包均有 alpha.2。「`--profile web` 实际能起」由 T-01② 覆盖，不派 scout。
- Q3：dsh 的哪个 provider 能指向 OpenAI / Anthropic 兼容 endpoint（LiteLLM `127.0.0.1:4001`），配置键是什么？launch token 能否外部指定，或者从哪里读出（避免它进 stdout）？
- （已在途）P1 RE-marketplace → 解锁 T-09 和 D6 的 N / 连接器名。LiteLLM 上 glm 5.3 flash 的模型别名由 T-01 builder 自查：`curl $P2SDK_LLM_BASE_URL/v1/models`，key 走 env，不打印。

## 7. G2-r1 回应（panels/G2-r1.md，REVISE）
- 前情 G1-r2（v1 §5，结论未变）：清单 1 → T-02②③ + D7 提案；清单 2 → BRIEF R-1 / T-00；MEDIUM、LOW 全吸收；拒绝 renderer 鉴权冒烟进 P2（P2 无 renderer，归 P4）。
- HIGH-1 Node 钉版 → 已改：§1 决策 13、T-01 捷径与 ⓪、§4 D1⑤。HIGH-2 断网命令 → 已改：表下 `$OFFLINE`（含外网必须失败）、T-02①、§4 D7④。
- HIGH-3 出口汇合 → 已改：表下「阶段性验证」/「出口汇合」、T-10 deps 补 T-09、§3 后续、§4 D7⑤。HIGH-4 压缩会话漏检 → 已改：T-08③（先探测格式、解码后扫、普通文件 / 日志 / cmdline、未知格式判 FAIL）④（检查器正对照）、§4 D8②。

| MEDIUM | 表态 | 落点 |
|---|---|---|
| A 屏障跨进程放行 | 吸收：gate 文件 `$P2SDK_HOME/gates/<id>`，不开端口 | T-01⑧、T-02 捷径 / ②、T-04 |
| A launcher 共享 | 吸收（优先）：归 T-01，T-02/T-03 复用 | T-01⑧、§3 |
| A 真模型冒烟挡第二波 | 吸收：拆合并闸门；④ 仍属 T-01 DONE，demo 排序不变 | T-01 合并闸门 |
| A `ss` 未按进程过滤 | 吸收：限定 start 进程树 | T-01②、T-08①、§4 D8③ |
| A p2temp 签名 + B p2temp 可枚举 | 吸收：签名写定（P2-TEMP，P3 可推翻）+ 注册方法表作差 + 禁止清单 | T-03③、出口汇合③、§1 决策 7 |
| A T-10 缺 T-09 | 吸收，并入 HIGH-3 | T-10 deps |
| B D1/D7/D8 批准归属 | 吸收：G2-r2 一并限定回审，R-5 记账 | §4 首行 |
| LOW 全部（附，拒绝 0 条） | 吸收：Q1 换问法 + 就地 diff、Q2 免派；/tmp 场景判据；`src/start.ts` 计覆盖率；T-07 自建前留红用例；T-00 记 done | §6、T-01①③、T-07、T-00 |
