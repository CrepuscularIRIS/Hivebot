# LEARNINGS

现象 → 根因 → 规则，每条 ≤3 行。

2026-11-01 LOG 时间戳靠感觉写 → 实际比记录慢 10–20 分钟，tick 的对照价值受损 → 写 LOG 行前必须 `date +%H:%M` 实测，不估。

2026-11-01 judge 席（Sol）运行约束禁写文件 → 三席原文回不到 panels/ → 主会话收到回报后机械代录原文并标注「代录，未经改写」；fable 席可自落盘，两种都接受。

2026-11-01 用户在 QUESTIONS 的答复可能答非所问（Q-002 问截图登录，答的是测试用本地 LiteLLM）→ 回答快、问题多时易错位 → 落实前先解析答复内容对不对题；对不上的部分按内容找归属（新事实→落实进 PLAN/任务），歧义按默认解读并加「落实」注记请用户纠正。

2026-11-01 用户 2026-11-01 指令「先把 demo 跑出来」→ 用户要节奏，不要流程完美主义 → 取舍类问题按推荐快速定稿不再等；PLAN/派发排序以最小可跑链路（起→建 session→发消息→流式回复）为先，测试与加固紧随其后但不阻塞 demo。

2026-11-01 ui-shell RE 用 `pkill -f` 差点自杀（exit 144）；Grok Bot 忽略 `--user-data-dir`、首启写真实 ~/.config → ① 给任何会启动/杀进程的 agent（RE、verifier、builder）的提示词都要带「不用 pkill -f，先 pgrep -x 拿 PID」；② 隔离运行 Grok Bot 一律 `HOME=/tmp/<隔离目录>` 覆盖，--user-data-dir 不可信。

2026-11-01 verifier 验收 f3 期间 builder 并发 rebase 导致共享 worktree 出现 UU 冲突 → 验收被中断风险 → verifier 遇 head 漂移：不动 builder 现场，改用独立 `git worktree add --detach` checkout 到申报 SHA 分别验证；这条写进 verifier 派发提示词。

2026-11-01 T-08 合并后 f3 也合并，f3 的 token 位置迁移悄悄弄红 T-08 的 security 测试，两天后由 T-11 builder 发现修复 → 并行分支各自验证绿 ≠ 合并后绿 → 每次合并进 main 后立即全量回归（或至少 grep 受影响符号的测试文件单跑），红则当场修或回退。

2026-11-01 机器重启（18:30 pkill 事故 + 22:28 硬重启）→ /tmp worktree 与 /dev/shm 解包树全丢，git 分支与 work/ 状态文件无损 → 恢复流程：`git worktree prune` + `git worktree add <path> <branch>` 重建 + `pnpm setup` 恢复依赖；被中断的 verifier 无产出直接重派（提示词带「worktree 刚重建先 setup」）；解包树按 RE-unpack §0 复现命令重建。重启后 cron 必丢——skill 启动第 1 步补建。

2026-11-01 用户 2026-11-02 明确表态「不希望重启电脑、不要 kill 行为、之前误杀过系统进程」→ 用户对进程操作高度敏感（有一次桌面会话被注销的事故）→ 所有派发提示词明确三层：①测试内 kill 仅限测试框架自管的子进程（模拟崩溃验收）；②agent shell 手工 kill 全禁（§5 + process_guard hook）；③机器重启/注销绝不自动化，只由用户手动。向用户汇报涉及 kill 的验收时，说明只杀 SDK 自身子进程。

- 主会话把 RE 回报「dmg/exe 未解」转述成「无 dmg 源」，导致 panel 出现假冲突 → 转述时丢了限定词 → 写 LOG 或派发时，事实性结论要引原文行号，不改写限定词（有/无、未验证/不存在）。
2026-11-01 用户定：panel 改为两席（A=Opus fable、B=Sol sonnet，都是裁决席），K3 不用、GLM 不进 panel。已按三席派出、还没汇总的 panel：只按 A+B 两席汇总；席 C 带证据的 BLOCKER/HIGH 仍进必须回应清单。D 题 A/B 不一致 → 写 QUESTIONS。

## 2026-11-01 · GLM verifier 用 `pkill -x -P 1` 杀掉桌面会话，机器被迫重启
- 现象：18:30:47 verifier（T-12 验收）清理 demo runtime 时跑 `pkill -x -P 1`；`systemd --user` 是本用户唯一父进程为 1 的进程，被杀后整个 GNOME 会话注销，GDM 连续 22 次起不来（drmSetMaster 失败），机器停在文字控制台，22:28 被 Ctrl+Alt+Del 重启。
- 根因：「不用 pkill -f」只禁了一种写法，模型换个参数就绕过；规则靠模型自觉。
- 规则：进程终止只由 Opus 5.5（`process-ops`）执行，GLM / Sol 只查不杀；`.claude/hooks/process_guard.py` 在命令层面强制（CLAUDE.md §5）。
