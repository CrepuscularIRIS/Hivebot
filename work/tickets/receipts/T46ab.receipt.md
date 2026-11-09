# 回执 T46ab：win 包校验禁令补强（*.map / .env 白名单片内也拒）

> 施工：main (GLM 5.3) | 完成时间：2026-11-09
> 分支 / 提交：`feat/T46a` @ 42987cb3（T46a 续修，worktree /tmp/bot-wt/T46a）
> 工单：`open/T46ab-win-package-deny-map-env.md`（经理任务 B 开的返修单）

## 1. 做了什么

`check-win-package.mjs` 的 ⓒ 在白名单放行之后加 `forbidden(p)` 禁令：`*.map` 结尾、任何路径段为 `.env`、`.env` 前缀——三层都拒。禁令独立于 electron-builder.yml 的 `!out/**/*.map` 排除行生效（经理指出：原脚本只按 out/** 前缀放行，yml 那行删掉校验照样绿 = 防线只有一层）。顺带更正 T46a 回执两处数字（116M/2.6M；@electron/asar 4.3.1）。

## 2. 证据（经理要求的「改前绿 → 改后同包红 → 还原绿」三段）

**改前（漏洞复现）**：out/ 塞 `main/index.js.map` + `out/.env` → `dist:win` → check：
```text
OK 白名单 72 条全过（ws 内含：是）   ← map 被 yml 排除层挡了，.env 进包却没人管
check exit=0
```
（包内实查：`[ '/out/.env' ]`——.env 真在包里。）

**改后（禁令判定力，去 yml 排除行让 map 也进包）**：
```text
FAIL ⓒ 非白名单条目 9 个：out/.env, out/main/index.js.map, out/renderer/assets/desktop-surface-X4Tx1dy6.js.map, …（8 map + 1 env）
check exit=1
```
**还原（yml 恢复 + 删塞的坏文件 + 重打）**：
```text
OK 白名单 71 条全过（ws 内含：是）
check exit=0；116M exe / 2.6M asar
```

## 3. 产出

- `app/ui/scripts/check-win-package.mjs`（forbidden 禁令）
- `work/tickets/receipts/T46a.receipt.md`（数字更正）
- 给用户的 Windows 三步不变（T46a 回执 §6）
