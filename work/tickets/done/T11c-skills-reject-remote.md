# T11c：skills API 在远端工作区模式下固定拒绝

> 开单：manager (Opus 5.5) | 日期：2026-11-10 | 施工：main (GLM 5.3)
> 来源：T11 工单第 4 条（终验拆出，queue 5c′ 行）；T46b 的前置（Windows 客户端同样是远端工作区）
> 分支 / 作业目录：feat/T11c（小改，可不建 worktree）
> claimed：2026-11-10 main (GLM 5.3)
> accepted：2026-11-10 fb1e3da5（receipts/T11c.acceptance.md）

## 目标
工作区在另一台机器上时（ssh 模式，以及之后 T46b 的 Windows 客户端），`pbots:skills` 的 list / enable / disable 不再去读写本机 `<dataDir>/workspaces/…`（那里根本没有 bot 目录，现状报误导性的 `not-found`），而是统一返回一个固定错误。

## 动手前先读
1. `app/ui/main/m3-meta/orchestrate.ts:80-94`（`sshRemoteRoot()`）
2. `app/ui/main/skills/index.ts:263-290`（`registerSkills` 入口）
3. `app/ui/tests/unit/m3/orchestrate.test.ts:470` 起（T11b B 格：handoff 里写 ssh-mode/remote-root 的现成做法）

## 定案
1. 新文件 `app/ui/main/remote-root.ts`：把 `sshRemoteRoot()` **原样搬过去**，改名导出 `remoteRoot(): string | undefined`（判定不变：handoff 有 `ssh-mode` 文件才读 `remote-root`）。`orchestrate.ts` 删本地函数、改 import。一处定义，不复制（T46b 会在这里加内存来源）。
2. `registerSkills` 的 handler 第一行（在 req 校验之前）：`remoteRoot() !== undefined` → `fail('remote-mode', 'Skills are not available while Hivebot uses a remote computer.')`，三个 op 一视同仁，不碰文件系统。文案定死，测试按字面断言。
3. 不做：SDK 侧复制 skill（T7a 原案「ssh 模式拒 → SDK 侧复制」的后半句，等有用户要再开）；renderer 不改（picker 走它现有的错误显示）。

## 边界
1. 只动 `app/ui/main/remote-root.ts`（新）、`app/ui/main/m3-meta/orchestrate.ts`（只删函数改 import）、`app/ui/main/skills/index.ts`、`app/ui/tests/unit/skills/index.test.ts`。
2. 先写失败测试（`tests/unit/skills/index.test.ts` 新 describe「T11c」），看它红：
   - ⓐ handoff 临时目录写 `ssh-mode` + `remote-root`，`PBOTS_DSH_HANDOFF` 指过去；dataDir 里**真建**一个带 skill 的 bot（本机路径下 list 会 `ok: true`）→ list / enable / disable 三个调用都返回 `pbots/remote-mode` + 上面的原文。先红 = list 现在返回 ok:true。
   - ⓑ 同上但 handoff **只有** `remote-root`、没有 `ssh-mode`（T46d 之后 Ubuntu 本机 serve 的 handoff 就是这样）→ list 照常 `ok: true`。这格现在就绿，是防回归的。
   - 每格结束恢复 `PBOTS_DSH_HANDOFF` 原值。
3. 隔离 HOME/TMPDIR，死 DBus。

## 验收（app/ui 下）
1. `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/skills tests/unit/m3` → 全 passed（基线 115 + 新格；回执写实际数）
2. `grep -rn "function sshRemoteRoot\|function remoteRoot" main` → 只有 `main/remote-root.ts` 一处
3. 变异：把 handler 首行判断删掉 → ⓐ 红；把 `remote-root.ts` 的 `ssh-mode` 存在性判断删掉 → ⓑ 红；还原复绿。回执贴两次原样输出
4. `pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/ssh-workspace.spec.ts` → 3 passed（orchestrate 改 import 后远端工作区链不断）

## 为什么这样验收
要保住两件事：远端模式下 skills 绝不在本机路径上读写（ⓐ 用「本机路径下本来能成功」的场景证明判断在最前面，而不是靠目录不存在碰巧失败）；以及 Ubuntu 本机 serve 写了 `remote-root` 之后，本机桌面的 skills 不能被误拒（ⓑ）。验收 2 防止 T46b 时出现两份判定。

## 产出
- `app/ui/main/remote-root.ts`、`app/ui/main/m3-meta/orchestrate.ts`、`app/ui/main/skills/index.ts`
- `app/ui/tests/unit/skills/index.test.ts`
- 回执 `work/tickets/receipts/T11c.receipt.md`
