# VERIFY · T-02 fake provider + 测试骨架 + 伪流式证伪

verdict: PASS
commit: 2a39f75b1f2b76c98cc23d2c810d3f3644c4c6e2（worktree /tmp/bot-wt/T-02，分支 feat/T-02，验收时 worktree 干净）
验收人：verifier（GLM 5.3）· 2026-11-01 14:38–14:44 · 测试全部串行（GPU 训练期，load ~5.2）

## 判定一览

| 验收项 | 结果 | 证据（命令/文件/代码位置） |
|---|---|---|
| 干净复跑全量测试（28 全绿） | PASS | `pnpm -C /tmp/bot-wt/T-02/app/sdk exec vitest run --no-file-parallelism` 两次均 `Test Files 3 passed (3)` / `Tests 28 passed (28)`；evidence/T-02-vitest-clean.txt。钉定 Node v24.22.2（devEngines ^24.9.0 达标） |
| ① harness：临时 DSH_HOME、清真实 key、keyless 跑通 | PASS | 测试 ①（stream.test.ts:28–42）断言 `rt.home` 匹配 `p2sdk-runtime-`（mkdtemp，tests/support/runtime.ts:34）；先种哨兵 key 再由 `clearRealKeys()`（harness.ts:60–62）删 5 个 KEY_VARS，经 `/proc/<pid>/environ` 断言全部未达 runtime 子进程；无 key 完成一轮 script 对话。evidence/T-02-stream-tests-verbose.txt |
| ① $OFFLINE 全绿（含外网必须失败） | PASS（按等价手段，见下） | evidence/T-02-offline-equivalent.txt：`unshare -rn` 内 `curl -sm3 https://registry.npmjs.org` → **rc=6**（只认 6/7，断网实锤）；netlink 视图网卡数 =0（仅 lo）；`pnpm -C app/sdk test` 28/28 全绿，整体 exit 0 |
| ② 首块屏障（K≥3 按序、先收到再 release、5s 判 FAIL、屏障期 ss 判据） | PASS | K=5（PIECES_A 甲乙丙丁戊）。fake 在第 1 个 text-delta 后 `waitForGate` 挂起（plugin.mjs:119–126）；`runScriptedTurn`（harness.ts:262–266）先 `await waitForDelta`（frames 来自 examples/lib follow 流，默认 5000ms 超时抛错=FAIL）**再** `rt.release(gateId)`；顺序断言：游标式按序匹配 K 块、`lastDeltaIndex < turnEndIndex`、全文精确相等（harness.ts:274–286）；屏障期间 `treeListenerEndpoints(pid)`（进程树限定的 `ss -ltnp`，harness.ts:192–232）与 baseline 逐项相等且全部 loopback。测试 ② 1894ms 绿 |
| ③ 整轮缓冲负对照（同一测试必须红，rejects 断言） | PASS | 测试 ③（stream.test.ts:56–83）6655ms（真实吃满 5s 超时）绿，`await expect(waitForDelta(frames, PIECES_A[0])).rejects.toThrow(/first chunk/)` + 屏障外零 delta 泄漏。真实性见下节推演 |
| ④ 换提示词不过拟合 | PASS | 测试 ④：PROMPT_B「换一段谚语」+ 全新文本 PIECES_B（子丑寅卯辰），全文 = B 串且 ≠ A 串；fake 侧 requests.jsonl 记录含 PROMPT_B、不含 PROMPT_A（stream.test.ts:85–100） |
| 覆盖率 ≥80% 且只计 src/ | PASS | evidence/T-02-coverage.txt：Stmts 94.18 / Branch 88.46 / Funcs 86.95 / Lines 98.64，表内仅 `start.ts`（vitest.config.ts `coverage.include: ['src/**']`） |
| 区域检查 | PASS | `git -C /tmp/bot-wt/T-02 diff --name-only main` = 4 文件，全部在 `app/sdk/tests/{support/fake/,e2e/stream.test.ts}`；evidence/T-02-area-diff.txt |
| 原公式失败路径（builder 论断复核） | 确认成立 | evidence/T-02-offline-original-formula-broken.txt：`unshare -rn sh -c 'ls /sys/class/net'` 输出与宿主完全一致（enp4s0/lo/singbox_tun/tailscale0/wlp3s0，sysfs 未随 netns 隔离）；`mount -t sysfs` 在 userns 内 `permission denied`（EPERM）；把原公式中 pnpm 换成 marker 复跑 → marker 未打印、**formula-exit=1**：`[ "$(ls /sys/class/net)" = lo ]` 在宿主视图上恒假，测试从未执行、静默 exit 1 |

## ③ 负对照真实性推演（按派发要求，未改代码）

- **整轮缓冲是「先收齐再转发」，不是延迟转发**：relay.mjs `up.on('message')` 在未 flush 前一律 `held.push(text)`；唯一触发 flush 的是 `turn/end` 事件帧或上游关闭。不存在按帧延迟转发的路径——任何延迟转发实现里首块仍会在回合结束前到达，与本 relay 不同类。
- **relay 确实插在客户端与 socket 之间**：`new MuxSocket(relay.url, relay.cookie)` 连 relay 自己的 WS（127.0.0.1 随机口），`DshClient({…, socket})` 后 follow 全走注入 socket（client.mjs:21）；relay 用自己换来的 cookie 拨真实 `/api/remote.mux` 上游。
- **rejects 断言有区分力**：fake 是先 `yield` 首块再挂 gate（plugin.mjs:122–123），③ 中 gate `t02-neg` 永不 release → 首块确实到达 relay 上游、被 held 吞下；若无缓冲屏障（直连，即 ② 的形态），同一 `waitForDelta` 在 <2s 内 resolve（② 1894ms 绿），`rejects` 断言会失败。故 ③ 的红既不能由「fake 根本没发」解释，也不能在直连下误红。

## 新问题（每条一行，可直接成为修复任务）

- [FIX] PLAN 表下 `$OFFLINE` 公式的 `[ "$(ls /sys/class/net)" = lo ]` 在 `unshare -rn` 内恒假 → 复现：见 evidence/T-02-offline-original-formula-broken.txt（marker 未打印、exit 1）→ 阶段性验证/出口汇合若照原文执行将静默不跑任何测试且看似失败 | 疑似位置：work/p2-sdk/PLAN.md §2 表下 `$OFFLINE` 定义 | 严重度：HIGH（流程）——建议改为等价式 `[ "$(ip -o link show | grep -vc '^[0-9]*: lo: ')" -eq 0 ]`（本次已实测可用）

## 附注

- builder「原公式不成立、用 netlink 等价替代」的论断**属实**，等价替代在本机复验通过；T-01 的 ① 验收项是 setup 双场景（不含 $OFFLINE），无历史假 PASS 问题。
- 测试输出中 `p2sdk: no ready line within 1ms` 来自 T-01 mock-demo 的 ready 超时路径用例（注入 1ms 超时），非 T-02 缺陷。
- 未改动任何产品代码；仅写 evidence/ 与本文件。
