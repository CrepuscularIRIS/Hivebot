# T34：主 bot 编排开闸——orchestration.yml 进默认链 + SDK 侧数据根注入

> 开单：manager (Opus 5.5) | 日期：2026-11-08 | 施工：main (GLM 5.3)
> 来源：Q-035=A（全开）、Q-036=B；`work/bot-product-awareness/PLAN.md` §3；`work/p6-orchestration/PLAN.md:74`（P6-14b）
> 分支 / 作业目录：feat/T34 @ /tmp/bot-wt/T34
> claimed：
> accepted：

## 目标
生产启动（启动器、不带 P2SDK_PATCH）的主 bot 有 `create_bot` / `send_to_bot` / `stop_bot` 和路由提示（强制委派），worker 照 P6 信封受限；SDK 插件读的 bots.json 与 UI main 写的是同一个文件。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/sdk/src/start.ts:145-167`（buildArgs，照 T33 awareness 那一行的写法）、`:181-230`（childEnv）
3. `app/sdk/src/orchestration/identity.mjs:1-35`（orchDataDir；文件头 ponytail 注就是本单要消的）、`envelope.mjs:83-131`（**bots.json 缺失 = unknown = 按 worker 处理**，见下「回归面」）
4. `app/sdk/profile/patches/orchestration.yml`（文件头「不进默认链」要改）
5. `app/sdk/tests/unit/orchestration-routing-live.test.ts`（拿 system/message 文本的现成写法）、`tests/unit/awareness-prompt-live.test.ts`
6. 上游 DSH_* 擦除锚点：`repos/deepseek-harness/packages/subprocess/subprocess/src/index.ts:51-57`、`packages/shell/shell/src/types.ts:95-96`

## 经理探针结论（施工照此做，不再重探）
- **三项前置现状**：① 48 组定案——没做，本单不等它（理由见「为什么这样验收」第 4 条，复测改排 T35）；② 启动顺序（f4 遗留③）——main 侧冷启动闸门 f4 已实证（`VERIFY-P6-14f4.md` 3b：store.init 写骨架先于首个 session/create，与 patch 链无关），剩下的是「默认链 + 生产顺序」整链复验 = 本单验收 4、6；③ persona/section 在场断言——没做，= 本单验收 2 ①②。
- **数据根注入不走 `P2SDK_ORCH_DATA_DIR`**（推翻 orchestration.yml / identity.mjs 注释里的原计划）：P2SDK_* 会穿过 childEnv **且不被上游工具子进程擦除**（start.ts:175-177 注），等于把数据根路径告诉 bash，违反 P5-01 决策 15（start.ts:194-196）。改用 **`DSH_PBOTS_DATA_DIR`**：childEnv 放行 DSH_*，上游对工具子进程擦掉 DSH_*（DSH_HOME 同款先例）。
- **启动器不用改**：`app/launcher/hivebot:31` 已 export `PBOTS_DATA_DIR` 给 SDK 进程；start.ts 已读进 `cfg.dataDirs[0]`。
- **审批卡不加**：create_bot 不弹卡（与 0.79.3 一致；P6 BRIEF D4/D9 也没有卡），worker 自己的 bash 照走 shell-ask。不改审批。
- **UI 不用改**：Workers 分组（`shim/src/data.ts:180-206`）读 main 写的 `createdBy`，⑤ 通道（`main/index.ts:19 wireOrchChannel`）一直接着；开闸后自动出现。
- **T33 文案无冲突**：awareness 段只描述不指使；主 bot 有 create_bot → 走「follow its instructions」分支；worker 没有 → 走「explain how」分支，与信封拒再委派一致。不改 awareness 文案。

## 边界
1. 只动：
   - `app/sdk/src/start.ts`（buildArgs 加一行 orchestration.yml，位置 awareness.yml 之后、runtime patch 之前；childEnv 加一行 `child.DSH_PBOTS_DATA_DIR = cfg.dataDirs[0]`，注释说明为什么不用 P2SDK_ 前缀）
   - `app/sdk/src/orchestration/identity.mjs`（orchDataDir 顺序改为 `P2SDK_ORCH_DATA_DIR` → `DSH_PBOTS_DATA_DIR` → `PBOTS_DATA_DIR` → `$HOME/.config/pbots-ui`；删文件头 ponytail 注，改写数据根说明）
   - `app/sdk/profile/patches/orchestration.yml`（只改文件头注释：已进默认链，测试再显式叠加 = 同 id 整行替换）
   - `app/sdk/tests/unit/start.test.ts`（patch 数 6→7、位置断言、childEnv 新格）
   - `app/sdk/tests/unit/orchestration-default-chain-live.test.ts`（新）
   - `app/sdk/tests/support/runtime.ts`（bots.json 骨架播种，见下「回归面」）
   - 仅当验收 5 的 UI spec 因同名桩工具变红：`app/ui/tests/support/p6-peer-plugin.mjs`（最小改动，回执写清改了什么、为什么）
   - `work/**`（回执、LOG）
   别的不碰——不改 orchestration 插件逻辑、不改 envelope fail-closed 语义、不改 awareness、不改 UI 产品代码、不改启动器。超出就停下写进回执存疑项。
2. **回归面（必须处理）**：开闸后每个 bot 都过信封，`resolveWorkerStatus` 对 **bots.json 缺失返回 unknown → 按 worker 拒** subagent / subagent_fork / workflow / job_* / schedule_* / 后台 bash。生产无碍（main 启动先写骨架，f4 已证），但不起 UI main 的 SDK 测试（数据目录里没 bots.json）会整片变行为。处理法：`launchRuntime` 在启动前播种 `{"version":1}`，规则：
   - `opts.env.P2SDK_ORCH_DATA_DIR` 已给 → 不播（编排测试自己管身份文件，含故意缺失/损坏的格）
   - 否则目标目录 = `opts.env.PBOTS_DATA_DIR`，没有则 `opts.env.HOME` 下的 `.config/pbots-ui`；**目标不在 `os.tmpdir()` 下就不写**（绝不碰真实 `~/.config/pbots-ui`）；文件已存在不覆盖
   - 不经 launchRuntime 直接 spawn 的测试（`e2e/connector-restart|mock-demo|restart|security.test.ts`、`unit/launcher-lock.test.ts`）不改，跑验收 6 看是否受影响；受影响写进回执，不擅自扩范围
   **不许**为了让测试绿去改 envelope 的 missing→unknown。
3. 先写失败测试：先写 `orchestration-default-chain-live.test.ts` ①③ 和 start.test 新格，在当前主线上跑，贴红输出（预期：① 主 bot system 不含路由标记；③ 同；start.test patch 数 6≠7），再实现。
4. 测试走隔离 HOME / TMPDIR（`tmkdir('bot-T34-…')`），DBus 指向不存在路径；pnpm 带 `--config.verify-deps-before-run=false`。不跑全量 e2e。机器在跑 GPU 训练：长命令 `run_in_background` 跑一次等通知，验收 6 与其他长跑不并发。
5. 凭证不进代码、文档和日志（生产旁证里不贴 key、不读 `~/.config/hivebot/env`）。
6. 只在 feat/T34 提交；合并等经理验收。

## 验收（写命令，不写感觉）
（以下在 `app/sdk` 下执行，前缀 `pnpm --config.verify-deps-before-run=false vitest run`，下文简写 `VR`）
1. `VR tests/unit/start.test.ts` → 全绿；含：buildArgs patch 数 7，第 5 个以 `profile/patches/orchestration.yml` 结尾、runtime patch 在其后；childEnv 格：给 `PBOTS_DATA_DIR=/tmp/x` → 子 env `DSH_PBOTS_DATA_DIR === '/tmp/x'`，且子 env 里**没有任何 P2SDK_* 键的值等于 `/tmp/x`**、没有 `PBOTS_DATA_DIR` 键。
2. `VR tests/unit/orchestration-default-chain-live.test.ts` → 全绿。**不设 P2SDK_PATCH 引 orchestration.yml**（只叠 fake provider overlay），设 `PBOTS_DATA_DIR=<tmp>/data`、`HOME=<另一个 tmp>`（两者不同，默认路径下**没有** bots.json），**不设 P2SDK_ORCH_DATA_DIR**。至少这些格：
   - ① 主 bot：建会话后写 `bots.json {version:1, mainBotId:<该 id>}`，再发一轮 → system 文本同时含 persona 标记 `You are a coding agent powered by`、路由标记 `You are the main bot: you talk with the user and hand their hands-on work to worker bots.`、认知段标记 `## This app and the other bots`；路由标记出现在认知段标记之前（同一条 system 内比 index）
   - ② worker：bots.json 加 `bots:{<W>:{createdBy:<main>}}` 后 W 发一轮 → system 含 persona 与认知段、**不含**路由标记；认知段名册里 W 对应行带 `(worker created by "<主 bot 名>")`（证明认知段也读到了自定义数据根）
   - ③ 数据根：①能过本身即证明 SDK 读的是 `PBOTS_DATA_DIR` 而非 `$HOME/.config/pbots-ui`；另加一格断言 `$HOME/.config/pbots-ui/bots.json` 在整个用例里不存在
   - ④ 信封仍 fail closed：worker 会话 fake 脚本调 `subagent` → 工具结果为拒绝（error 文本/码照 `orchestration-envelope-live.test.ts` 现有断言写法），新增子会话数 === 0
   - ⑤ 环境泄漏：主 bot 会话 fake 脚本调一次 `bash`（命令 `env`；审批卡按 `tests/e2e/tiers-policy.test.ts` 现成写法应答），工具输出**不含** `<tmp>/data` 字符串、不含 `DSH_PBOTS_DATA_DIR`。这一格成本过高就停下写回执，不许删格或改成恒真
3. `VR tests/unit/orchestration-default-chain-live.test.ts --coverage --coverage.include=src/orchestration/identity.mjs` → identity.mjs Lines ≥80%（新分支 DSH_PBOTS_DATA_DIR 被命中）。
4. 编排既有单测（P2SDK_PATCH 再叠 orchestration.yml = 同 id 整行替换语义）：`VR tests/unit/orchestration-*.test.ts tests/unit/awareness-prompt.test.ts tests/unit/awareness-prompt-live.test.ts` → 全绿，文件数/用例数与施工前主线基线一致（回执贴两次原样尾部）。
5. UI（在 `app/ui` 下，先 `pnpm build`）：`p6-workers.spec.ts`、`p6-stuck.spec.ts` 两个 spec 按仓内既有 e2e 运行方式跑 → 全绿。p6-workers 用同名桩工具 create_bot/send_to_bot（`tests/support/p6-peer-plugin.mjs`），开闸后与真工具同名共存——红了按边界 1 最小改桩，回执写改法。
6. 回归（后台跑一次，`PBOTS_TEST_WORKERS=4`）：`VR tests/unit tests/e2e/subagent-policy.test.ts tests/e2e/schedule-delivery.test.ts tests/e2e/tiers-policy.test.ts tests/e2e/process-tiers.test.ts tests/e2e/write-outside.test.ts tests/e2e/guard-plugin-manager.test.ts tests/e2e/skill-write-card.test.ts tests/e2e/w1ap0-matrix.test.ts tests/e2e/security.test.ts tests/e2e/mock-demo.test.ts` → 与施工前主线同命令基线对比：**无新增红**（基线先跑一次存档；已知负载噪音格按 LEARNINGS 判，单跑复核）。回执贴两次的汇总行。
7. **生产旁证（必做，合并后由主 agent 执行，结果记 `work/LOG.md`）**：
   - a. 照 T33 旁证的做法重启生产实例载入新代码（启动器 TERM 优雅收、等新实例 ready）
   - b. 经 API 给主 bot 发：「请新建一个叫 T34 Probe 的 bot，让它在自己的工作区写一个 hello.txt，内容是 hi，做完告诉我。」
   - c. 记原样证据：主 bot 该轮事件里有 `create_bot` 调用且结果成功（贴 botId）；`$PBOTS_DATA_DIR/bots.json` 里 `bots[<botId>].createdBy === <主 bot id>`（只贴这两个字段）；`session/list` 有标题 `T34 Probe` 的会话；`$PBOTS_DATA_DIR/workspaces/<botId>/hello.txt` 内容 `hi`；主 bot 随后有一轮转述完成（worker 回报回合）
   - d. 能截图就截一张侧栏（只截目标窗口），显示 Workers 分组里有 T34 Probe；截不了写原因
   - e. 记下本次生产用的模型名（只记名字）。T34 Probe 留在实例里，LOG 注明「探针 bot，可在 UI 删除」
   - 任何一步失败：原样贴输出，不重试凑绿，交经理。

## 为什么这样验收
1. **要保住的是「生产里真能用」**，不是「测试里能用」：P6 编排 11-04 起就在 P2SDK_PATCH 下全绿，生产一直没有——所以 ② 明确不许走 P2SDK_PATCH，旁证 7 必须在启动器拉起的实例里真建出一个 worker。
2. 数据根：生产启动器设了显式 `PBOTS_DATA_DIR`；SDK 若退回 `$HOME/.config/pbots-ui`，用户一设 `XDG_CONFIG_HOME` 就读不到 bots.json → **全体 bot 被信封收窄**（连 subagent、后台 bash 都没了），比「没有 create_bot」更糟。所以 ② 故意让两个路径不同，③ 断言默认路径下没文件。⑤ 守的是决策 15：数据根不进模型可见环境。
3. persona/section 在场（原 P6-14b 前置③）：P6 曾出过 persona 被 checkout 静默回退、套件恒绿的事故（p6 LOG 11-04 22:15）。① ② 直接看组装后的 system 文本，回退就红。
4. 48 组定案不作开闸前置：r2 子集 28/30（Sol 验收数据完整性 PASS，`VERIFY-P6-22r2.md`），路由文案此后未改；定案原计划等 P6-24 合并后跑，而 P6-24 仍 blocked（删除链），等它等于无限期不开闸，与用户 Q-035=A 冲突。但 r2 测的是 glm-5.3，`start.ts` 缺省模型是 glm-5.3-flash，生产实际模型未知——所以旁证 7e 记模型名，复测排为 T35，不丢。
5. 回归 6 范围按「谁会被信封改行为」圈：用到 subagent / workflow / schedule / 后台 bash 的 e2e（grep 实得）+ 直接 spawn 不经播种的 e2e。

## 产出
- 修改：`app/sdk/src/start.ts`、`app/sdk/src/orchestration/identity.mjs`、`app/sdk/profile/patches/orchestration.yml`、`app/sdk/tests/unit/start.test.ts`、`app/sdk/tests/support/runtime.ts`
- 新建：`app/sdk/tests/unit/orchestration-default-chain-live.test.ts`
- 回执：`work/tickets/receipts/T34.receipt.md`（先红输出、各验收原样尾部、基线对比、存疑项）
- 合并后：`work/LOG.md` 生产旁证一节

## 已知不在本单（写进回执「未做」即可）
- worker 工作区与主 bot 分开（`workspaces/<botId>`）：用户 Q-024 要的「按任务直接在主 bot 目录改或开子目录」= P6-24，仍 blocked。开闸后用户说「改主 bot 目录里的文件」，worker 改不到——这是已知体验缺口，不是本单 bug。
- 恢复后首个隐藏工具调用一次 UNKNOWN_TOOL（f4 遗留，注释已声明上限）。
- veto 留持久孤儿行（f2 minor，UI 已滤）。
