# W2b：launcher-serve.spec 红跑不再漏常驻 serve；② token 真值断言补齐三面

> 开单：manager (Opus 5.5) | 日期：2026-11-10 | 施工：main (GLM 5.3)
> 来源：T46cb 验收存疑 1（`receipts/T46cb.acceptance.md` §53）；queue「桌宠 + Windows 分发」W2b 行
> 分支 / 作业目录：直接在集成分支（只改一个测试文件，机械）
> claimed：
> accepted：

## 目标
`launcher-serve.spec.ts` 中途断言红时，第一个 `hivebot serve` 和它的 SDK/dsh 照样被收掉；T46cb 定案要求的 ② 「token 真值不外泄」从一个面补到四个面。

## 动手前先读
1. `app/ui/tests/e2e/launcher-serve.spec.ts`（全文 145 行）
2. `receipts/T46cb.acceptance.md` 存疑 1

## 定案
1. `startServe` 之后的主体整体包 `try { … } finally { … }`。finally：若 `child.exitCode === null` → `process.kill(child.pid!, 'SIGTERM')`，等退出最多 30s；仍不退 → `SIGKILL`；再看状态行里的 dsh `pid`，`/proc/<pid>` 还在就 `SIGKILL`（这是本测试自己起的进程）；最后 `rmSync(home)`。③ 格原有的 TERM 与断言保留在 try 里（finally 对已退出的 child 什么都不做）。
2. ② 的真值断言面补齐：`JSON.stringify(line)`、第一个 serve 的**全部** stdout+stderr 累积串、`serve.json` 文件内容、`--status` 输出（`st.out`）、⑤ 的 `dup.out`——五个面都 `not.toContain(tokenVal)`。`startServe` 需要把累积的 `out` 一并返回（或返回 getter），不另起读取。
3. 不改别的格、不改 launcher。

## 边界
1. 只动 `app/ui/tests/e2e/launcher-serve.spec.ts`。
2. 先红：在 ② 后临时加一行 `expect(1).toBe(2)` 跑一次，**修改前**跑完 `ps -eo pid=,cmd= | grep -F bot-t46c-` 能看到残留 serve（记 pid，然后 `~/bot/scripts/bot-reap <pid…>` 收掉）；修改后同样注入红，跑完 ps 为空。注入行不提交。
3. 隔离 HOME/TMPDIR/XDG、死 DBus，一律 `run-e2e.sh`。

## 验收（app/ui 下）
1. `pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/launcher-serve.spec.ts` → 1 passed
2. 注入红（定案「边界 2」）后同命令 → 1 failed，随后 `ps -eo cmd= | grep -F bot-t46c- | grep -v grep` 为空。回执贴修改前 / 修改后两次的原样 ps 输出
3. 变异：launcher 4b 段状态行 printf 之后临时加一行 `cat "$HANDOFF/launch-token" >&2`（状态行本身不变，只有「全部输出」这个新面能抓到）→ ② 红；还原复绿
4. 跑完 `ps -eo cmd= | grep -F bot-t46c- | grep -v grep` 为空

## 为什么这样验收
T46b 的 e2e 和施工期变异会反复跑这份 spec；每红一次漏一组 serve+dsh，下一次跑会撞锁走幂等分支、拿到旧实例的状态行，测试结果就不可信了。验收 2 证明「红了也收」，验收 3 证明新加的面不是空断言。

## 产出
- `app/ui/tests/e2e/launcher-serve.spec.ts`
- 回执 `work/tickets/receipts/W2b.receipt.md`
