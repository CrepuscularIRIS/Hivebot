# VERIFY P5-01.f2 —— 文件根遮蔽原语替换（--ro-bind /dev/null → --ro-bind-data 空 fd）

verdict: PASS
commit: 71b91be0fa707c3a87a3601c625bc614cad12800（分支 feat/P5-01f2 @ /tmp/bot-wt/P5-01f2；验收期间 HEAD 未漂移、git status 干净）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 1. 全量测试 31 files / 249 tests + wrapper/hardened/matrix 三文件自跑 | PASS | `HOME=/tmp/bot-vfy-P5-01f2 pnpm -C /tmp/bot-wt/P5-01f2/app/sdk test` → `Test Files 31 passed (31) / Tests 249 passed (249)`；三文件 `vitest run` → 3 passed / 29 tests（10+9+10，与报告 10/10 + 19/19 对账一致）。evidence/P5-01/vfy-f2-probe.txt ① |
| 2. 机制抽验：--mask 文件根 + cat → rc=0 且空、test -f=0、test -s=1、mountinfo 源为普通文件非设备 | PASS | 自构哨兵（不碰真实凭证）经真实 wrapper：`cat_rc=0 out=[]`、`type_f=0`、`size_s=1`、`is_chardev=1`、stat=`regular empty file size=0`、mountinfo 源=`0:109 /bindfilerKtFWb//deleted - tmpfs`（非 devtmpfs /null），与分支内 f2-boot-probe.txt ④ 同构；另验写入 → EROFS、宿主 sha 内容不变、沙箱原生 /dev/null rc=0。vfy-f2-probe.txt ② |
| 3. 红基线：hide_args 退回 --ro-bind /dev/null → f2 新测试红（字符设备签名），恢复绿 | PASS | 在隔离副本（/tmp/bot-vfy-P5-01f2/red，node_modules 符号链接，builder 现场未动）退回旧原语：wrapper f2 测试 `expected 'rc=1 bytes=0\ntype_f=1\nsize_s=1\n' to contain 'rc=0 bytes=0'`（字符设备签名精确命中）+ dry-run argv 形状红；hardened ② `ppp_cat 期望 0 实际 1` + ⑧ 连带红；matrix ① `'1:empty' to match /^0:empty$/` + ⑧ 格数连带红。共 3 文件 6 测试红。恢复绿 = ① 的 71b91be 原树全量绿。vfy-f2-probe.txt ③ |
| 4. 机制论证：bind-mount.c MS_NODEV 强制 + may_open EACCES 链路，与证据文件一致性 | PASS | 上游核对（2026-11-03 拉取）：bwrap tag v0.9.0 bind-mount.c `new_flags = current_flags \| (devices ? 0 : MS_NODEV) \| MS_NOSUID \| …`（与报告引文逐字一致）；linux master fs/namei.c `case S_IFCHR: if (!may_open_dev(path)) return -EACCES;` + `may_open_dev()` 查 MNT_NODEV/SB_I_NODEV；v0.5.0 bubblewrap.c 含 `--ro-bind-data FD DEST`（「自 0.5.0 存在」属实）。分支内 evidence/P5-01/f2-boot-probe.txt 28 行（①x5 rc=1、②并发 rc=1+Permission denied、③mountinfo nodev+devtmpfs /null、④修复后 tmpfs bindfile rc=0×3、⑤工具链文件根）内部自洽，且与 P5-06 verify f2-repro.txt 的原始漂移观察互相印证。vfy-f2-probe.txt ④ |
| 5. 区域与越界 | PASS | `git diff --stat 8e857ce..71b91be` = 5 文件：bwrap-wrap.py（产品，本任务范围）+ sandbox-wrapper / sandbox-hardened / w1ap0-matrix 三测试 + work/p5-parity/evidence/P5-01/f2-boot-probe.txt，无范围外改动（派发语「4 文件」为计数口径差异：3 测试+1 产品，evidence 随分支另计） |
| 坏路径（并发/多文件根） | PASS | 3 实例并发 × 每实例 2 个 --mask 文件根：3×2 全部 cat=0 / tf=0 / ts=1，宿主两个哨兵内容（含中文）不变。vfy-f2-probe.txt ⑤ |

新问题（每条一行，可直接成为修复任务）：
- 无 [FIX] 项。
- 观察（非本任务引入）：/tmp 下 213 个历史 `p2sdk-handoff-*` 与 `/tmp/p5-01-*` 测试残留跨任务积累；LEARNINGS 已有「运行时目录用后即删」规则，属既有测试卫生遗留，不阻塞本验收。

验收方法备注：UI 无涉（无截图项）；坏路径选并发×多文件根与写入 EROFS；红基线在独立副本执行，builder 现场（/tmp/bot-wt/P5-01f2）全程未动、验收结束时 `git status --short` 为空。
