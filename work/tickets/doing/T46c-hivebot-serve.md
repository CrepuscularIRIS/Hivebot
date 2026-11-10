# T46c：`hivebot serve`——Ubuntu 侧常驻模式（无 Electron，Windows 客户端的前置）

> 开单：main (GLM 5.3，按 queue W2 经理任务 A 定案写单） | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：queue「桌宠 + Windows 分发」W2；用户 2026-11-09 定案（Q-045 解除阻塞：假 SSH 方案，Windows 虚拟机实测）
> 分支 / 作业目录：feat/T46c @ /tmp/bot-wt/T46c
> claimed：2026-11-09 main (GLM 5.3)
> accepted：

## 目标
`app/launcher/hivebot serve`：只起 SDK、不起 Electron、常驻到 TERM/SIGINT 优雅退出。stdout 打印一行**机器可读**状态行（含 base-url 端口；launch-token **不进** stdout/stderr，留在 handoff 文件），供 Windows 侧 `ssh host hivebot serve --status` 读取。远程工作区（`p2sdk/workspace_ensure` + remote-root 进 handoff）留 T46b 对接，本单不接。

## 定案（queue W2 原文 + 细化）
1. `serve` 子命令：launcher 脚本分支——锁/密钥/env 文件逻辑复用；跳过 Electron 段；`wait` SDK 进程，TERM/INT 走既有 cleanup（SDK TERM→KILL、handoff 清理）。
2. 状态行格式（一行 JSON 前缀标记，跨版本稳定）：`HIVEBOT-SERVE {"base_url":"http://127.0.0.1:<port>","pid":<dsh_pid>,"version":1}`——打印两处：ready 后打 stdout；`--status` 子命令不打（status 查询走另一条路：`serve --status` = 若已有实例在跑，从 `$XDG_STATE_HOME/hivebot/serve.json`（launcher 写的状态文件）读出并打印同一格式行后退出，退出码 0/1（不在跑=1）。**token 永不出现在 stdout**（Windows 侧经 ssh 拿 token 的通道是 T46b 的 `ssh host cat <handoff>/launch-token`——handoff 路径打印在状态行里：`"handoff":"<path>"`）。
3. serve.json（launcher 写）：`{version, base_url, handoff, pid, started_at}`——serve 启动时写、cleanup 时删。

## 边界
1. 只动：`app/launcher/hivebot`（serve 分支+状态文件）、新 `app/ui/tests/e2e/launcher-serve.spec.ts`（或并入 launcher.spec.ts 新 test，二选一）、`docs-public/README.md` 一行（serve 用法）。不动 SDK/main/renderer。
2. 先写失败测试：launcher-serve.spec ① 无 Electron 进程产生（ps 验证）；② stdout 状态行可解析且含 base_url/handoff；③ TERM 后 serve.json 删除、SDK 进程收走；④ `--status` 在 serve 跑着时打同一格式行（token 不在输出里）。
3. 隔离 HOME/TMPDIR（XDG_STATE_HOME 指测试目录），DBus 死路径。
4. 凭证：env 文件/密钥逻辑复用 launcher 既有段——不新增凭证面。

## 验收（app/ui 下）
1. `pnpm --config.verify-deps-before-run=false exec playwright test tests/e2e/launcher-serve.spec.ts` → 全 passed（四格）
2. `pnpm --config.verify-deps-before-run=false exec playwright test tests/e2e/launcher.spec.ts` → 原样通过（serve 分支不影响普通启动）
3. 变异：把 serve 的 TERM cleanup 删掉 → ③ 红；还原。
4. 手测一条（回执贴原样）：`XDG_STATE_HOME=/tmp/x app/launcher/hivebot serve &` → 状态行 + `--status` 输出 + kill 后清理。

## 产出
- `app/launcher/hivebot`（serve 分支）
- `app/ui/tests/e2e/launcher-serve.spec.ts`
- 回执 `work/tickets/receipts/T46c.receipt.md`
