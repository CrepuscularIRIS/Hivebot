# T9b4b：ⓐ 轮询格补判定力 + 补 60s 超时对照格（只改测试）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T9b4 终验不通过（第 1 次，@ d0d19883）；receipts/T9b4.md「## 终验（经理）」
> 分支 / 作业目录：feat/T9b4 @ /tmp/bot-wt/T9b4（同分支续提交）
> claimed：
> accepted：

## 目标
让 ⓐ 真能抓到「释放后轮询仍在跑、60s 后 exit(86)」——C1 的第一条路径。现在 ⓐ 在旧 HEAD、在「去掉 clearTimeout + poll 入口 disposed 判断」的变异下都绿，是空格。产品代码 T9b4 已对，本单只改测试。

## 根因（经理探针已坐实）
不是「fakeTimers 触不到真 timer」这条路走不通，是**装假时钟的时机**：开单时经理写的「`useFakeTimers` 放在 `await fiber` 之后」是错的指示——apply 里第一个 100ms 轮询 timer 是加载时用真 `setTimeout` 建的，之后 advance 碰不到它。改成**加载前**装 `vi.useFakeTimers({ shouldAdvanceTime: true })`（`shouldAdvanceTime` 让假时钟随真时间走，cordis 加载不会卡），整条轮询链都落在假时钟上。
经理探针（临时文件，已删）：加载前装假时钟 → 释放 → `advanceTimersByTimeAsync(61_000)`：
| guard.mjs | 释放格 | 不释放格（期望 86 + `timed out waiting for the ssh service`） |
|---|---|---|
| T9b4 HEAD | 绿 | 绿 |
| 变异 M3（去 clearTimeout + poll 入口 `if (disposed) return`） | **红**（exit 被调 10 次） | 绿 |
| 0d8f3b6f 原版 | **红**（10 次） | 绿 |

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/sdk/tests/unit/guard.test.ts` 末尾 T9b4 describe（ⓐⓑⓒ）

## 边界
1. 只动 `app/sdk/tests/unit/guard.test.ts`（T9b4 describe 内）、`work/tickets/receipts/T9b4.md`。产品代码不动。
2. ⓐ 改形态（不是删格）；ⓑ ⓒ 不改；新增一格 ⓓ。
3. 隔离 HOME / TMPDIR，DBus 指不存在路径；pnpm 跑 vitest 带 `--config.verify-deps-before-run=false`。不跑 e2e。

## 要做的
1. ⓐ：`vi.useFakeTimers({ shouldAdvanceTime: true })` 挪到 `root.plugin(...)` **之前**（`new Context()` 前后均可），其余不变（`await fiber` → `await fiber.dispose()` → `advanceTimersByTimeAsync(61_000)` → exit 未调）。
2. 新格 ⓓ（60s 超时对照，防修法把超时分支弄没）：同 ⓐ 但不释放 → `expect(exit).toHaveBeenCalledWith(86)` 且 stderr 含 `timed out waiting for the ssh service`；断言后 `await fiber.dispose()`。
3. ⓒ 头注释里「fakeTimers 触不到…60s 超时分支由变异与 e2e ②d 兜底」改成如实：超时分支由 ⓓ 守。
4. 回执追加 T9b4b 节，贴原样。

## 验收（前缀 `cd app/sdk && env HOME=$T TMPDIR=$T DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent pnpm --config.verify-deps-before-run=false exec`）
1. 先红：把 `src/policy/guard.mjs` 临时换成 `git show 0d8f3b6f:app/sdk/src/policy/guard.mjs` → `vitest run tests/unit/guard.test.ts -t 'T9b4'` → ⓐ ⓑ 红、ⓒ ⓓ 绿（贴原样）；还原后 `git status` 干净。
2. `vitest run tests/unit/guard.test.ts` → 30 passed。
3. 变异（各贴原样，`cp` 还原）：
   - M3 去 `clearTimeout` + 去 poll 入口 `if (disposed) return` → ⓐ 红
   - 只去 `clearTimeout`（poll 入口判断留着）→ 照实写（预期仍绿：入口判断已兜住）
   - disposed 恒 true → ⓒ ⓓ 红
4. `git diff --stat d0d19883..HEAD` 只含边界 1 的两个文件。

## 为什么这样验收
C1 的两条误杀路径，T9b4 只有 ready 路径（ⓑ）有咬合格；轮询路径——热重载 / 停用 guard 行时 ssh 服务不在、旧实例 60s 后自杀进程——没有任何格能区分修没修。M3 那刀必须红，ⓐ 才算数；ⓓ 守住「未释放时 60s 等不到 ssh 仍 fail closed」。

## 产出
- `app/sdk/tests/unit/guard.test.ts`（改 ⓐ、加 ⓓ、改 ⓒ 注释）
- `work/tickets/receipts/T9b4.md`（T9b4b 节）
