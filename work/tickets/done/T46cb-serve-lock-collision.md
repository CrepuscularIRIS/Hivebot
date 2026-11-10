# T46cb：serve 锁冲突时明确报错（不起 Electron、非 0 退出）

> 开单：manager (Opus 5.5) | 日期：2026-11-10 | 施工：main (GLM 5.3)
> 来源：T46c 验收遗留（`receipts/T46c.acceptance.md` §4）；挡 T46b 开工
> 分支 / 作业目录：feat/T46cb（基于合并 T46c 后的 main），小改动可不建 worktree
> claimed：2026-11-10 main (GLM 5.3)
> accepted：2026-11-10 7d2aab58（receipts/T46cb.acceptance.md）

## 目标
锁已被占时：`hivebot serve` 不再走「双开聚焦」分支（现在会拉起 Electron，退出码 0，也不打状态行）；普通 `hivebot` 碰到正在跑的 serve 时，也不再弹一个连不上 SDK、15 秒后被杀的窗口。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（e2e 一律走 run-e2e.sh）
2. `app/launcher/hivebot` 第 27–40 行（--status）、第 64–76 行（锁分支）

## 定案
1. 锁分支开头：如果 `$1 = serve`，先看 serve.json——活着（`kill -0` pid 成功）就把**同一行状态**打到 stdout 并 `exit 0`，这样重复执行 serve 是幂等的、Windows 侧可以直接用；不是 serve 在占锁（是桌面在跑）就 `die "已有桌面实例在跑，serve 需先关闭桌面"`（exit 1）。两种情况都**不起 Electron**。
2. 锁分支开头：如果不是 serve，但 serve.json 活着 → `die "serve 模式在跑（<base_url>），先 hivebot serve 的进程 TERM 再开桌面"`（exit 1），不起 Electron。
3. 修 --status 两处 stderr 的引号：输出合法 JSON `{"running":false}` / `{"stale":true}`（用 printf 单引号格式串）。
4. 不做：serve 与桌面共享同一个 SDK（要改 main 读 handoff 的路径，YAGNI，等用户提了再说）。

## 边界
1. 只动 `app/launcher/hivebot`、`app/ui/tests/e2e/launcher-serve.spec.ts`。
2. 先写失败测试（在 launcher-serve.spec 里加格，先跑红）：
   - ⑤ serve 在跑时再起 `serve` → exit 0，stdout 行的 base_url/pid 和第一个实例相同；全程 ps 里 0 个 Electron；第一个实例的 serve.json 还在
   - ⑥ serve 在跑时起普通 `hivebot` → exit ≠0，stderr 含「serve」；0 个 Electron
   - ⑦ 不在跑时 `--status` 的 stderr 能被 `JSON.parse`（截掉 `HIVEBOT-SERVE ` 前缀）
   - ② 加强：读 `<handoff>/launch-token` 的真值，断言 stdout、stderr、serve.json、--status 输出都不含这个值（替代只查字面 "token"）
3. 「桌面在跑时 serve → exit 1」需要真起 Electron，不在本单加格（launcher.spec 还是既有红），用手测一条贴进回执。
4. 隔离 HOME/TMPDIR/XDG，死 DBus，一律 `pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh`。

## 验收（app/ui 下）
1. `pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/launcher-serve.spec.ts` → 全 passed（原四格 + ⑤⑥⑦）
2. 变异：删掉定案 1 的 serve 判断（让 serve 落回双开分支）→ ⑤ 红；删掉定案 2 → ⑥ 红；还原复绿。回执贴原样输出
3. 手测（回执贴原样）：隔离 env 下先起普通 `hivebot`（Xvfb 或 `PBOTS_E2E` 同款隔离显示），再 `hivebot serve` → stderr 报桌面在跑、rc=1、没有第二个 Electron
4. 跑完 `ps -eo cmd= | grep -F bot-t46c` 为空

## 为什么这样验收
T46b 的 Windows 客户端只看 `ssh host hivebot serve` 的退出码和状态行。现在「已有实例」时退出 0 却没有状态行，还在 ssh 会话里拉起 Electron——客户端会把失败当成成功。⑤⑥ 必须证明「不起 Electron」，不能只断言退出码。

## 产出
- `app/launcher/hivebot`
- `app/ui/tests/e2e/launcher-serve.spec.ts`
- 回执 `work/tickets/receipts/T46cb.receipt.md`
