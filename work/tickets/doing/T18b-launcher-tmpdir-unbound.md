# T18b：launcher cleanup 函数在无 TMPDIR 环境下 unbound 崩（机械单）

> 开单：main（纯机械小改，跳过立项）| 日期：2026-11-08 | 施工：main (GLM 5.3)
> 来源：今晨拉起产品实例实测——非交互 shell（无 TMPDIR）+ `set -u` → `line 108: TMPDIR: unbound variable`，launcher exit 1。桌面 session 通常有 TMPDIR 故用户手跑不炸；cron/服务化拉起必炸。
> 分支 / 作业目录：集成分支直接改
> claimed：2026-11-08 01:4x main (GLM 5.3)
> accepted：

## 改法（一行）
`:108` case 匹配串 `"$TMPDIR"/p2sdk-handoff-*` → `"${TMPDIR:-/tmp}"/p2sdk-handoff-*`（仅 cleanup 的模式匹配兜底，不影响主流程 TMPDIR 使用——其余处已带默认值或非 set -u 敏感？施工时 grep 全文件核对）。

## 先红
`env -u TMPDIR bash ~/bot/app/launcher/hivebot`（或带 --help 快速路径若先经过 cleanup）→ 贴 unbound 原样行。（若无快速路径不真起 Electron——构造最小复现：`bash -c 'set -u; case x in "$TMPDIR"/*) ;; esac'` 证同形态+改后同命令通过。）

## 验收
1. `env -u TMPDIR bash -n`（语法）+ 最小复现绿
2. 带与不带 TMPDIR 各拉起一次 launcher（真实例：SDK ready + electron 进程在；收尾后无孤儿）
3. 回执 receipts/T18b.md

## 边界
只动 `app/launcher/hivebot` TMPDIR 相关行；不碰其余清理逻辑。
