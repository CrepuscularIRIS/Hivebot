# T81a：发消息即顶掉运行中的 turn（supersede，原版叫停语义）

> 开单：manager (Opus 5.5) 定法 + main 落单 | 日期：2026-11-13 | 施工：main (GLM 5.3)
> 来源：done/T81-probe-stop-flow.md「经理定的修法」1；RE-STOP-0.78.1.md（原版锚点：0.18 `send-turn-dispatch.ts:129-132` `runner.interrupt("superseded by a new user message")` + `enqueueExclusiveRun`）
> 用户拍板：Q-059 = A（2026-11-13）——删 Stop 照原版；本单是第一步，不等按钮
> 分支 / 作业目录：feat/T81a @ /tmp/bot-wt/T81a
> claimed：6de14c68 @ /tmp/bot-wt/T81a（2026-11-13）
> accepted：2026-11-13 feat/T81a @ 5a30d45a（manager 任务 B：sdk e2e 2 passed / UI e2e 1 passed / 回归 t74 1 + session 4 passed）
> 验收备注：①改动落在 shim `renderer-grok/shim/src/data.ts`（+9 行）而非 app/sdk——0.18 send-turn-dispatch 同位、零 dsh 改动，接受此边界调整。②验收 4 截图未交、`isRetry=true` 分支无测试——DOM 断言已覆盖「半截+新回复同屏」，补截图并入 T81b（同屏 UI 单）。③中② 裁决=已知限制（见回执末「经理核实」）。

## 目标
bot 正在跑时用户再发一条消息 → 当前 turn 被打断（半截已流出文字**保留**在 transcript）→ 新 turn 立刻开始并看到完整 transcript（含半截）。这是原版唯一的「叫停」。

## 动手前先读
1. work/persona-stop-gap/RE-STOP-0.78.1.md（原版机制全链）
2. 我们现状：先写失败测试**钉住现在的行为**（运行中发消息是被挡、排队还是并发——不猜，测出来）
3. dsh 侧 turn 调度：session/prompt 的 mode=queue 语义（examples/min-client.mjs 同款）；dsh 上游有没有现成 interrupt/supersede 通路（搜 dsh 包里 runner.interrupt / turn cancel），**有现成的优先用，没有才在 p2sdk 层做**

## 做法
1. 失败测试：sdk e2e（隔离 HOME），长 turn（fake 脚本慢流）进行中发第二条 → 断言现状（红=记录当前语义）
2. 改 turn 调度：第二条 prompt 到达时对运行中 turn 发 interrupt（supersede 语义），新 turn 排队即刻接续；半截 assistant 文本不删
3. 只动 SDK turn 调度 + 测试；**不碰 StopButton**（T81c 已拍板删，单开）

## 边界
1. 只动 `app/sdk/**`（turn 调度链）+ 对应测试；不改 dsh 上游（能配置/调用就不改源码）
2. 不做停止回执行（T81b 单开）
3. 测试走隔离 HOME/TMPDIR/DBus；fake 模型驱动（慢流可控）
4. 「先回一句再继续」话术已由 T80 的 How a turn works 段覆盖，不另加 prompt

## 验收（写命令，不写感觉）
1. 先红测试（现状语义记录）+ 绿测试：长 turn 进行中发第二条 → 旧 turn ≤5s 结束（cancelled/aborted 类终态）、半截文本仍在 transcript、新 turn 的回复回应第二条
2. 单测覆盖新增调度分支 ≥80% 改动行
3. e2e：既有 suite 不回归（session/market 抽查）+ 新场景 spec
4. UI 面表现（截图，DPR2 亮）：半截消息+新回复同屏可见——亲检交经理

## 产出
- `app/sdk/**`（调度链）、测试、`work/tickets/receipts/T81a.receipt.md`、evidence
