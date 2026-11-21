# T46ac 验收（经理任务 B）

> 经理：Opus 5.5 | 日期：2026-11-09 | worktree /tmp/bot-wt/T46a，feat/T46a HEAD = dc864c0b
> 改动范围：`git diff 42987cb3..dc864c0b` → 只有 `app/ui/scripts/check-win-package.mjs` forbidden 一行（+注释 1 行），合边界 1。worktree `git status` 干净。

## 逐条

| # | 命令 / 探针 | 输出（原样摘） | 判 |
|---|---|---|---|
| 验收 1 | `cd app/ui && node scripts/check-win-package.mjs` | `OK 白名单 71 条全过（ws 内含：是）` exit=0 | 过 |
| 验收 2（同一输入改前/改后） | 经理自造变异包：现 asar `extractAll` → 加 `out/main/index.js.map`、`out/.env`、`out/.env.local`、`out/renderer/.env.production`，外加对照 `out/renderer/.envrc-not-env` → `createPackage` 到 `/tmp/mgr-t46ac.*/pkg/dist-app/win-unpacked/resources/app.asar` + 拷 `elevate.exe`；cwd 指过去分别跑旧脚本（`git show 42987cb3:…`）与新脚本 | 旧：`FAIL ⓒ 非白名单条目 2 个：out/.env, out/main/index.js.map` exit=1；新：`FAIL ⓒ 非白名单条目 4 个：out/.env, out/.env.local, out/main/index.js.map, out/renderer/.env.production` exit=1（条目总数 76） | 过，与回执 2→4 一致 |
| 实现核对 | 读 forbidden | `p.endsWith('.map') \|\| p.split('/').some((seg) => seg === '.env' \|\| seg.startsWith('.env.'))` | 合工单意图。比「只判最后一段」更严（目录名 `.env.x/` 也拒），无害；去掉的 `p.startsWith('.env')` 原本只覆盖根层，根层非白名单条目本就被 `allowed` 拒，无回退；对照项 `.envrc-not-env` 未误报 |

探针临时目录与临时旧脚本已删；worktree `git status` 无残留。

## 决定

**通过。** T46a + T46ab + T46ac 三张一起挪 `done/`，工单头写 `accepted: 2026-11-09 dc864c0b`。
（T46ab 工单原在 `open/`、未填 claimed——施工方领单流程漏了一步，不影响结论。）
主 agent 下一步：按 CLAUDE.md §2.6 `git merge --no-ff feat/T46a`，合并后跑 `node scripts/check-win-package.mjs` 与相关单测回测，记 `work/LOG.md`；T46a 仍在攒批，随下一批派 reviewer（打包脚本非安全协议单，不必单派）。
