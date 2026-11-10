# T46d：Ubuntu 侧给 Windows 客户端的两样东西——`serve --connect` 和 serve 模式的工作区 RPC

> 开单：manager (Opus 5.5) | 日期：2026-11-10 | 施工：main (GLM 5.3)
> 来源：T46b 立项（queue「桌宠 + Windows 分发」W3 行）；T46c 移交项「工作区 / remote-root 留 T46b 对接」
> 分支 / 作业目录：feat/T46d @ /tmp/bot-wt/T46d（作业目录先 setup + build）
> 依赖：W2b 先合（本单在同一份 spec 里加格）
> claimed：2026-11-10 main (GLM 5.3)
> accepted：（2026-11-10 第 1 次不通过 @ eb9cb0b8 → open/T46db，见 receipts/T46d.acceptance.md）

## 目标
Windows 客户端（T46b）只用**一条固定的 ssh 命令**就能拿到连接所需的全部信息，并且在 serve 模式下建 bot 时工作区落在 Ubuntu 上。

## 为什么要这张单（立项侦察结论）
- T46c 的状态行不带 token（对的），原计划让 Windows 再跑一次 `ssh host cat <handoff>/launch-token`——那是把远端输出拼进下一条远端命令，不要。改成一条固定命令一次拿齐。
- main 的远端工作区分支（T11 的 `mintWorkspace` → `p2sdk/workspace_ensure`）可以原样复用，但 SDK 现在**只在 ssh 模式挂这个 RPC**（`start.ts` sshRows 第 528 行），serve 是本机模式，没有。Windows 侧的 `<dataDir>` 是 Windows 路径，不能拿来当 Ubuntu 上的 cwd。

## 定案
1. **`hivebot serve --connect`**（和 `--status` 一样放在锁段之前、只读）：读 serve.json，pid 活着 → 从 `handoff` 目录读 `launch-token` 与 `remote-root`，stdout 打一行
   `HIVEBOT-CONNECT {"base_url":"http://127.0.0.1:<port>","token":"<token>","remote_root":"<path>","version":1}`，exit 0。
   - 不在跑 → stderr `HIVEBOT-CONNECT {"running":false}`，exit 1；pid 死了 → `{"stale":true}`，exit 1。
   - handoff 路径不匹配 `*/p2sdk-handoff-*`、两个文件缺或空、token 不匹配 `^[A-Za-z0-9._~-]+$`、remote_root 含 `"` `\` 或控制字符 → stderr `HIVEBOT-CONNECT {"error":"handoff-incomplete"}`，exit 1（不打半截 JSON）。
   - 这是 token 唯一出 stdout 的地方，只在被显式调用时打；serve 自己的状态行、serve.json、`--status` 照旧不含 token（W2b 的五面断言保持绿）。
2. **serve 模式挂工作区 RPC**：launcher 只在 serve 分支 `export P2SDK_WORKSPACE_ROOT="$PBOTS_DATA_DIR"`。`start.ts` 读这个 env：**仅当本机模式（cfg.ssh 未设）且值非空**时，插 `p2sdk-workspace` 行（`remoteRoot` = 该值）并给 handoff 插件配 `remoteRoot`（**不配 sshMode**——所以 handoff 只多一个 `remote-root` 文件，Ubuntu 本机桌面的 main 仍走本机分支，T11c ⓑ 钉住）。env 未设时生成的 patch 必须和改前逐字相同（T9a 验收 2-② 那格继续绿）。
3. **启动器可经符号链接调用**：`REPO_ROOT` 改按 `readlink -f "${BASH_SOURCE[0]}"` 求。安装方式（写进 launcher 头注释一行）：`ln -s <repo>/app/launcher/hivebot ~/.local/bin/hivebot`。T46b 的固定远端命令就是 `~/.local/bin/hivebot serve --connect`（非交互 ssh 不读 .profile，PATH 里多半没有 ~/.local/bin，所以写死路径）。
4. 不做：serve 自启 / systemd unit（见 Q-046）；token 轮换。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/launcher/hivebot`（第 18、27–40、176–191 行）
3. `app/sdk/src/start.ts`：第 224 行 env 键表、第 422–436 行 handoff 行与本机分支、第 476–540 行 sshRows（`p2sdk-workspace` 行照抄形态）
4. `app/sdk/src/p2sdk/workspace.mjs`（经 `ctx.subprocess.spawn` 跑 mkdir/readlink）
5. `app/ui/main/dsh/connect.ts` 的 `exchangeLaunchToken` / `rpcRaw`（验收 ⑩ 在 spec 里照这个 HTTP 形态用 fetch 调，不 import main）

## 边界
1. 只动 `app/launcher/hivebot`、`app/sdk/src/start.ts`、`app/sdk/tests/unit/start.test.ts`、`app/ui/tests/e2e/launcher-serve.spec.ts`。`workspace.mjs`、`handoff.mjs` 不改；要改就停下写存疑。
2. **第 0 步探针（先于一切实现）**：本机模式下 `ctx.subprocess.spawn` 能不能在 `$PBOTS_DATA_DIR`（在 `P2SDK_SANDBOX_MASK` 掩蔽的 `$CONFIG_DIR` 下）里 `mkdir`。临时手改 patch 挂上 `p2sdk-workspace` 起一次 serve，用 ⑩ 的 fetch 调一次，看目录是否真落在宿主盘上。不成立 → 停，回执写原样输出，派经理任务 C，不要改 `workspace.mjs` 绕。
3. 先写失败测试（看红再实现）：
   - `start.test.ts` 新格「T46d」：ⓐ env 设 `/x/data`、无 ssh → patch 含 `id: p2sdk-workspace` 且 `remoteRoot: '/x/data'`，handoff 行有 `remoteRoot` 无 `sshMode`；ⓑ env 未设 → 既有逐字格不变；ⓒ ssh 与 env 同时设 → 只有 ssh 的 remoteRoot 出现（env 被忽略）
   - `launcher-serve.spec.ts`（在 W2b 的 try/finally 里加）：
     - ⑧ `serve --connect` → exit 0；JSON 能 parse；`token` === handoff 里 `launch-token` 真值；`base_url` === 状态行 base_url；`remote_root` === `<home>/config/pbots-ui`；handoff 目录有 `remote-root`、**没有** `ssh-mode`
     - ⑨ `ln -s LAUNCHER <home>/bin/hivebot`，经链接跑 `serve`（serve 已在跑 → 走幂等分支）→ exit 0 且状态行 base_url 相同（改前：预检按链接目录找 node，exit 1）
     - ⑩ 用 ⑧ 拿到的 base_url+token 照 connect.ts 换 cookie、调 `p2sdk/workspace_ensure`（botId `t46d-probe`）→ ok；`<remote_root>/workspaces/t46d-probe/.dsh/skills` 存在；返回的 canonical 以 `<remote_root>/workspaces/` 开头
     - ⑪ TERM 之后 `serve --connect` → exit 1，stderr 行 parse 后 `running === false`
4. 隔离 HOME/TMPDIR/XDG、死 DBus；ui e2e 一律 `run-e2e.sh`；sdk 单测与 ui e2e 不同刻跑。

## 验收
1. app/sdk：`pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/start.test.ts` → 全 passed（基线 42 + 新格，回执写实际数）
2. app/ui：`pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/launcher-serve.spec.ts` → 1 passed（含 ⑧–⑪）
3. 变异（回执各贴原样）：start.ts 的条件去掉「cfg.ssh 未设」→ ⓒ 红；launcher serve 分支不 export `P2SDK_WORKSPACE_ROOT` → ⑩ 红；`REPO_ROOT` 改回 dirname → ⑨ 红；`--connect` 去掉 pid 存活判断 → ⑪ 红（stale 场景，若 ⑪ 未红就补一格 pid 死但 serve.json 残留）
4. 回归：app/sdk `pnpm --config.verify-deps-before-run=false exec vitest run tests/e2e/ssh-product.test.ts` → 7 passed（ssh 模式 patch 未被带偏）
5. 跑完 `ps -eo cmd= | grep -F bot-t46c- | grep -v grep` 为空

## 为什么这样验收
- ⑧ 证明一条命令拿齐、token 是真值不是占位；⑩ 证明 Windows 那边真正要用的 RPC 在 serve 下能建出 Ubuntu 上的目录，而不只是 patch 里多了一行字；ⓑⓒ 与回归 4 防止本机桌面和 ssh 模式被顺手改坏。
- ⑨ 是 T46b 固定远端命令能跑通的前提。

## 安全面
本单开出了 token 的新出口（ssh stdout）。施工后与 T11c 同批派 reviewer，重点看：`--connect` 是否在任何失败路径打出 token 或半截 JSON；serve 的其他输出面是否仍不含 token。

## 产出
- `app/launcher/hivebot`、`app/sdk/src/start.ts`
- `app/sdk/tests/unit/start.test.ts`、`app/ui/tests/e2e/launcher-serve.spec.ts`
- 回执 `work/tickets/receipts/T46d.receipt.md`
