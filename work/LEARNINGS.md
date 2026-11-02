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

2026-11-02 用户 2026-11-02 06:30 授权边界调整：「这类问题你不用来询问我，我只需要使用什么开源的套件、效率快速复现、全线贯通」→ 技术取舍类（契约方法增减、预设行为、库选型）不再开 QUESTIONS，按推荐项自动推进并在 LOG 记录；仅三类事才问用户：安全红线（凭证/审批默认值放宽要引用用户原话授权）、花钱/对外动作、不可逆决策。用户答复以聊天文字为准（不用 python 改文件，手动 Edit 引用原话）。开源套件选型与全线快速复现是用户的核心验收标准。

2026-11-02 用户 2026-11-02 11:00 UI 定稿指令：「尽量和原来的 UI 保持一致」→ P4 视觉还原度优先：ux-proposer 提案与 frontend-dev 定稿以原版为最高参照（evidence/01-boot.png + RE-theme token + RE-ui-shell 组件树逐页对齐）；dsh 组件骨架只在结构层复用，外观差异按原版改；D12 外观验收以「与原版截图并排对照」为证。

2026-11-02 U-00 builder 实测 Electron 44 三坑 → ①无 postinstall 钩子（依赖安装后需手动触发原生模块配置）；②getLastWebPreferences 不含 devTools（断言 devTools 关要用别的方式，如 webContents 的 devToolsWebContents 判空）；③无手势合成 API，click 到不了 window.open handler（测新窗口拦截要用 setWindowOpenHandler 的直接断言或真实输入事件）；④vitest 5 不再设 VITEST env（Electron 主进程守卫用 process.type === 'browser'）。P4 所有 Electron 测试任务注意。

2026-11-02 U-12 builder 实测 Electron 44 + dsh 三坑 → ①webContents.postMessage 到 renderer 的 event.senderFrame 是 **undefined 非 null**（读 .url 前必须判空，否则 TypeError 杀回调）；②port 帧协议必须是 JSON 文本（上游 RemoteStreamMuxClient 下行只收 string，stream-server.ts:328-331）；③审批作答与 $events 流**同 Peer 绑定**（gateway 拒另一连接代答）——main 代答要走自己那条连接；测断链别用 socket.close() 预置 dead（会抑制 die/重连），反射 terminate 私有 ws 才行。

- 主会话把 RE 回报「dmg/exe 未解」转述成「无 dmg 源」，导致 panel 出现假冲突 → 转述时丢了限定词 → 写 LOG 或派发时，事实性结论要引原文行号，不改写限定词（有/无、未验证/不存在）。
2026-11-01 用户定：panel 改为两席（A=Opus fable、B=Sol sonnet，都是裁决席），K3 不用、GLM 不进 panel。已按三席派出、还没汇总的 panel：只按 A+B 两席汇总；席 C 带证据的 BLOCKER/HIGH 仍进必须回应清单。D 题 A/B 不一致 → 写 QUESTIONS。

## 2026-11-01 · GLM verifier 用 `pkill -x -P 1` 杀掉桌面会话，机器被迫重启
- 现象：18:30:47 verifier（T-12 验收）清理 demo runtime 时跑 `pkill -x -P 1`；`systemd --user` 是本用户唯一父进程为 1 的进程，被杀后整个 GNOME 会话注销，GDM 连续 22 次起不来（drmSetMaster 失败），机器停在文字控制台，22:28 被 Ctrl+Alt+Del 重启。
- 根因：「不用 pkill -f」只禁了一种写法，模型换个参数就绕过；规则靠模型自觉。
- 规则：按目标限制而不是按模型限制——任何模型都只能清理沙箱内进程（`scripts/bot-reap` 或 `kill <字面 PID>`），pkill/killall/-P/负数 PID 一律禁止；`.claude/hooks/process_guard.py` 强制执行（CLAUDE.md §5）。2026-11-02 修订：最初的「只许 Opus 杀进程」让 auto mode 分类器连测试脚本 kill 自己的子进程都拦，开发停摆。

2026-11-02 L-4 终审 13 发现全在范围外（app/ui 的 P4 代码，审查期间合并进 main 被 finder 扫入工作区）→ mm-review 对「head 漂移期间合并的无关代码」无隔离 → L 档跑在活跃开发期时，报告要按 diff 范围过滤发现再定 verdict；范围外发现按所在 slug 归口不丢弃（转 REVIEW-W1-pre.md）。

2026-11-02 U-18 builder 实测 vitest 5.0.5 teardown 坑 → teardown 会以零参调用 vi.mock 透传的 mock 一次，真 fs.rename 收到 undefined 抛 TypeError 污染已过的测试——测试里 mock fs 原语时在 mock 函数内对无参调用返回 undefined 并注释，别依赖 teardown 顺序。
