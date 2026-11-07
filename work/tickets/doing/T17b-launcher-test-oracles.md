# T17b：启动器测试面补 oracle（M1/M2 咬合、⑤ 走文件路径、pid 集合限本实例）+ 三处小毛病

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T17 终验（`receipts/T17.md` §6）。T17 产品面已通过并可合并；本单不挡用户体验。
> 分支 / 作业目录：feat/T17b（从 T17 合并后的主线切）@ /tmp/bot-wt/T17b
> claimed：
> accepted：

## 目标
让 `launcher.spec.ts` 每格真咬住它声称保护的那一行（M1–M4 全红），并修启动器三处小毛病。

## 动手前先读
1. `receipts/T17.md` §6（全部结论与探针原样）
2. 经理探针：`work/product-launcher/evidence/probe2.sh`、`inspect-env.mjs`（`--inspect` 读 Electron 主进程 process.env 键名——可照搬进 spec）
3. LEARNINGS 2026-11-07 T17 三条

## 边界
1. 只动 `app/launcher/hivebot`、`app/ui/tests/e2e/launcher.spec.ts`（可新建 `app/ui/tests/support/proc.ts`）。
2. 先红：改完 spec 后先在**未改的** T17 启动器上跑 M1、M2 两刀，贴红输出，再动启动器。
3. 跑前 `pgrep -af bot-T17` 必须空（不空先 bot-reap）；变异必须在干净基线上跑。

## 要改的
- **pid 集合限本实例**：①④ 与 ⑤ 的 pidOf 不再按仓内路径扫全机；改为从启动器 pid 沿 `/proc/<pid>/task/*/children` 收后代（关窗前收），dsh 用 sdk.log 的 `p2sdk: dsh pid N`。
- **⑤**：spawn env **不带** LITELLM_MASTER_KEY（key 只在 0600 文件）；Electron 侧改用 `--inspect=<空闲端口>` + inspector `Runtime.evaluate` 判五键（带正对照 `PBOTS_DSH_HANDOFF` 为 true）；删「environ 偶发不含→行为兜底」分支，SDK 侧直接断言 environ 有 `P2SDK_LLM_API_KEY`。另起一格或同格补「env 里有 LITELLM_MASTER_KEY → Electron 无它」。
- **M1 咬合**：① 断言 dsh 是被优雅停的（如 sdk.log 有 start.mjs 转发 TERM 后 dsh 正常退出的行，或 dsh 退出码/信号非 KILL），使删 :92-96 → 红。
- **退出码**：cleanup 用调用方传入的码（UI 先退 → UI 码；SDK 先退 → TERM UI 后 exit 1，不再无限 `wait "$UI_PID"`）。新增一格：mock 下 kill SDK(start.mjs) → 启动器 ≤30s 退出码 1、无残留。
- **env 文件**：末行无换行也读（`|| [ -n "$k" ]`）；③ 补一格「末行无换行的 0600 文件 → 走到 SDK ready」。引号值：去掉成对首尾 `"`/`'`，同格覆盖。
- 删 `T17LAUNCH cleanup-done` 调试行；③b 先写 env 文件再 spawn（现为 spawn 后写，有竞态）。
- ⑥ 补断言定稿文本非空；② 补第一实例 `session/list` 成功。

## 验收（写命令，不写感觉）
1. `bash -n app/launcher/hivebot && test -x app/launcher/hivebot` → 0
2. `cd app/ui && sh scripts/run-e2e.sh tests/e2e/launcher.spec.ts`（有 LITELLM_MASTER_KEY）→ 全部 passed；跑后 `pgrep -af bot-T17` 空
3. 变异各一刀、跑对应格、贴原样、cp 还原：M1 删 :92-96 → ① 红；M2 删 Electron 行 `env -u …` → ⑤ 红；M3 → ② 红；M4 → ③b 红；M5 cleanup 恒 `exit 0` → 新「SDK 先退」格红；M6 删末行补读 → 新 env 文件格红
4. 回执 `receipts/T17b.md`：贴 1–3 原样尾部；每刀注明跑前 pgrep 为空

## 为什么这样验收
- T17 的 ⑤「Electron 无 key」在 /proc 上恒真（Chromium setproctitle 改写 environ 区）——凭证面需要一个能看见正对照的 oracle，否则绿等于没测。
- 全机路径扫 pid 让施工期残留污染判定：M1 的「红」其实是旧残留；限本实例后红绿才有意义。
- 变异必须在干净基线跑，否则红可能来自别的东西。

## 产出
- `app/launcher/hivebot`、`app/ui/tests/e2e/launcher.spec.ts`（+ 可选 `tests/support/proc.ts`）、`work/tickets/receipts/T17b.md`
