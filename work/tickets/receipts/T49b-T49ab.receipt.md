# T49b+T49ab 回执：Sol 四条 MAJOR 返修（原分支追加提交）

> 施工：main (GLM 5.3) | 2026-11-11 | feat/T49 @ 9d13a770（T49b）/ feat/T49a @ 6da027de（T49ab）

## T49b（M1：引用名与派生同源）

- **共用 `deriveKeyRef(route)`**（export，与 DSH client.js:1358 同式）：mutate 的 apiKeyEnv 判定与 set/unset 的 `SETTABLE_REF_RE` 一条规则——「能存路由就能存 key」结构保证。
- `SETTABLE_REF_RE` 允许中间下划线：`my-route`/`my_route`/`a-b-c` → `MY_ROUTE_API_KEY` 等此前「存得进路由存不进 key」的全部可写。
- route 正则收紧**字母开头** `^[a-z][a-z0-9_-]{0,63}$`：数字开头派生 `1ABC_API_KEY` 非合法 POSIX env 名——**DSH 上游 client.js:1668 注释自认该缺陷**（「A digit-leading id passes every check this card makes and then fails at the credential seam」），我们在源头拒绝。锚点已核，非猜测。
- 验收原样：单测 **84 passed**（原 81+新三格，③为性质测试：7 个样本 route 派生名必过 set 守卫）；改前红尾三格（①my-route 等 set 被拒 ②1abc mutate 本应 forbidden ③性质断言失败）。
- Sol 脚本 M1 段转通过：`hyphen route key set: {"ok":true}`（原 `pbots/forbidden`）。

## T49ab（M2/M3/M4）

- **M2**：`writeRuntimePatch` real 分支加 agent-default-model config patch 行（`model: ${yamlScalar(cfg.model)}`），mock 分支 mock/mock 不变——两分支对称，p2sdk.yml 静态值只作兜底。
- **M3**：`seedDefaultRoute` 重构为两轮循环——describe 拿 `ns.revision`，mutate 三参 `{ns, ops, expectedRevision}`（wire 键名与 DSH `settings.mutate(ns, ops, expectedRevision)` 一致，client.js:3307）；`settings/conflict` 冲突 → 重读一次：已有 litellm（并发方写了）**放弃种子**，没有再试一次，仍冲突抛给 main 拒启。
- **M4**：新增 `createStdoutGate(isMock)`（可桩单元）：real 模式 dsh 全部 stdout 缓冲，`release()` 才一次性放行（ready 行绝不早于种子）；mock 直通；子进程 exit 兜底 flush（错误诊断可见）。`main()`：种子成功 → `handle.releaseStdout()`；种子失败 → 不放行（消费者见退出不见假 ready），forward SIGTERM 非零退出。
- 验收原样：
  - 单测 **56 passed**（五新格：①runtime-patch real 含 default-model 行 model=custom-review-model ②mutate 带 expectedRevision=7 ③冲突重读后放弃（只试写一次）④gate real 持有到 release/exit flush ⑤gate mock 直通）。改前红尾：`ReferenceError: createStdoutGate is not defined` 等 4 格。
  - e2e **1 passed**——已改为「**一见 ready 行立即查**」（无轮询，Sol 指出的盲点不再被掩盖）+custom model 场景断言 `default = {provider:litellm, model:custom-review-model}`。
  - 回归：sdk 全量 **666 passed**；launcher.spec **不作为本单回归依据**——排查结论见下（测试自身过期+环境故障，均与本批改动无关，T51 前基线同挂）。
- Sol 脚本转通过（原样输出）：
  - race probe（M3）：`concurrent user save committed: http://user-edited.example/v1` ×2 → `after seed: {"baseURL":"http://user-edited.example/v1",…}`——**种子没有覆盖并发保存的用户值**。
  - review probe（M2/M4）：`immediate-ready catalog: {"default":{"model":"custom-review-model"},"routableProviders":["litellm"]}`——**ready 那一刻路由已在且 default 跟 custom 模型**（原复现：routableProviders 空 + default 指向 glm-5.3-flash）。

## 备注（记档，不修）

- review probe 的 `upstream-echo test`：上游若在**错误消息**里回显 value（`refused synthetic-key`），m1 照透传——通用错误透传行为，过滤上游错误文本有误伤风险；key 值仍只在「我们发的请求」与上游回显中出现，m1 自身错误/日志不含 value（⑧断言）。Sol/经理均未对此立项。
- gate 单元的 `flushOnExit` 用 `this.release`——对象字面量方法引用，非箭头；测试覆盖 exit 兜底路径。


## launcher.spec 排查补记（非本单回归,证据链）

1. worktree 首跑 9 failed → 主仓（不含 T49 系）2 passed/8.2min → **T49a worktree checkout 回 T49a 前基线、主仓 checkout 回 T51 合并前（d182f906）① 均同挂** → 非本批代码回归。
2. **mock 系（①②④）= 测试过期**：① 失败时刻 Page snapshot 是 **onboarding landing 页**（Welcome to Grok Bot + Get started/Skip）——launcher.spec ① 断言「就绪即 .sand-agent-item」，而 **T26（11-07）改真首启语义**（onboardingUnseen 且 roster 空不自动建 main bot）后，产品链首启必进 landing；该 spec 自 T26 合并后未再跑过，断言失效。修复属测试维护（单开），不阻塞本批。
3. **real 系（⑤⑥⑦⑧）= 环境故障**：本机 LiteLLM 4001 `/v1/models` 回 `{"error":{"message":"Internal server error"}}`（500，No connected db——T49 探针首轮误打 4001 时即见同错）。LiteLLM 是用户基础设施，不动，待用户处理。
4. 排除性证据：手动 `hivebot serve`（mock）成功出 HIVEBOT-SERVE 行；裸 electron+`--remote-debugging-port` 的 CDP `/json/version` 正常（Chrome/152）；worktree ui 产物补 build 后①仍挂（排除产物缺——首轮确因产物缺秒退，已修）。
5. 教训：管道 `… | tail` 会掩盖 playwright 非零退出码——上一轮「launcher exit 0=11 格全过」是误读，实为同批失败；回测必须 grep `passed|failed` 的数字行。
