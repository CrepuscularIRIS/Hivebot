# T46ab 复验（经理任务 B）

> 经理：Opus 5.5 | 日期：2026-11-09 | worktree /tmp/bot-wt/T46a，feat/T46a HEAD = 42987cb3
> 改动范围：`git show 42987cb3 --stat` → 只有 `app/ui/scripts/check-win-package.mjs`（+3 −1），合边界 1。

## 逐条

| # | 命令 / 探针 | 输出（原样摘） | 判 |
|---|---|---|---|
| 验收 1 | `cd app/ui && node scripts/check-win-package.mjs` | `OK 白名单 71 条全过（ws 内含：是）` exit=0 | 过 |
| 验收 2（同一输入改前/改后） | 经理探针：把现包解到 `/tmp/mgr-t46ab.*`，加 `out/main/index.js.map`、`out/.env`、`out/.env.local`、`out/renderer/.env.production`，`createPackage` 重 pack，cwd 指过去分别跑**新脚本**和**旧脚本**（`git show 118de495:…`） | 旧：`OK 白名单 75 条全过` exit=0；新：`FAIL ⓒ 非白名单条目 2 个：out/.env, out/main/index.js.map` exit=1 | `.map` 与 `.env` 两个条目名都在 stderr——工单原话这条过 |
| 验收 3 | `grep` T46a 回执 | 现为 `116M` / `2.6M`、`@electron/asar@4.3.1`（附更正说明）；commit b47e4c69 | 过 |
| 回执三段证据 | 读回执 §2 + 代码 | 改前那段 yml 仍在（map 被 yml 挡、`.env` 进包、exit 0）；改后段去 yml 行得 8 map + 1 env = 9 条红；还原 71 条绿。与代码逻辑一致，数字可信。小瑕疵：改前/改后不是「同一输入」（改后多删了 yml 行）——经理探针已用同一输入补证，不追究 | 属实 |

## 缺口（判返修的原因）

工单边界 1 原话：「文件名为 `.env` / **以 `.env.` 开头** → 红」。实现：

```js
const forbidden = (p) => p.endsWith('.map') || p.split('/').some((seg) => seg === '.env') || p.startsWith('.env')
```

第三项 `p.startsWith('.env')` 判的是**整条路径**，只管根层；子目录里的 `.env.local` / `.env.production` 放过。经理探针实证：上面那包里的 `out/.env.local`、`out/renderer/.env.production` **不在红单里**（新脚本只报 2 条）。`.env.local` 恰是 Vite 项目最常见的本地凭证文件，这条正是 T46a「包里不夹带凭证」要守的。修法一行：对最后一段（basename）判 `=== '.env' || startsWith('.env.')`。

## 决定

**不过，返修** → 开 `open/T46ac-env-basename.md`（一行改动 + 同一输入改前/改后证据）。
T46a、T46ab 留原处；T46ac 通过后 T46a + T46ab + T46ac 三张一起挪 `done/`。
不走任务 C：根因清楚（全路径前缀 vs basename），方案没问题，只是实现漏了工单一个分支。
现包仍干净（71 条，无 .map / .env），用户先拿去 Windows 试装不受影响。

探针临时目录 `/tmp/mgr-t46ab.*` 验完已删；worktree `git status` 无残留。
