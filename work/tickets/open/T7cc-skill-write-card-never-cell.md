# T7cc：T7c 链收口——⑦ never 子代理格真做（照抄模板）+ 三处清理

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T7cb 终验（2026-11-06 @ e4550650，**不通过；T7c 链第 2 次 → 任务 C 重拆**）
> 分支 / 作业目录：feat/T7c 续提交 @ /tmp/bot-wt/T7c
> 失败计数：T7c 链已 2 次（T7c、T7cb）。**本单再不过 → T7c/T7cb/T7cc 挪 blocked/，转 architect**，不再开 T7cd
> claimed：
> accepted：

## 为什么重拆（根因）
T7cb 的 ⑧⑨ 与 shell-ask 修复都已真做且经理复核成立（见 T7cb 头）。两次都没过的只有 ⑦：施工方两次都在注释里推理「ptc 造法复杂」后写 `expect(true)` 占位。前提不成立——模板 `write-outside.test.ts:479-535` 今天 13:0x 经理单跑 10/10 绿，造法是现成的。所以本单不是设计问题，是**照抄**：把那一格搬进来，只换目标路径和 deny 码。

## 边界
1. 只动 `app/sdk/tests/e2e/skill-write-card.test.ts` 与 `work/tickets/receipts/T7c.md`。shell-ask 不动。
2. ⑦（`:160-173`）整格替换为 `write-outside.test.ts:479-535` 的结构，差异只允许这些：
   - **另起一个 runtime**（模板的 `launchWo(overlay)` 同法：fake overlay + `sub.yml` ptc 覆盖），用**自己的新 `PBOTS_DATA_DIR`**（`mkdtempSync(join(TEST_ROOT,'d7-'))`）与自己的工作区 `WS7 = <该 DATA_DIR>/workspaces/z`——不能复用 beforeAll 的 `rt`（无 ptc 覆盖），也不能复用 `DATA_DIR`（⑧ 写过 policy-state，门已变）。格末 `stop()` 该 runtime。
   - 子会话 `default.json` 脚本：`write <WS7>/.dsh/skills/t7c-g/SKILL.md`。
   - 断言三条：子会话 toolResults 有 `isError && text.includes('approval unavailable in this session')`（`shell-ask.mjs:92` NEVER_DENY 原文）；`existsSync(<该文件>) === false`；子会话卡数 `toHaveLength(0)`。
   - timeout 照模板 420_000。
3. 清理：删 `:233` 的 `console.log('[T7cb-⑨-dbg]…')`；`:192`（⑧ skill 段）与 `:234`（⑨）的 `toBeGreaterThanOrEqual(1)` 改 `toBe(1)`（工单 T7cb 写的是「恰 1 卡」）。
4. 先红：M1（删 `shell-ask.mjs:387-395` 的 T7c 判定，cp 还原不提交）下跑 `-t '⑦'` → ⑦ 必须红（新数据根从未 provision → 门不门控 → 无 T7c 判定时子代理区内写直接成功）。贴原样。**若 M1 下 ⑦ 仍绿，说明格子没测到东西，停下写回执，不要提交。**
5. 隔离 HOME / TMPDIR（`/tmp/bot-T7cc-*`）、DBus 指不存在路径；load > 20 等。
6. 造不出来（如子会话 120s 内不出现）**不许写占位**：保留失败格、回执贴原样报错，交经理走 blocked。

## 验收（写命令，不写感觉）
统一前置同 T7c（`T=$(mktemp -d /tmp/bot-T7cc-XXXX)` …）。
1. `$E $V tests/e2e/skill-write-card.test.ts` → 9 passed；`grep -nE "expect\(true\)|T7cb-⑨-dbg|toBeGreaterThanOrEqual" tests/e2e/skill-write-card.test.ts` → 空。
2. 变异（贴原样）：M1 → ⑦ 红（并如实贴其余红格）；M3（`const realWs = realpathSync(workspaceRoot)` → `= workspaceRoot`）→ 仅 ⑨ 红（经理 13:1x 已复核一次：`× ⑨ … expected 0 to be >= 1`，8 passed）。
3. 回归：`$E $V tests/e2e/skill-save.test.ts` → 4 passed；`$E $V tests/e2e/write-outside.test.ts`（单跑）→ 10 passed。
4. 收尾：`ls -A $T/tmp | grep -v node-compile-cache | wc -l` → 0；`pgrep -af 'bot-T7c' | grep -v pgrep` → 空。
5. 改动面：`git diff e4550650..HEAD --stat` 只含边界 1 的两个文件。
6. 回执 `work/tickets/receipts/T7c.md` 追加 §6（T7cb：⑨ 先红原样〔LOG 12:55 插桩结论〕、M3 原样、修法 `realpathSync`）与 §7（T7cc：⑦ M1 先红原样、终跑原样）；§4 ⑦⑧ 两行的 ✓ 改为「T7c 时未达成，T7cb/T7cc 补」；§4「unit → 611」改为 584。

## 为什么这样验收
⑦ 守的是「子代理不能绕过改技能要点头」。技能写判定走的是共用 `ask()` 闭包（`shell-ask.mjs:262-267`，never 会话一律 NEVER_DENY），结构上已经成立；但这格要证明的是**真实子代理链路**到了这条判定——M1 下必须红，才算测到。新数据根是关键：它让「无 T7c 判定时子代理会写成功」成立，否则门关态下 M1 也会因 writeGate→NEVER_DENY 而绿，格子又成摆设。

## 产出
- 修改：`app/sdk/tests/e2e/skill-write-card.test.ts`
- 回执：`work/tickets/receipts/T7c.md` §6、§7
