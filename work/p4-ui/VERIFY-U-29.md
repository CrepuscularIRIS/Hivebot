# VERIFY-U-29 · P4 终审 L-5 B+C 组（R7/R8/R9 + O1/O2）

verdict: PASS
commit: 8b816fcf3f81113323fe9840e81b59592e4323e6（worktree /tmp/bot-wt/U-29，验收期间 head 未漂移，结束时现场干净）

## 复跑（不信 builder 自述，全部自跑）

| 命令（均在 /tmp/bot-wt/U-29/app/ui，HOME=/tmp/bot-u29-verify） | 结果 |
|---|---|
| `pnpm build` | ✓ built in 1.07s |
| `pnpm exec vitest run` | ✓ Test Files 25 passed, **Tests 206 passed**（恢复现场后二次复跑同绿） |
| `pnpm exec playwright test --workers=1` | ✓ **53 passed (5.6m)**，exit 0；`--list` 确认 53 tests in 20 files 含 `journeys/d1-real-model.spec.ts › D1+D2 真模型…` → **d1-real-model 全量 run 中首绿 = R9 实证** |

## 验收项

| 验收项 | 结果 | 证据 |
|---|---|---|
| ① R7 safeRpc + metaApi 四处调用 | PASS | main/m3-meta/index.ts:49-58 `safeRpc`（rpc throw → 结构化 M3Result），liveView:78 与 handler:103 两处 dsh.rpc 全走 safeRpc；renderer/shell/store.ts:86-92 `metaApi`（.catch 兜成 !ok，U-22 GU-1 api() 同模式），四处调用 store.ts:227(loadRoster)/239(refreshMeta)/259(start)/291(setMainBot)；grep 全 renderer 无 metaApi 之外的裸 `botsMeta` 残留 |
| ② R8 代答 catch 保留 pending | PASS | main/m2-mux/deadline.ts:69-82：内层 try/catch 兜 rpc rejection → 结构化 log + return（since 不动、answered 不进）+ finally 清 inFlight → 下一轮 review() 按窗口语义重试。**取舍终裁：REVIEW R8 原文明确写「应在代答函数内捕获异常、记录失败并保留 pending」「Fix: add a catch in answer() (log and leave pending)」——实现与原文逐字对应，连 verifier 证据里的 nuance（finally 清 inFlight、since 保留、retry-on-next-round 语义存活）都保持，无偏离** |
| ③ R9 sdkChildEnv + envOrDotenv | PASS | tests/support/sdk-env.ts:16-20：`{...process.env}` **副本**上 delete 凭证 key（worker 的 process.env 不动，REVIEW 建议「strip from the spread passed to spawn's env」同款）；creds.ts:8-21 envOrDotenv **process.env 优先 → .env 兜底 → undefined**；接线：sdk-runtime.ts:77 用 sdkChildEnv、d1-real-model.spec.ts:19 用 envOrDotenv；app/ui/.env 经 `git check-ignore` 确认 ignored，值不进 git；实证两条：全量 53 绿（d1 首绿）+ `env -u LITELLM_MASTER_KEY` + .env → d1 单跑 **1 passed (13.2s)** |
| ④ O1 gen 换代丢弃 | PASS | reduce.ts:37 view.gen 字段、:52 init gen:0、:178-179 snapshot 重建 gen+1；store.ts:325 发起时记 gen、:335 `cur.gen !== gen` 即丢弃（firstSeq 不回退、不 prepend） |
| ⑤ O2 dialog 失效 token + slowNext | PASS | NewBotDialog.tsx:52 `stale` token、:54 迟到即 return、:70 cleanup 置 stale；store.ts:62-63 delayed map + :415 `__pbotsDev.slowNext` 与既有 failNext(:60/:413) 同构。**slowNext 追认：同意——与 failNext/closeEvents 同为 __pbotsDev 测试钩子（一次性、无生产分支开销），O2 竞态是时序问题，无此钩子 E2E 无法确定性复现，是既有故障注入模式的最小时序扩展，非新抽象** |
| TDD 红基线（五组） | PASS | 反向补丁摘掉五处修复后自跑：m3/index.test.ts 2 红（get/patch rpc throw 从 safeRpc 逃出 reject）、store-meta.test.ts 2 红（refreshMeta/setMainBot 裸抛）、deadline.test.ts 1 红（unhandledRejection 收到 TypeError）、store-older.test.ts 1 红（firstSeq 回退 21）、settings.spec.ts O2 e2e 1 红（round1 迟到响应把 p2-beta radio 覆盖为 unchecked——REVIEW O2 原文失败模式原样复现）。恢复后 36 相关单测绿 + 全量 206 绿，worktree `git status` 干净 |
| 区域 17 文件 + renderer 与 U-28 无交叠 | PASS | `git show --stat 8b816fc` = 17 files (+452/-24)；U-28 commit 0988baa 12 文件中 renderer 文件数 = 0 → **renderer 侧零交叠确认** |

## 坏路径（R9 最相关）

`env -u LITELLM_MASTER_KEY` 且无 app/ui/.env → d1-real-model **显式 FAIL**，错误消息「LITELLM_MASTER_KEY 未设置（process.env 与 app/ui/.env 均无）：真模型旅程无凭证」（no-silent-skip 设计生效，不静默跳过）。同 key 下 .env 兜底单跑绿（见③）。

## 说明

- 本任务全部为行为/时序/测试基建修复，无 UI 视觉验收项，E2E 断言即证据，未产出人工截图。
- 全程 e2e/单测用临时 HOME=/tmp/bot-u29-verify，真凭证只经 env/.env 进 SDK 子进程，不进断言输出、不进 git。
- overBudget 3 条（connect rpc 无超时 / ready waiter 泄漏 / mutations.sh）builder 已记档，不属本验收范围。

新问题（每条一行，可直接成为修复任务）：
- [MERGE] U-28(R2) 与 U-29(R7) 重复修同一 rpc-reject 问题，文件级交叠 app/ui/main/m3-meta/index.ts + tests/unit/m3/index.test.ts | 复现：`comm -12` 比对两分支 diff 文件清单 | 疑似位置：REVIEW-P4终审.md R2/R7（同根因链两编号，派发规划重叠，非 builder 错误）| 严重度：合并闸门——合并必冲突，需二选一去重（建议保 U-29 safeRpc 版本，它是 R7 验收项实现且覆盖 handler/liveView 全路径），合并后按 LEARNINGS U-23×U-25 规则立即 main 全量回归

## rebase 复验（5144d2c）：PASS

- 复跑（/tmp/bot-wt/U-29/app/ui，HOME=/tmp/bot-u29-verify，21:14–21:20 实测）：`pnpm build` ✓ 1.09s；`vitest run` ✓ **27 files / 217 passed (217)**；`playwright test --workers=1` ✓ **54 passed (5.5m)** exit 0。HEAD 验收期间未漂移，工作树干净。
- 交叠去重核实：① `main/m3-meta/index.ts` 为 safeRpc **单层**（index.ts:49-58；grep `threw:` 在 m3-meta 下无残留，唯一命中 `m2-mux/deadline.ts:80` 属 R8 代答 log，非 R2 残留）；② U-28 四文件 `main/index.ts` / `m3-meta/restore.ts` / `orchestrate.ts` / `dsh/connect.ts` 与 main=86b4c2c **零 diff**，符号级抽查全在位：wireRestoreOnReconnect（main/index.ts ×3）、restoreSettled（main:1 + m3-meta:2）、R5 `failed?.delete`（restore.ts:53、orchestrate.ts:125）、onConnected（connect.ts:84）；③ **R6 restoreSettled 在**：liveView 返回 `pbots/restore-pending`（index.ts:79-81），测试 index.test.ts:159 在位且全量绿。
- 抽测：R2/R7 合并 describe「get/patch · rpc 抛错（U-28 R2 / U-29 R7）」单跑 **2 passed**，断言即统一后的 safeRpc 消息格式（`agentPresets/list failed: pbots/unavailable rpc failed: fetch failed` / `session/list … rpc failed: socket hang up`）；renderer 侧 R7 metaApi（store-meta.test.ts）单跑 **3 passed**——合并后语义两端均实证。
- 分支结构：5144d2c 为 main(86b4c2c) 之上单提交，17 文件 +422/-40；R9 接线（d1-real-model.spec.ts:19 envOrDotenv、sdk-runtime.ts:77 sdkChildEnv）rebase 后完好。
