# T46db：`serve --connect` 的 remote-root 拒绝清单漏了换行（LF）——输出两行半截 JSON 还 exit 0

> 开单：manager (Opus 5.5) | 日期：2026-11-10 | 施工：main (GLM 5.3)
> 来源：T46d 验收（`receipts/T46d.acceptance.md` §3）——经理手测探针
> 分支 / 作业目录：feat/T46d @ /tmp/bot-wt/T46d（接着 eb9cb0b8 提交）
> 失败计数：T46d 第 1 次不通过
> claimed：
> accepted：

## 目标
remote-root 里只要有任何控制字符（含 LF）、双引号或反斜杠，`serve --connect` 就走 `handoff-incomplete`，stdout 一个字节都不打。和语言环境无关。

## 现状（经理实测，原样）
`grep -q '[^[:print:]]'` 是按行匹配的，换行本身就是分隔符，抓不到。remote-root = `/srv/a<LF>q` 时：
```text
LF-mid         rc=0 stdout_nl=1 BAD-JSON err=
```
stdout 是两行，第一行是带 token 的半截 JSON，退出码 0——违反 T46d 定案 1「remote_root 含控制字符 → handoff-incomplete、不打半截 JSON」。
另：`[:print:]` 依赖语言环境，`LANG=C` 下 `/srv/中文` 被误拒（`cjk-Clocale rc=1`）；非交互 ssh 不一定带 UTF-8 locale。

## 定案
`app/launcher/hivebot` 的 `--connect` 段，把三条 grep（第 60–63 行那组 `if … fi`）换成一条（`$REMOTE_V` 为空已在上面第 57 行拒过）：
```bash
[ "$(printf '%s' "$REMOTE_V" | LC_ALL=C tr -d '\000-\037\177"\\')" = "$REMOTE_V" ] || fail_connect
```
经理已逐项验过这行：反斜杠 / CR / U+0001 / LF / TAB / 双引号 / DEL 拒；空格、`/srv/中文`（含 `LANG=C`）、普通路径放行。注释改一行说明「删掉坏字符后和原值不一样就拒；tr 不分行，所以 LF 也抓得到」。

## 边界
1. 只动 `app/launcher/hivebot`（那一段）和 `app/ui/tests/e2e/launcher-serve.spec.ts`（⑬ 矩阵）。
2. 先红：⑬ 坏输入表加 `'a\nb'`（中间换行）、`'a\tb'`；放行表加 `'/srv/中文'`。改 launcher 前跑，`'a\nb'` 那格必须红（rc 0）。
3. ⑬ 的放行格断言里加一条：`okr.out` 去掉末尾换行后**不含** `\n`（一行）。
4. 隔离 HOME/TMPDIR/XDG、死 DBus，`run-e2e.sh`。

## 验收（app/ui 下，/tmp/bot-wt/T46d）
1. `PATH="$PWD/node_modules/.bin:$PATH" pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/launcher-serve.spec.ts` → 1 passed
2. 先红证据：改 launcher 前同命令 → 1 failed，失败行是 ⑬ `"a\nb"` 的 exit 1 断言。回执贴原样
3. 变异：把 `tr -d` 的集合里删掉 `\000-\037` → ⑬ 红；还原复绿
4. `ps -eo cmd= | grep -F bot-t46c- | grep -v grep` 为空

## 为什么这样验收
T46b 的 Windows 侧按一行 JSON 解析 `--connect` 输出；这里要保住的是「要么一行完整 JSON + exit 0，要么 stdout 空 + exit 1」，没有第三种。LF 是唯一能把输出拆成多行的字符，正好是现在漏的那个，所以先红必须是它。

## 产出
- `app/launcher/hivebot`、`app/ui/tests/e2e/launcher-serve.spec.ts`
- 回执追加到 `work/tickets/receipts/T46d.receipt.md` §7（T46db）
