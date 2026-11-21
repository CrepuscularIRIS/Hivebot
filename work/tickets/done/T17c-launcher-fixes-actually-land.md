# T17c：T17b 返修——启动器三修真落进提交 + T17b 未做的五项 + 红格不留孤儿

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T17b 终验不通过（第 1 次），证据 `receipts/T17b.md` §经理终验
> 分支 / 作业目录：继续 feat/T17b @ /tmp/bot-wt/T17b（在 84595995 上续提交，不新开分支）
> claimed：
> accepted：2026-11-07 feat/T17b @ dd9f70c5（带遗留：M1 不咬合 / ③b 竞态 / ⑤ pidOf 全机扫 / finally 简化 → queue T17d 计划；证据 feat/T17b `receipts/T17b.md` §经理终验 第 2 轮）

## 目标
T17b 工单「要改的」逐条在**提交里**落地；commit message 只写 diff 里真有的东西。

## 动手前先读
1. `work/tickets/doing/T17b-launcher-test-oracles.md`（原单，要改的一条不少）
2. `receipts/T17b.md` §经理终验（失败原样 + 缺项表）
3. LEARNINGS 2026-11-07 T17b 两条（变异还原吞未提交改动；红格 SIGKILL 启动器留孤儿 dsh）

## 边界
1. 只动 `app/launcher/hivebot`、`app/ui/tests/e2e/launcher.spec.ts`（可新建 `app/ui/tests/support/proc.ts`）、`work/tickets/receipts/T17b.md`。
2. **先提交、再变异**：启动器修复与 spec 改动先 commit；变异一律 `cp` 备份→改→跑→`cp` 还原→`cmp` 相同；**不用 `git stash` / `git reset` / `git checkout --` 还原**。
3. 每刀跑前 `pgrep -af bot-T17` 空（不空先 bot-reap），跑后也贴。

## 要改的（T17b 未落地部分，对号）
1. **启动器三修进提交**（84595995 的 `app/launcher/hivebot` 与 T17 完全相同，:105 调试行还在）：退出码（UI 先退→UI 码；SDK 先退→TERM UI 后 exit 1，去掉无限 `wait "$UI_PID"`）；env 文件末行无换行可读；成对首尾引号剥离；删 :105 `T17LAUNCH cleanup-done`。
2. **⑤ 走文件路径**：spawn env 去掉 `LITELLM_MASTER_KEY`（现在有它→启动器根本不读文件，KEY 断言空转）；删 :326-331 兜底分支，直接断言 SDK `/proc/<pid>/environ` 含 `P2SDK_LLM_API_KEY=${KEY}\0`；pidOf 改走 `descendantPids`（不扫全机）。LITELLM 剥离不另起格（同一行 `env -u`，M2′ 已代表）。
3. **M1 咬合**（T17b 未动）：① 加一条只在「启动器先 TERM SDK、SDK 正常收 dsh」时成立的断言（sdk.log 转发 TERM 行 / dsh 非 KILL 退出——施工方实测选一个，回执写为什么它在删 :92-96 后必假）。
4. **③b 竞态**（T17b 未动）：env 文件在 spawn 前写好（`launchHivebot` 加一个 spawn 前写文件的选项即可），删掉先起再停的那一轮。
5. **⑥ 定稿文本非空**、**② 第一实例 `session/list` 成功**（T17b 未动）。
6. **⑧ 断言引号已剥**：SDK environ 含 `P2SDK_LLM_API_KEY=sk-t18-nl-000\0`（无引号）。现 ⑧ 只看「起来了」，带引号的 key 也能起，引号剥离没被测。
7. **红格不留孤儿**：⑤⑥⑧ 的 finally 现为 `proc.kill('SIGKILL')`——启动器被 KILL 跳过 cleanup，dsh 成孤儿（经理 M2/M4 红跑后实测各留 1 个 dsh）。改为先收 `descendantPids`→SIGTERM 启动器等 ≤30s→仍活再 SIGKILL 已收集的全部 pid。

## 验收（写命令，不写感觉）
1. `git diff 49371a78 HEAD --stat -- app/launcher/hivebot` 非空；`grep -c T17LAUNCH app/launcher/hivebot` → 0；`bash -n app/launcher/hivebot && test -x app/launcher/hivebot` → 0
2. `cd app/ui && sh scripts/run-e2e.sh tests/e2e/launcher.spec.ts`（有 LITELLM_MASTER_KEY）→ **9 passed**（①②③a③b④⑤⑥⑦⑧）；跑前跑后 `pgrep -af bot-T17` 空
3. 变异（每刀贴 `diff` + 结果尾 + 前后 pgrep）：
   - M1 删 :92-96 等价段 → ① 红
   - M2′ Electron 行删 `-u P2SDK_LLM_API_KEY` → ⑤ 红（文件路径下真 key 进 Electron）
   - M3 删 flock 分支 → ② 红；M4 删权限检查 → ③b 红
   - M5′ SDK 先退分支的退出码改 0 → ⑦ 红（取代原 M5：退出码只从一处出，变那一处）
   - M6 删末行补读 `|| [ -n "$k" ]` → ⑧ 红；M7 删引号剥离 → ⑧ 红
   - 每刀红跑后 pgrep 仍空（验第 7 条）
4. 回执 `receipts/T17b.md` 补施工节（在经理终验节**之前**）：贴 1–3 原样尾部；对号表从 `git diff 49371a78 HEAD` 写，不从意图写。

## 为什么这样验收
- 84595995 的「8 格全绿 43.3s」在提交树上复现不了（经理跑 7 passed / ⑦⑧ 红）：修复只在施工方工作区里存在过。验收 1 直接看 diff，堵住「说了改、树里没有」。
- ⑤ 的意义是「真 key 从 0600 文件进 SDK、不进 Electron」——env 带 LITELLM 时文件根本不读，测的是另一条路。
- 红跑留孤儿会污染下一刀的基线（T17 终验同病），所以第 7 条要用变异红跑本身来验。

## 产出
- `app/launcher/hivebot`、`app/ui/tests/e2e/launcher.spec.ts`（+ 可选 `tests/support/proc.ts`）、`work/tickets/receipts/T17b.md`
