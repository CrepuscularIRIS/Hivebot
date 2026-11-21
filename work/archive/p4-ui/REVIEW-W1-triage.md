# REVIEW-W1-triage（R1–R13 对 main=1608d10 逐条判定）

commit: 1608d10（2026-11-02 验收时 HEAD）
来源：work/p2-sdk/REVIEW-P2终审.md R1–R13（针对 U-11/12/13 旧代码，head=aa9d934）；
此后并入 U-14（3b71577）/ U-16（9dd0c5f）/ U-15（6b00167→1608d10）。
方法：逐文件读 main 当前源码 + git log/diff 定位修复 commit；未采信任何口头申报。

## 判定表

| # | 原位置 | 判定 | 证据锚点（main=1608d10） |
|---|---|---|---|
| R1 | m1-api/index.ts:95 connectors 无 bundle 名形状校验 → SDK join 路径穿越 | **仍成立**（锚点迁移） | #4 现经 wrapM1WithOrchestration（main/index.ts:90-102，:144 接线）进 createBotWithConnectors，校验仍只查「非空字符串数组」：orchestrate.ts:67-73 + preset-id.mjs normalizedConnectors（同弱校验）；SDK sink 未动：app/sdk/src/p2temp/index.mjs readConnectorRows `join(profileDir,'node_modules',name)`（约 :114-118）。'../../x' 仍可逃出 profile 探测/注入，且 U-14 后 recipe 先落盘（orchestrate.ts:99），穿越名还会随 #21 每次启动重放。 |
| R2 | main/index.ts:98 首次 dsh 连接失败无重试无 catch | **部分成立** | 根因未动：dsh/connect.ts 自 22f806f 零改动——start() 首败只 reject（:72-75），scheduleReconnect 仅由已建 socket 的 onDead 触发（:85-87,:91-100），ready() 无 reject/超时（:103-108）。已缓解：U-14 给 dshStart 接 error 分支并 setRestoreSettled（main/index.ts:159-166，restore 闸门不再挂死）；M2 有 10s 超时。剩余：M1 `pbots:api` 与 M3 `pbots:bots-meta` 经 dsh.rpc→ready() 永久 pending（ipcMain.handle 永不 settle）；main/index.ts:122 `void dshStart.then(...)` 派生 promise 仍无 rejection handler。 |
| R3 | dsh/connect.ts:106 首败后 ready()/rpc() 永久挂 | **部分成立**（与 R2 同根因） | connect.ts 层未修（同上）；消费面 M2 已防（awaitLive 10s 时限，m2-mux/index.ts:243-255），M1/M3 无任何防护，rpc() 挂进永不 resolve 的 readyWaiters（connect.ts:105-107）。修复落点与 R2 同一处。 |
| R4 | m3-meta/index.ts:82 session/list 传 `{cursor:null}`，wire 参数名是 `_request` | **仍成立** | m3-meta/index.ts:84 原样 `rpc('session/list', { cursor: null })`。U-14 改过该文件但只加 init 句柄（3b71577 diff 共 6 行，全在 M3Handle 接口）。上游 `list(_request, signal)`：repos/deepseek-harness/packages/api/session-controller/src/index.ts:278-281；SDK e2e 正确形态 `{_request:{}}`：app/sdk/tests/e2e/mock-demo.test.ts:56、connector-restart.test.ts:212。生产 mainBotId patch 全部被 gateway arguments-invalid 拒。 |
| R5 | m1-api/index.ts:69 installBundle 命名参数被当位置数组拒 | **已失效** | b636266 补对象分支（m1-api/index.ts:71-73 读 args.options），命名 `{spec,options}` 通过、数组形态保留兼容；真链路探针实证（commit 正文引 work/p4-ui/evidence/U-15/）。 |
| R6 | m1-api/index.ts:159 #4 直通 rpc，不走编排/不写 recipe | **已失效** | 6b00167 新增 wrapM1WithOrchestration（main/index.ts:90-102），:144 `wrapM1WithOrchestration(registerM1Api({dsh}), dsh, m3.store)`；#4 → createBotWithConnectors：缺省 agentPreset 解析（orchestrate.ts:84-93）+ recipe 先于 session 落盘（:96-102）。单测 tests/unit/shell/wire.test.ts。 |
| R7 | orchestrate.ts:105 裸参数无 `{request:…}` 壳 | **已失效** | orchestrate.ts:106-112 包壳（b636266）；restore.ts:36 包壳（3b71577，U-14 e2e 对真 runtime 实测）。 |
| R8 | m3-meta/store.ts:28 多实例写覆盖、无单实例锁 | **仍成立** | store.ts 自 9ad048c 零改动：实例私有 meta/queue（:26-28）、flush 全量快照无重读合并（:71-77）、固定 tmp 名 `${file}.tmp`（:73）；app/ui 全树 grep requestSingleInstanceLock/second-instance = NONE。 |
| R9 | m3-meta/store.ts:90 flush 失败不回滚内存态，失败操作被后续成功提交 | **仍成立** | store.ts:80-93（putRecipe/patchMainBotId 先改 this.meta 再 flush，无补偿）、read() 只抛 loadError 不反映 flush 失败（:56-59）、后续成功 flush 序列化整个内存态把失败操作落盘（:72）。 |
| R10 | m1-api/index.ts:84 审批作答先消费后发送，rpc 失败作答永久丢失 | **部分成立** | consume-before-send 未动：checkArgs 内 validateResult（m1-api:88，:154 调用）→ ledger.ts:53 delete，rpc 在 :163，失败无回滚。U-16 缓解面有限：deadline 代答只看 ledger.pendingEvents()（deadline.ts:94），已本地消费的事件对它不可见，不救此场景；断链重连后 gateway 对新 client 补发未决 → m2 tap 重记 pending（m2-mux/index.ts:216-217）可重试——覆盖断链类失败。剩余：socket 存活时的瞬态 HTTP 失败（如 503）仍永久丢作答，renderer 重试得 forbidden 'eventId not pending'。 |
| R11 | orchestrate.ts:105 同 R7（opus 席重复发现） | **已失效** | 同 R7（b636266 + 3b71577）。 |
| R12 | m1-api/index.ts:159 同 R6（opus 席重复发现） | **已失效** | 同 R6（6b00167）。 |
| R13 | dsh/connect.ts:85 死 socket 仍被 ready() 返回 | **部分成立** | 根因未动：onDead 不清 this.socket（connect.ts:85-87）、ready() 见 socket 即返回（:103-104），文件自 22f806f 零改动。消费面已防：m2-mux deadSockets WeakSet + awaitLive 轮询跳死 socket 等下一代（m2-mux/index.ts:136,:243-255；4c4da48 引入、9dd0c5f 扩展到常驻订阅循环 :219-227 与 openMainEvents try/catch :198-200）；rpc() 走 HTTP 不经 socket。剩余：DshConnection ready/generation 契约本身仍破（代码自认「U-00 层不改」，m2-mux/index.ts:252 ponytail 注）；rpc 在重连间隙不等待新代即发 HTTP，断网窗口 fetch 裸抛经 ipcMain.handle 变非结构化 rejection；未来不经 m2 守卫的新消费者仍会踩。 |

## 汇总

- **仍成立 4 条**：R1、R4、R8、R9
- **部分成立 4 条**（根因层未修，消费面部分缓解）：R2、R3、R10、R13
- **已失效 5 条**：R5、R6、R7、R11、R12（修复 commit：b636266 修 R5/R7/R11，6b00167 修 R6/R12，3b71577 修 R7 的 restore 侧）

### 仍成立（含部分）归组与修复任务建议

| 区域 | 条目 | 建议修复任务 |
|---|---|---|
| m1-api（2 条） | R1、R10 | R1：编排层（orchestrate.ts 入口）加 connectors bundle 名形状校验（禁 `..`/绝对路径/非 scoped 斜杠），m1-api checkArgs 同步收紧；R10：改为「rpc 成功后消费」或失败回滚 re-add pending（与 ledger 配合） |
| m3-meta（3 条） | R4、R8、R9 | R4：`{cursor:null}` → `{_request:{}}`（一行）+ 单测改断真形状；R8+R9 同文件一个任务：单实例锁（requestSingleInstanceLock）或读合并写，flush 失败回滚/重载 |
| dsh-connect + main-index（3 条） | R2、R3、R13 | connect.ts 一个任务同修三处根因：start() 首败接 scheduleReconnect、onDead 清 this.socket（ready() 自然挂起等新代）、rpc/ready 加超时或 reject 通路；顺带 main/index.ts:122 补 catch。U-14/U-12/U-16 的消费面缓解可保留为纵深 |

去重后实际修复任务约 5 个（R2=R3 同根因合并、R8+R9 同文件合并）。
