# T7cb：T7c 返修——⑦ 空断言、⑧ 没造门开态、skill 根未规范化

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T7c 终验（2026-11-06 @ b0ee442a，**不通过 第 1 次**）；receipts/T7c.md §4–§5
> 分支 / 作业目录：feat/T7c 续提交 @ /tmp/bot-wt/T7c
> 排期：与 T7bc 无文件交集，可并行；合并顺序仍是 feat/T7b 先、feat/T7c 后
> claimed：11:15 main (GLM 5.3)
> accepted：

## 目标
T7c 的判定本身方向对（位置在 `fileGateOpen()` 之前、复用 `isPathUnder`），老断言修订对照表与 diff 一致，T6 / T7a 回测经理重跑一致。不过的是：工单「为什么这样验收」里点名要保住的两格是假的，回执又把它们记成 ✓。

## 经理核实发现
1. **⑦ 是空断言**：`skill-write-card.test.ts:160-167` 只有 `expect(true).toBe(true)`。回执称「unit 层 NEVER_DENY 已覆盖」——本分支没有新增任何 unit 测试；且「e2e 复杂度高」不成立：工单指定的模板 `write-outside.test.ts:479-535` ⑦ 就是现成的 never 子代理造法（`sub.yml` overlay + `subagent` 工具调用 + 子会话 0 卡断言）。
2. **⑧ 没进门开态**：`:168-174` 与 ① 同一状态，断言消息还写成「门关态」——错。测试环境从未 provision，`fileGateOpen()` 走「从未 provision 不门控」分支（`shell-ask.mjs:225-240` 头注释），即 ①–⑤ 本来就在**未 provision 的门开**下跑；⑧ 要的是「**有效 policy-state** 的门开」这条分支（`policyStateValid` 为真）。造法 4 行：`tiers-policy.test.ts:127-132` 的 `provision()`；policyStatePaths 由 `PBOTS_DATA_DIR` 推导（`src/start.ts:310`），本测试已设该变量。
3. **skill 根未规范化**（回执「targets 已 realpath，join 与拼接同结果」只对了一半）：`targets` 是 realpath 后的，但 `skillRoots = join(workspaceRoot, …)` 用的是原样 `workspaceRoot`；`fs-zone.mjs:70` 对同一个值专门做了 `canonicalPath`。`isPathUnder`（`containment.mjs:43-57`）先比字面、再按根的 inode 往上找——**skill 根尚不存在**（第一次存 skill 的常态）且工作区路径经过符号链接时，两步都落空 → 不出卡、门开即写。M2 没咬合的真正原因是测试里工作区路径本身无链接，不是「前提不成立」。
4. 收尾残留：施工留下 3 个 dsh runtime（`pgrep -af bot-T7c` 见 PID 2430035、2445309、2481864，TMPDIR `/tmp/bot-T7c-{UXMM,XYVT,QYX9}`）——验收 6 不过。
5. 回执缺：新测试的「先红」原样输出（工单边界 2 要求先跑 `skill-write-card.test.ts` 看 ① 红）。

## 边界
1. 只动：`app/sdk/src/policy/shell-ask.mjs`（仅第 3 条：skill 根用规范化后的 workspaceRoot，照 `fs-zone.mjs:18,70` 的 `canonicalPath`）、`app/sdk/tests/e2e/skill-write-card.test.ts`。
2. 先做 ⓪：`~/bot/scripts/bot-reap 2430035 2445309 2481864`（若仍在）。
3. 先红：
   - ⑦ 按 `write-outside.test.ts:479-535` 造 never 子代理，子会话 `write <WS>/.dsh/skills/t7c-g/SKILL.md` → 断言 deny（tool result isError）、**子会话 0 卡**、文件不存在。判定力：区内写在未 provision 时不出卡、never 下直接放行，所以 M1（删 T7c 判定）下子代理会写成功 → ⑦ 必须红；贴原样。
   - ⑧ 放在文件**最后一格**（provision 会写伴生标记、latch 本进程，影响后续格）：`provision()` 后先写 `notes/t7c-h.md` → 0 卡（证明门真开），再写 `.dsh/skills/t7c-h/SKILL.md` → 恰 1 卡；断言消息去掉「门关态」。M1 下第二段红。
   - ⑨（新）工作区经符号链接、skill 根尚不存在：独立工作区 `WS2 = DATA_DIR/workspaces/y` + `WS2_LINK -> WS2`（TEST_ROOT 下），`session/create` 的 `cwd` 用 `WS2_LINK`，写 `WS2_LINK/.dsh/skills/t7c-i/SKILL.md`，写前 `WS2/.dsh` 不存在。期望 1 卡。改 shell-ask 前跑一次：
     - 红 → 第 3 条成立，按边界 1 修，再绿；
     - 绿 → 说明 dsh 已在上游规范化 cwd，**不改 shell-ask**，回执贴绿的原样输出与 `workspaceRoot` 实际值（打一行日志或断言），本格保留作回归。
4. 隔离 HOME / TMPDIR（`/tmp/bot-T7cb-*`）、DBus 指不存在路径；只跑下列文件。

## 验收（写命令，不写感觉）
统一前置同 T7c（`T=$(mktemp -d /tmp/bot-T7cb-XXXX)` …）。
1. `$E $V tests/e2e/skill-write-card.test.ts` → 9 passed；`grep -n "expect(true)" tests/e2e/skill-write-card.test.ts` → 空。
2. 变异（cp 还原、不提交，贴原样）：M1 删 T7c 判定 → ①③④⑤⑦⑧⑨ 红（② 在 M1 下也可能红，如实贴）；若改了第 3 条，M3 把 `canonicalPath(workspaceRoot)` 换回 `workspaceRoot` → ⑨ 红。
3. 回归：`$E $V tests/e2e/skill-save.test.ts` → 4 passed；`$E $V tests/e2e/write-outside.test.ts`（单跑）→ 10 passed；`$E $V tests/e2e/tiers-policy.test.ts`（单跑）→ 与 T7c 起点同数；`$E $V tests/unit` → 584 passed / 31 files（经理 11:2x 在 b0ee442a 重跑实数；T7c 回执写的 611 对不上，本分支未动 unit 文件，起点同为 584）。
4. 收尾：`ls -A $T/tmp | grep -v node-compile-cache | wc -l` → 0；独立 shell `pgrep -af 'bot-T7c' | grep -v pgrep` → 空。
5. 改动面：`git diff b0ee442a..HEAD --stat` 只含边界 1 的文件。
6. 回执：`work/tickets/receipts/T7c.md` 追加 §6（T7cb）：先红原样、M1/M3 原样、⑨ 分支结论；并把 §4 ⑦⑧ 两行的 ✓ 更正为「T7c 时未达成，T7cb 补」。

## 为什么这样验收
用户要的是「bot 改技能前我要点头」。⑧ 守的是「开了自主也照样问」，⑦ 守的是「子代理不能绕过」；这两格是本功能对用户承诺的核心，空着就等于没验。⑨ 守的是第一次存 skill 时（根还不存在）不因路径写法不同漏卡。

## 产出
- 修改：`app/sdk/tests/e2e/skill-write-card.test.ts`；视 ⑨ 结论修改 `app/sdk/src/policy/shell-ask.mjs`
- 回执：`work/tickets/receipts/T7c.md` §6
