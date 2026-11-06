# T16：dsh 9 依赖一次升 0.2.2-rc.1 + 三件安全修补

> 开单：main 照 manager 定稿转实体（EVAL-dsh-rc1.md §8 + queue 5a″ 行，2026-11-06） | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T15 EVAL §8 升级单草案（manager 已定稿）；queue.md 5a″ 行
> 分支 / 作业目录：feat/T16 @ /tmp/bot-wt/T16
> claimed：2026-11-06 15:0x @ cdae96a5
> accepted：

## 目标
app/sdk 的 9 个 `@deepseek-ai/*` 依赖从 0.2.2-alpha.2 一次升到 0.2.2-rc.1，同步落三件 rc.1 安全修补（envelope 工具面 / apply_patch NEVER / 执行层五写入口证明格），重定锚点，全量回归对照基点。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `work/p9-dsh-integration/EVAL-dsh-rc1.md` §8（步骤原文）、§3（cordis.patch.yml 差异）、§7（12 条结论）
3. queue.md 5a″ 行（含经理加的提醒：**重抄 preset 时保留 T9ac 的四行 `!!js P2SDK_SSH_MODE` 条件禁用**）

## 边界
1. 只动：`app/sdk/package.json` + lockfile、`app/sdk/profile/patches/approval.yml`（三段 preset 副本照 rc.1 重抄 + applyPatch: false + 保留四行 !!js）、`app/sdk/src/orchestration/envelope.mjs`、`app/sdk/src/policy/guard.mjs`（NEVER_TOOLS）、`app/sdk/src/policy/request-net.mjs` 与 `app/sdk/src/p2temp/index.mjs`（仅注释锚点）、新测试文件、`work/p9-dsh-integration/{DESIGN-ssh-composition.md,PLAN.md}` 锚点。超出停下写回执。
2. 三件安全件先红后绿（红格命令见验收）。
3. 测试走隔离 HOME/TMPDIR/DBus；全量回归等低负载窗口（reviewer 批审完成后）。
4. 备份先行（验收 0），回退步骤写回执。
5. T7b blocked（Q-030）不阻塞本单：feat/T7b 只动 app/ui renderer，与 sdk 依赖不相交；合并 T7b 时三方处理。

## 验收（写命令，不写感觉）
前置统一：worktree /tmp/bot-wt/T16，`cd app/sdk`，`E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"`。

0. **备份**：本机产品 `$DSH_HOME`（默认 `~/.p2sdk` 按 resolveConfig 定）与测试惯例 HOME 的会话 jsonl 各 tar 一份到 `/tmp/bot-T16-backup-<date>/`；回退步骤（恢复 lockfile + 备份）写进回执 §1。
1. `git diff --stat cdae96a5..HEAD` 只含边界 1 清单文件。
2. `pnpm why @deepseek-ai/cordis` → 只一份 4.1.0（无 alpha 残留）。
3. 三件先红（升级前在 alpha.2 基点先跑红、升后绿；红格原样贴回执）：
   a. envelope：worker 调 `schedule_edit` 被放行（JOB_TOOLS 修补前 alpha.2 放行 rc.1 工具名 → 修后拒/进审批）。
   b. apply_patch：测试 overlay 开 `applyPatch: true` 后调 `apply_patch` 写 `/tmp/x`——修补前不被预执行层拦（红），guard NEVER + `applyPatch: false` 后被拦（绿）。
   c. 执行层：`patchText/deleteFile/moveFile` 过 `checkedTarget` 拒 `/tmp` 与 HOME `.ssh` 的证明格。
4. drift 用例绿（approval.yml 三段重抄后 `guard-plugin-manager.test.ts` 的 assertPresetDrift 仍过——豁免逻辑照 T9ac 模式补 applyPatch 偏差）。
5. 全量回归（低负载窗口）：app/sdk 全量（unit+e2e 含 w1ap0-matrix/tiers-policy/sandbox-*/request-network/ssh-*）+ app/ui unit+e2e，对照升级前基点同组结果（P5-H8 已知超时格按基点同格同结果判）；P5-04 ⑤ 顺序证明格单独确认。
6. 收尾：`pgrep -af 'bot-T16'` 空；/tmp 残留归零（trackTmpDir）。

## 为什么这样验收
一次升 9 个依赖最大的风险是「静默行为漂移」——EVAL §3/§7 只核了 diff 面，运行时差异靠全量回归对照；三件安全件是 EVAL §5 定的必修补项（worker 工具面逃逸 / apply_patch 免审批写 / 执行层写入口收口），先红证明测试有牙，再绿证明修补生效。

## 产出
- 修改：package.json、pnpm-lock.yaml、approval.yml、envelope.mjs、guard.mjs、request-net.mjs/p2temp/index.mjs 注释、DESIGN-ssh-composition.md、PLAN.md
- 新建：三件安全件的测试文件
- 回执：`work/tickets/receipts/T16.md`（备份与回退、三红三绿原样、pnpm why、全量对照表、锚点对照）
