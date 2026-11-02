seat: A
verdict: REVISE
confidence: high
findings:
- [HIGH] PLAN.md:25（T-01 ①②）、:45（D1 提案）— demo 链路漏了 Node 运行时前提：`@deepseek-ai/dsh@0.2.2-alpha.2` 声明 `engines.node >=24.9.0`，本机只有 Node v22.23.4，也没有 nvm/fnm/volta 的 24.x。PLAN、BRIEF、6 份 reuse 都没提 Node 版本。T-01 的 builder 第一步就会碰上它：要么在 Node 22 上硬跑（可能能起，也可能 alpha 依赖 24 的特性，属于没验证过的前提），要么 setup 自己去下载 Node，而这超出了 BRIEF:64 写的「setup 只做三件事」。— 证据: `curl registry.npmjs.org/@deepseek-ai%2fdsh/0.2.2-alpha.2` → `engines {'node': '>=24.9.0'}`；`repos/deepseek-harness/package.json:9` `"node": ">=24.9.0"`；`node -v` → v22.23.4；`grep -n "24\.9\|engines" PLAN.md BRIEF.md reuse/*.md` 0 命中 — 建议: T-01 加一条「Node 运行时」：用 pnpm 原生的 `useNodeVersion` / `devEngines.runtime` 钉 24.x（集成，不写脚本），验收为「在系统 Node 22 的 shell 里跑 setup 成功，start 起来的 dsh 进程 `/proc/<pid>/exe` 版本 ≥24.9」；§4 的 D1 提案把「准备钉定的 Node 运行时」写进 setup 允许做的事。
- [HIGH] PLAN.md:26（T-02 ①）、:36（D7 整体判定）— `unshare -rn` 新建的网络命名空间里 lo 是 DOWN 的，连 127.0.0.1 都不通。通道 B 走 loopback 的 HTTP/WS，照原样执行 `unshare -rn pnpm -C app/sdk test`，所有 e2e 都会因为「Network is unreachable」变红，验收命令本身就是错的。userns 在本机可用，所以 T-02 ① 写的兜底条件（userns 不可用时）不会触发，builder 只能自己临场改。— 证据: `unshare -rn ip -br addr` → `lo DOWN`；在 unshare -rn 里 connect 127.0.0.1 → `[Errno 101] Network is unreachable`；`unshare -rn sh -c 'ip link set lo up && …'` → ok — 建议: T-02 ① 和 :36 都改成 `unshare -rn sh -c 'ip link set lo up && pnpm -C app/sdk test'`，另加一条正向检查：同一命令里 `curl -m3 https://registry.npmjs.org` 必须失败，以此证明确实断了外网。
- [MEDIUM] PLAN.md:26（T-02 ②）、:28（T-04）— 首块屏障需要跨进程放行：fake 跑在 dsh runtime 进程里，测试和客户端在 vitest 进程里。dsh-llm-replay 只支持 `paceMs`，做不了外部闸门（dsh-as-dependency.md:74）。PLAN 没写放行通道用什么，T-04 的 D3 屏障也要同一个机制。builder 可能在 runtime 里自起一个控制端口（多一个 loopback 监听，T-08 ① 要解释它），也可能用大 paceMs 冒充屏障。— 证据: PLAN.md:26 只写了「直到测试…实际收到首块才放行」；dsh-as-dependency.md:11「需补…可选异步 pacing」 — 建议: 写死这个机制：fake 在 `$DSH_HOME/…/gate-<sessionId>` 上等文件或 FIFO，测试 touch 后放行；它算 T-02 `tests/support/` 的交付物，T-04 直接复用；验收里加一句「不得新增监听端口」。
- [MEDIUM] PLAN.md:27,39（T-03 与 T-02 并行）— T-03 的测试同样要「临时 DSH_HOME + 用 mock 起 runtime + 连上客户端」，但这个 launcher 归 T-02 的 `tests/support/` 交付，T-03 只依赖 T-01。两条并行的话，T-03 会在 `tests/market/` 里再写一个 launcher，区域不重叠，代码却重复，合并后还得统一。— 证据: PLAN.md:26 区域是 `tests/{support/,…}`，:27 deps 只有 T-01 — 建议: 最小的 runtime launcher（spawn start、`P2SDK_HOME=mkdtemp`、`P2SDK_PROVIDER=mock`、返回已连接的 `examples/lib` 客户端）归 T-01，放 `tests/support/runtime.ts`。T-01 ③ 本来就要证明能注入 mock patch，顺手交付即可，T-02/T-03 都复用。
- [MEDIUM] PLAN.md:25（T-01 ④）作为 T-02/T-03 的整体前置 — 真模型冒烟依赖 LiteLLM 的模型别名和 provider 映射（Q3 还没答，本机 `curl 127.0.0.1:4001/v1/models` 不带 key 返回 500）。这条出问题会卡住整个第二波，而第二波只需要 mock 模式。— 建议: T-01 的合并闸门拆成两段：①②③⑤ 加上「mock 模式下 min-client 自断言通过」就解锁 T-02/T-03；④ 真模型那条照样是 T-01 的 DONE，但不阻塞下游。这样 demo 仍排第一，关键路径上不挂外部服务。
- [MEDIUM] PLAN.md:25（T-01 ②）、:32（T-08 ①）— 「`ss -ltnp` 只看到 127.0.0.1 / ::1」没有限定进程。本机已有 0.0.0.0:20000、0.0.0.0:4000、*:22 在监听，不加过滤直接执行必然 FAIL，过滤方式就成了 builder 自己定。— 证据: `ss -ltn` 非 loopback 行：`0.0.0.0:20000`、`0.0.0.0:4000`、`0.0.0.0:22`、`[::]:22` — 建议: 改成「`ss -ltnp` 中 pid 属于 start 进程树（`pgrep -P` 递归）的行，本地地址全部是 127.0.0.1 / ::1」。
- [MEDIUM] PLAN.md:27（T-03 ③）— 「超过 1 组方法 → 回 G1」只限制了数量和命名空间，没定方法签名。P2 唯一新增的对外方法会由 builder 当场发明，而这正是 P3 契约的地盘（BRIEF:23）。— 建议: PLAN 里先把方法名和入参写定（例如 `p2temp/session.createWithConnectors({connectors:string[], agentPreset?, cwd?}) → {sessionId}`，内部做「注册临时 preset + session/create」），验收改为「`grep P2-TEMP` 的结果和 PLAN 列出的签名逐字一致」。
- [MEDIUM] PLAN.md:34（T-10）— 验收要求「evidence/ 下 D1–D8 各有一个文件」，但 D6 的证据要等 T-09，而 T-09 挂在 RE-marketplace 上；T-10 的 deps 只到 T-08。按现在写法 T-10 不可能通过，或者会诱导 builder 放一个空占位。— 建议: deps 补上 T-09，或者把验收改成「D6 文件写明 pending RE-marketplace + T-09 链接」。
- [LOW] PLAN.md:59（待查 Q1）— 这个问题按原写法没法回答：npm packument 里 `@deepseek-ai/dsh` 和 `dsh-api-gateway` 的 `0.2.2-alpha.2` 都没有 `gitHead` 字段。— 证据: `curl …/@deepseek-ai%2fdsh/0.2.2-alpha.2` → `gitHead None` — 建议: Q1 改为「tarball 和 ce7073d 在 3 处关键源码（provider 注入、follow assistantStream、session list/events）上对 lib 做 diff」，由 T-01 builder 就地完成。
- [LOW] PLAN.md:60（待查 Q2）— 本席已核实大部分：`@deepseek-ai/dsh@0.2.2-alpha.2` 直接依赖 `dsh-web-app@0.2.2-alpha.2`；`dsh-api-gateway@0.2.2-alpha.2` 导出 `./client`，带 `node` 条件构建（`lib/client.node.js`）；`dsh-api-session-controller`、`dsh-plugin-market`、`dsh-plugin-manager`、`dsh-mcp-client`、`dsh-user-approval`、`dsh-permission-presets` 都有 alpha.2。只剩「`dsh --profile web` 实际能不能起来」，这一点由 T-01 ② 覆盖。— 建议: 主会话可以不派 Q2 的 scout。
- [LOW] PLAN.md:25（T-01 ①）— 在 /tmp 新 clone 的场景里 `repos/deepseek-harness` 不存在，`git -C … status` 会直接报错，「为空」就无从判断。— 建议: /tmp 场景的判据改为「setup 后 `repos/` 不存在或仍为空」。
- [LOW] PLAN.md:25（T-01 ⑥）、BRIEF:70 — 覆盖率只计 `src/`。start 的 key 检查、token 0600、provider 映射都放在 `scripts/` 里，这些安全相关逻辑不进 80% 的分母。— 建议: start 的逻辑放进 `src/start.ts`，`scripts/` 只保留一行入口；或者让 T-08 的 e2e 显式覆盖这几条分支。
- [LOW] PLAN.md:31（T-07）— 「preset 表达不了时才自建 pre-execute 插件」是 builder 自己判断，验收里没有留痕。— 建议: 写 `src/policy/` 之前，先在 evidence 里放一条用纯 preset 配置跑出的红用例，作为自建的依据。
- [LOW] PLAN.md:24 vs :39 — T-00 的 status 写 todo，§3 却说已改完。本席已机械复核：5 个 grep 各命中 1 次，T-00 可以直接记 done。
reverse_take: 最可能的失败方式是 demo 第一天就卡在环境上（Node 24 要求、断网命名空间里 lo 没起），而不是卡在 dsh 能力上。更笨也更稳的做法：T-01 先在 pnpm 钉定的 Node 24 上用 mock provider 跑通「start → min-client 收到 chunk」，再把 launcher 和屏障放行通道当共享件交出去，真模型冒烟放到这之后。

---

## 结论
**REVISE**。没有 BLOCKER。两条 HIGH 都是环境前提或验收命令本身写错了，属于机械修补，改完不需要重新拆任务。PLAN 的骨架（路线 A、通道 B、一个 runtime 带 N 个 session、零自建存储、唯一的 p2temp 适配层）和 reuse 证据对得上，G1-r2 的两条清单也都落实了。

## 关注点逐条

### 1. 任务拆分与并行
- 区域：T-04～T-08 的文件区域互不重叠（PLAN:28-32）。profile 的改动按 `profile/patches/<名>.yml` 分文件，lockfile 只由 T-01 改（:42）。这套约定能支撑真实并行。
- 问题在共享测试件：runtime launcher 和屏障放行通道。T-02、T-03、T-04 都要用，但只有 T-02 的区域写了 `tests/support/`，而 T-03 和 T-02 是并行的（MEDIUM ×2）。
- 规模：T-01 很大（7 条验收），但它就是 demo 的纵向链路，再拆只会增加依赖，可以接受。

### 2. 验收可证伪性
- 大部分验收能落成命令。以下几处要么命令本身错，要么要靠 builder 自己裁量：`unshare -rn` 需要先把 lo 拉起（HIGH）；`ss -ltnp` 没过滤进程（MEDIUM）；`/tmp` clone 场景下 `git -C repos/…` 会报错（LOW）；T-03 ③ 没定签名（MEDIUM）；T-07 自建的触发条件没有留痕（LOW）。

### 3. G1-r2 清单落实
- 清单 2（A-HIGH）→ T-00：本席复核 BRIEF，`D1、D7、路线 A`、`D4、D5、D8`、`D3、D4、D7、D8`、`D7、路线 A/B`、`D8 安全底线（有条件` 各命中 1 次（BRIEF:32-37,71）；统一规则在 :29；§6.0 改为引用它（:59）。**落实。**
- 清单 1（B-HIGH）→ T-02：K≥3（比清单要求的 K≥2 更严）；首块屏障要等客户端实际收到才放行，超时 5s；用整轮缓冲 relay 做负对照、断言必须变红（变异测试，能证明测试真的有识别力）；还换了 prompt 检查过拟合。推演过一遍：缓冲 relay 截住首块 → fake 不会被放行 → 回合结束不了 → 5s 超时判 FAIL，负对照能真的变红。**落实。** 剩下的缺口只是放行通道没写（MEDIUM）和断网命令（HIGH）。

### 4. 范围纪律
- 4 项缺口里，①②③ 都是零自建、直接集成（PLAN:13，dsh-sessions.md:13-15）；④ 只有一个适配层（ext-mapping.md:32）。`src/policy/` 是内部插件、有条件，不对外暴露方法，不计入面积。没有跨 session 的编排层。**死因 5 守住了。**
- p2temp 的边界：命名空间和文件头标注都清楚（PLAN:14），但方法签名留给了 builder（MEDIUM）。§6「建 session 时选定、不支持热启用」这个品味项本席同意，有 ext-mapping.md:32（会话开始后不能换 preset）作证据，需要热启用就回 G1，口径是对的。

### 5. T-09 条件挂起与 T-01 / 待查的关系
- T-09 依赖 RE-marketplace，前提没回来就不进 ready，符合 BRIEF §6.0-c / R-3。本席在 G2 复核 R-3：**同意**。T-03 可以先做，因为它只用 fixture，不碰目录源，和 BRIEF:69「在那之前只按 MCP 推进」一致。风险是 RE 若发现 OAuth 或插件类连接器，T-03 的适配层要回审。这是可以接受的已知风险。
- T-01 不等 Q1～Q3 可行：Q2 本席已用 registry 核实为肯定（LOW 条）；Q1 按原写法无法回答，要换个问法（LOW）；Q3 由 builder 在 node_modules 里就地查，影响的只是 T-01 ④（所以建议它不阻塞下游，MEDIUM）。

### 6. demo 优先
- T-01 没有依赖，排在最前，依赖设计体现了「先把 demo 跑出来」。但 demo 链路真正的头号风险是 Node 版本（HIGH），PLAN 完全没看到；另外，真模型冒烟被当成了第二波的前置（MEDIUM）。

## §4 D 文字回审提案（本席意见）
- D1：同意，但「setup 只做的事」要加上「准备钉定的 Node 运行时」（见 HIGH-1）。
- D7：同意，断网命令要先拉起 lo（见 HIGH-2）。
- D8：同意。哨兵用 fake 驱动、真 key 只用于 D2，这样 G1-r2 B-MEDIUM 那条矛盾就解开了。
