# T49ac 回执：退出 flush 丢 ready 行（T49ab M4 失败路径补洞）

> 施工：main (GLM 5.3) | 2026-11-11 | feat/T49a @ 403f135e + 84c43dc0（Sol 增量复审补修）

## 改动（2 文件）

- `createStdoutGate.flushOnExit`：未 release 时放行缓冲的**诊断行**，但**丢掉 `^[p2sdk] ready ` 开头的行**；已 release 则无事可做（幂等）。release()（种子成功路径）行为不变——ready 行仍只在种子成功后放行。
- 顺手：`seedDefaultRoute` 里 `attempt === 0 ? ns?.revision : ns?.revision` 两支相同的三元改直接 `ns?.revision`（经理指出）。

## 验收原样输出

1. 单测 **58 passed**（新增两格）：
   - ① flushOnExit 滤行格：push(boot/ready/错误三行) → flush → 输出含 boot 与错误行、**不含** `[p2sdk] ready`；再 flush 无重复。**改前红**：现实现 flushOnExit=release 全放（ready 行泄漏）。
   - ② 集成格（真起 start.mjs）：`P2SDK_PATCH` 指向 `- id: llm-pi-ai\n disabled: true` 的 overlay——种子 mutate 被上游拒（`No configurable plugin entry "llm-pi-ai"`）→ **exit=1 + stdout 全程无 ready 行**（这正是 launcher 会被假 ready 骗过的那条路径）。手动验证原样：`exit=1`、stdout 空、stderr `seeding default llm route failed; not serving: settings/mutate failed: {...}`。
2. T49a e2e spec 仍 **1 passed**（ready 即查+custom model 断言不受影响）。
3. sdk 全量 **668 passed**（56→58 格，无新增红）。

## 注入法说明（记档）

- 先试「禁 dsh-api-settings-controller」——**不奏效**：remote 命名空间照样应答（禁插件行没禁掉 settings 服务），种子照常成功（手动复现 seeded 行）。
- 奏效的是**禁 llm-pi-ai**：mutate 直接被上游拒（settings/rejected: No configurable plugin entry）——种子第一步 describe 也过（ns 不在或空 user），到 mutate 抛错走失败分支,正是要测的路径。
- SIGTERM 转发后 dsh 退出可达 70s+（另观察到，非本单范围）；②里给 85s SIGKILL 兜底防挂测试。


## Sol 增量复审补修（84c43dc0，当场收口）

- MAJOR(M4 残留)：前导 CR/空格 ready 行漏滤 → 滤行口径改**最宽松消费者**（launcher hivebot:197 非锚定 grep 的子串 `\[p2sdk\] ready http`）——顺带发现并修掉「带尾注的 ready 行」（isReadyLine 严格正则不认但 grep 认）。单测①加前导 CR 变体行。
- MINOR：集成测试捕获 stderr,断言 `seeding default llm route failed` + `No configurable plugin entry "llm-pi-ai"` + exit 恰 1（证明真到种子失败分支,非参数校验早退）。
- Sol 探针 `/tmp/t49a-sol-cr-integration.mjs` 的 must-leak 断言现在反转失败=泄漏已消失；58p+e2e 1p 重跑全绿。
