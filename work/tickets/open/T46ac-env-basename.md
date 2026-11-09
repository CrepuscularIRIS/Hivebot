# T46ac：win 包校验的 `.env.*` 禁令改按文件名判（T46ab 返修）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：`receipts/T46ab.acceptance.md`「缺口」
> 分支 / 作业目录：feat/T46a @ /tmp/bot-wt/T46a（接着同一分支提交）
> claimed：
> accepted：

## 目标
`forbidden()` 的第三项 `p.startsWith('.env')` 判整条路径，只管根层；`out/.env.local`、`out/renderer/.env.production` 放过（经理探针实证）。改成对**最后一段**判：`=== '.env'` 或 `startsWith('.env.')`。

## 边界
1. 只动 `app/ui/scripts/check-win-package.mjs` 的 `forbidden` 那一行，不扩别的规则。
2. 先红：照经理探针造一个变异包（现 asar 解到 `/tmp`，加 `out/main/index.js.map`、`out/.env`、`out/.env.local`、`out/renderer/.env.production`，`@electron/asar` 的 `createPackage` 重 pack 到 `/tmp/<dir>/dist-app/win-unpacked/resources/app.asar`，并拷 `elevate.exe`），cwd 指过去跑**改前**脚本 → 只报 2 条（贴尾）。
3. 临时产物放 `/tmp`，验完删；不改 main/preload/renderer，不重打正式包。

## 验收
1. 现产物：`cd app/ui && node scripts/check-win-package.mjs` → `OK 白名单 71 条全过` exit 0
2. 同一个变异包：改后 → exit 1，stderr 列出 **4 条**：`out/.env`、`out/.env.local`、`out/main/index.js.map`、`out/renderer/.env.production`。回执贴改前（2 条）与改后（4 条）尾部。

## 为什么这样验收
`.env.local` 是本地凭证最常见的文件名；改前 2 条 / 改后 4 条在同一输入上对比，证明新规则对子目录 `.env.*` 有判定力。

## 产出
- `app/ui/scripts/check-win-package.mjs`
- 回执 `work/tickets/receipts/T46ac.receipt.md`
