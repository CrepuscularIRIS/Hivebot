# T62：launcher.spec 维护——①②④ 跟上 T26 真首启语义，⑤⑦⑧ 不再依赖用户本机 LiteLLM

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`receipts/T49b-T49ab.receipt.md`「launcher.spec 排查补记」（T49 线验收旁证）
> 分支 / 作业目录：feat/T62 @ /tmp/bot-wt/T62
> claimed：d75d4602（07894942 施工 + Sol MAJOR 修复，feat/T62 @ /tmp/bot-wt/T62，2026-11-11 待经理验收）
> accepted：2026-11-11 d75d4602（manager 任务 B：重跑 launcher.spec 9 passed (55.1s) 无 skip、⑥真跑；diff 2abe980a..d75d4602 只含 launcher.spec.ts；Sol MAJOR 修复治本——⑥子进程 env 显式构造不含 P2SDK_LLM_BASE_URL、XDG_CONFIG_HOME 为新建空目录，SDK 走 app/sdk/src/start.ts:34 DEFAULT_LLM_BASE_URL=4001，探测同址）

## 目标
`app/ui/tests/e2e/launcher.spec.ts` 恢复成可信的回归网：在一台 LiteLLM 坏了的机器上，除「真模型一轮」外全部能跑绿，失败就代表真回归。

## 已知（施工方排查，经理认可）
- ①②④（mock 系）失败时 snapshot 是 onboarding landing：T26（11-07）改真首启语义后，首启必进引导，spec 仍断言「就绪即 `.sand-agent-item`」——**测试过期**，T51 合并前基线同挂。
- ⑤⑥⑦⑧（real 系）：本机 LiteLLM 4001 `/v1/models` 回 500（No connected db），用户基础设施，**不动它**。
- 教训：`… | tail` 吃掉 playwright 退出码，回测必须看 `passed|failed` 数字行。

## 做法
1. ①②④：照 `tests/e2e/onboarding.spec.ts` ③「老用户 seen=1」的方式预置数据目录，让这三格测的仍是「启动器生命周期」而不是引导。**不改断言的意图**（拉起→就绪→关窗→无残留等），只改前置。
2. ⑤⑦⑧：逐格查清它为什么要 4001（写回执）。只是顺带打到的 → `P2SDK_LLM_BASE_URL` 指向测试内起的本地桩（回 `/v1/models` 与一条最小 chat 响应即可）；确实要真模型的留在 ⑥。
3. ⑥（真模型一轮）：保留真实依赖。开跑前探一次 `GET $BASE/v1/models`，非 200 → `test.skip` 并把状态码写进 skip 理由（**不许静默 skip**：理由文本里必须带探测到的状态码）。
4. ③a（无 key 拒启）照旧；T50a 以后会改这一格，不在本单。

## 边界
只动 `app/ui/tests/e2e/launcher.spec.ts`（及其可能新增的 `tests/e2e/support/` 下桩文件）。不碰 launcher、sdk、产品代码。如果查出确有产品回归 → 停下，回执写清，派经理任务 C。

## 验收
1. 本机（LiteLLM 仍坏）：`cd /tmp/bot-wt/T62/app/ui && pnpm build && PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/launcher.spec.ts; echo EXIT=$?` → 除 ⑥ skipped（理由含状态码）外全 passed，`EXIT=0`；回执贴 playwright 汇总行原样。
2. 反证 ①：把预置的 seen 去掉跑一次 ① → 红（证明前置真起作用，不是断言被放松）；回执贴红尾。
3. `git diff --stat` 只含边界内文件。

## 为什么这样验收
这个 spec 是启动器、凭证不外泄（⑤）、退出码（⑦）的唯一回归网，已经「一直红」两周没人信它了。目标是让它红的时候有意义：所以既要让它在坏环境下绿（1），又要证明不是靠放松断言变绿（2）。
