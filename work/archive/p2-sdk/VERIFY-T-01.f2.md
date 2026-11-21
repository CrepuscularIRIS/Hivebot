# VERIFY · T-01.f2 启动器并发独占 + 信号（R4+R5 修复）

verdict: PASS
commit: e2828a7e59946080e0c816cd9bf9faa69ce8cdb8（worktree /tmp/bot-wt/T-01.f2，验收期间 HEAD 未变、工作区干净）

验收项原文（PLAN §2.5 T-01.f2）：「① 并发第二实例同 home → 非零退出且不覆盖前者文件 ② PTY 单次 Ctrl-C：dsh 恰收一次 SIGINT、dispose 完成后才退出（日志证据）」

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 回归全量测试（应 24/24） | PASS | `pnpm -C /tmp/bot-wt/T-01.f2/app/sdk exec vitest run --no-file-parallelism`：`Test Files 2 passed (2)` `Tests 24 passed (24)`，14:41:11 起 3.58s；evidence/t01f2-regression.txt |
| ① 并发第二实例同 home 非零退出且不覆盖前者文件 | PASS | 复跑 `/tmp/T-01.f2-tests/test-r4.mjs`（真实链路 scripts/start.mjs，A=mock 与 B=real 同 home）：B 退出码 1、stderr 报 `already in use by launcher pid …`；launch-token 与 runtime-patch.yml 内容逐字不变；A 存活。锁子项：A 退出后 launcher.lock 消失、fresh 实例可启动、死 pid（191919）stale 锁被抢占——8/8 GREEN；evidence/t01f2-r4-rerun.txt |
| ① 坏路径补充（垃圾锁内容） | PASS | 自写 evidence/t01f2-pgid-and-junklock.mjs：锁内容 `not-a-pid` → 视为 stale，实例正常启动 |
| ② PTY 单次 Ctrl-C：dsh 恰收一次 SIGINT | PASS | 双证据：a) 真实 mock dsh 链路 `bash /tmp/T-01.f2-tests/test-r5-real.sh`（`script -qec` 建 PTY，单次 `\x03`）：`forwarded SIGINT log lines=1`、launcher exit 130、锁释放、`no leftover processes`（evidence/t01f2-r5-real.txt）；b) detach 前提直接验证：ready 状态下 dsh pgid 1460264 ≠ launcher pgid 1460236（evidence/t01f2-pgid-junklock.txt），TTY 前台组信号无法直达 dsh |
| ② dispose 完成后才退出（日志证据） | PASS | `exp-r5.mjs`（spawn options 取自真实 `src/start.ts` 导出 `dshSpawnOptions`；fake-dsh 复刻钉版 profile-boot shutdown 语义：第二次 SIGINT 立即 exit 跳过 dispose）：`sigint=1 → dispose-start → dispose-done → exit 130`。负对照 evidence/t01f2-exp-r5-red.mjs（同装置强制 detached:false）：`sigint=2`、`dispose-done=false`——装置能检出双投递，GREEN 非装置失灵；evidence/t01f2-r5-green-red.txt |
| 区域检查 | PASS | `git -C /tmp/bot-wt/T-01.f2 diff --name-only main` 输出仅 `app/sdk/src/start.ts` |
| 遗留建议复核：acquireHomeLock 无 unit 覆盖 | 可接受为遗留 | grep 证实 `tests/unit/start.test.ts` import 列表无 acquireHomeLock/dshSpawnOptions。判定：**阶段性可接受**——锁全部分支（获取/活 pid 拒绝/死 pid 抢占/垃圾内容抢占/退出释放/释放后重取）与 detached 语义（PGID 分离 + PTY 绿路径 + 负对照）均已有真实环境证据，比 unit 更强；缺的是防回归网。建议随 T-02（测试骨架任务）顺手补：纯文件 I/O，start.test.ts 已有 mkdtemp 模式可循，不必阻塞本任务合并 |

额外坏路径（任务步骤 3 要求）：并发双实例（验收①本身）+ 单信号截断（负对照）+ 垃圾锁内容，均已覆盖。

无 UI，无截图义务。

## 环境卫生记录（不影响 verdict）

- 验收中发现并清理了 builder 提交前红路径实验遗留的孤儿链：2 个 start.mjs（mock 1377960 / real 1378116，home /tmp/p2sdk-r4-BKMN3E，文件时间 14:34 早于本次回归 14:41）+ 各自 detached dsh，被 systemd 收养后挂 ~20 分钟。`kill -TERM` 两个 launcher 后整链干净退出（顺带实证：launcher 存活时 SIGTERM 转发链对 detached dsh 有效，无孤儿）。
- 本验收自身实验零残留（进程与 /tmp home 目录均已回收）。
- `pgrep -f "P2SDK_HOME=…"` 会误匹配承载命令的 bash 自身 cmdline（LEARNINGS pkill -f 规则的 pgrep 变体），判残留必须 `pgrep -af` 看清单。
- 系统内另有 T-03 并行会话的 dsh/start.mjs（/tmp/t03dbg），非本验收范围，未触碰。

## 新问题（每条一行，可直接成为修复任务）

- [FIX] launcher 被外力强杀（SIGKILL）或父脚本死亡时，detached dsh + 存活的 launcher 链被 systemd 收养后永久挂起（R5 修复的已知取舍，本次实测复现） | 复现：跑 test-r4.mjs 的脚本进程被 kill -9 / Ctrl-C 后 `ps` 查 start.mjs 与 dsh/lib/bin.js | 疑似位置：app/sdk/src/start.ts（detached:true 取舍 + main 无父进程存活检测） | 严重度 low（验收项外；launcher 存活时转发链实证正常）
- [FIX] acquireHomeLock / dshSpawnOptions 无 unit 回归覆盖，未来重构锁逻辑 vitest 不会红 | 复现：`grep -rn acquireHomeLock /tmp/bot-wt/T-01.f2/app/sdk/tests/` 无命中 | 疑似位置：app/sdk/tests/unit/start.test.ts | 严重度 low（随 T-02 补）
- [FIX] builder 实验脚本（test-r4.mjs）无 SIGINT 兜底清理，中断即留孤儿 | 复现：Ctrl-C 跑到一半的 test-r4.mjs | 疑似位置：/tmp/T-01.f2-tests/test-r4.mjs（临时脚本，随 /tmp 失效；规则写给后续实验脚本） | 严重度 low
