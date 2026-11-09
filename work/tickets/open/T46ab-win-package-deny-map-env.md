# T46ab：Windows 包校验补「out/ 内禁 *.map / .env」（T46a 返修）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：T46a 验收（`receipts/T46a.acceptance.md`「缺口」）——工单 T46a 验收 3ⓒ 的禁项没被脚本执行
> 分支 / 作业目录：feat/T46a @ /tmp/bot-wt/T46a（接着同一分支提交）
> claimed：
> accepted：

## 目标
`scripts/check-win-package.mjs` 的 ⓒ 现在只按前缀放行 `out/**`，`out/` 里的 `*.map`、`.env` 会被放过（经理探针：往现包 `out/` 塞 `index.js.map` + `.env` 重 pack，校验 `OK 73 条` exit 0）。补上显式禁项，让「不带 sourcemap / 不带 env」由校验守住，而不是只靠 yml 一行 `!out/**/*.map`。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/ui/scripts/check-win-package.mjs`（`allowed()` 与 ⓒ 段）、`app/ui/electron-builder.yml`、T46a 工单验收 3ⓒ

## 边界
1. 只动 `app/ui/scripts/check-win-package.mjs`。在 ⓒ 加禁项：任一条目以 `.map` 结尾，或文件名为 `.env` / 以 `.env.` 开头 → 红，列出条目。不扩别的规则。
2. 先红：在 yml 临时删掉 `"!out/**/*.map"` 重打（或照经理探针：把现 asar 解到临时目录塞 `out/main/index.js.map`、`out/.env` 重 pack，cwd 指过去跑脚本），**改脚本前**先跑一次看它仍是绿（证明缺口），改后同一输入变红；还原 yml / 删临时目录。
3. 临时产物放 `/tmp`，不留在 worktree；不改 main/preload/renderer。

## 验收
1. 现产物：`node scripts/check-win-package.mjs` → `OK 白名单 71 条全过` exit 0
2. 带 `.map` + `.env` 的变异包 → exit 1，stderr 含 `.map` 与 `.env` 两个条目名；回执贴改前（绿）和改后（红）两次尾部
3. 回执顺手更正 T46a 回执的两处数字：现包 `app.asar` 2.6M（不是 8.6M）、Setup 116M；`@electron/asar` 实为 4.3.1（不是 4.0.1）

## 为什么这样验收
T46a 的目的之一是「包里不夹带源码与凭证」。`.map` 带源码路径和原文，`.env` 是凭证最常见的落点；它们恰好都在白名单前缀 `out/` 之内，前缀白名单天然查不出。验收 2 的「改前绿、改后红」证明新规则真有判定力。

## 产出
- `app/ui/scripts/check-win-package.mjs`
- 回执 `work/tickets/receipts/T46ab.receipt.md`
