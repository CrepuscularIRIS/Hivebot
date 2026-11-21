# 回执 T46ac：win 包校验 .env 禁令按文件名判（T46ab 返修）

> 施工：main (GLM 5.3) | 完成时间：2026-11-09
> 分支 / 提交：`feat/T46a` @ dc864c0b（续 42987cb3，worktree /tmp/bot-wt/T46a）

## 1. 做了什么

`check-win-package.mjs` 的 `forbidden` 第三项从「整条路径 `.startsWith('.env')`（只管根层）」改为**逐段判文件名**：`seg === '.env' || seg.startsWith('.env.')`——子目录的 `out/.env.local`、`out/renderer/.env.production` 不再漏（`.env.local` 是本地凭证最常见名）。

## 2. 验收证据（同一变异包，改前/改后对比）

变异包造法（工单指定）：现 asar `extractAll` → 塞 `out/main/index.js.map`、`out/.env`、`out/.env.local`、`out/renderer/.env.production` → `createPackage` 重 pack 到 `/tmp/t46ac-dist/dist-app/`（验完已删；正式包未动）。

**改前**（2 条——`.env.local`/`.env.production` 被放过）：
```text
FAIL ⓒ 非白名单条目 2 个：out/.env, out/main/index.js.map
校验红（条目总数 75）
改前 exit=1
```
**改后**（4 条全抓）：
```text
FAIL ⓒ 非白名单条目 4 个：out/.env, out/.env.local, out/main/index.js.map, out/renderer/.env.production
变异包改后 exit=1
```
**现产物回归**：
```text
OK 白名单 71 条全过（ws 内含：是）
exit=0
```

## 3. 产出

- `app/ui/scripts/check-win-package.mjs`（forbidden 一行）
