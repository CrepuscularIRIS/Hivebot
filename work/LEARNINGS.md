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

2026-11-02 PLAN 决策 2 定「第 2 级集成 dsh client」，依据只是 spike 静态构建能过，到 W2 U-21 才发现 renderer 根本 boot 不起来（boot 依赖服务端注入，ClientSessions 需要的 remote 超出白名单），只能追认改为自写 → spike 验的是「能构建」，不是「在目标宿主里能跑」→ 以后凡是集成决策，spike 验收都必须包含「在目标宿主里实际 boot 并走通一条旅程」；只验构建的，结论标为「未实证」。

2026-11-02 U-18 builder 实测 vitest 5.0.5 teardown 坑 → teardown 会以零参调用 vi.mock 透传的 mock 一次，真 fs.rename 收到 undefined 抛 TypeError 污染已过的测试——测试里 mock fs 原语时在 mock 函数内对无参调用返回 undefined 并注释，别依赖 teardown 顺序。

2026-11-02 verifier 把 VERIFY-U-21.md 写在 worktree 的 work/ 下，worktree remove 时随树丢失（GU 席无法独立核对）→ 派发提示词必须写明「报告一律写主仓 /home/lingxufeng/bot/work/...，绝不写 worktree 内的 work/」；主会话合并前应确认 VERIFY 文件已在主仓出现，再 worktree remove。

2026-11-02 U-23 与 U-25 各自验证绿，合并后名字接缝断（wrapper 名 ≠ entry.name，market.spec main 上 2 红）——GU 前没人跑过合并后全量 → 两分支改动有交叠域（哪怕文件级零交集）时，合并后立即 main 全量回归是派 GU 前的硬闸门，不靠评审席读代码代跑。

2026-11-02 主会话自查发现 PLAN status 列失修（U-00~U-26 全部 done 但显示 todo）+ 3 个 stale worktree + 2 个问题标题未更新 → 根因：builder 自行合并（如 U-15）或 merge 后只记 LOG 没同步 PLAN → 每次合并 commit 后立即 sed 更新 PLAN status 列并 git add work/ 一起提交；worktree remove 是合并的第五步，不能省。

2026-11-02 用户指令「每完成一个 change 都回测一下」→ 每次合并进 main 后，立即在主仓跑该变更所在包的全量测试（app/ui → build+单测+e2e；app/sdk → pnpm test），绿了才算合并完成。跳过这步的合并是不完整的——U-23×U-25 接缝就是这么漏掉的（两分支各自绿，合并后红）。

2026-11-02 R9 修凭证清理时只改了直接目标（sdk-env.ts 给 SDK 子进程的 env 副本），没查同链路其他注入点——launch.ts:33 仍 `...process.env` 把真实凭证 spread 进被测 Electron，L-6 定为 O4（踩 §4「凭证不进容器」字面）→ 修「环境注入」类问题先 grep 所有 env 构造点（`...process.env` / `env:`）统一口径，再动其中一处；单点修复对 env 这种横向铺开的面天然不完整。

2026-11-03 R5 探针跑着的时候主会话 `git add work/` 把 evidence 里的 handoff/launch-token 与 runtime/.credentials.yaml 带进了 commit（均为死 token/mock grant、纯本地仓未 push，已 d9f8659 清除+gitignore）→ agent 在写 evidence 的窗口期，主会话整目录 add 会捞进运行时产物 → ①`git add work/` 前必看 `git status --short` 有无 evidence 下的 handoff/runtime/lock；②.gitignore 已加 work/*/evidence/**/handoff、runtime、*.lock，新探针任务派发提示词写明「evidence 只放报告+脚本+frames，运行时目录用后即删」；③若未来加 remote，先历史清理（LEARNINGS 顶部记录此事故）。

2026-11-03 P5-15（断言锁 main 现值）与 P5-11（改掉该值）各自绿、合并后 A1 红——但 P5-15 报告当时就立了 f1「排 P5-11 后回修+改断言」，预判生效、损失仅一轮回归 → 「断言现值」型任务必须在报告里列出**谁会改这个值**（依赖任务 id），合并顺序对上时立即触发 .f，不必等红；两分支合并窗口重叠时第二个合并前先跑受影响 spec 单文件。

2026-11-03 verifier 发现 run-e2e.sh 不重建 dist：改源码后直接 pnpm test:e2e 会跑旧 build 得假绿（P5-11.f1 抽验头两次摘属性即假绿，重建后才红）→ 派发提示词凡改 renderer/main 源码的任务必须显式「先 pnpm build 再跑 e2e」；后续可给 run-e2e.sh 加 dist 新鲜度检查（mtime 对比，旧则拒绝或警告）——立小任务。

2026-11-03 RE agent 把工作目录建在 /tmp/grok-r3-*（不在 bot 沙箱清单），残留 4 个 server 进程 bot-reap/hook 都拒收 → 给 RE/verifier 的派发提示词统一要求临时目录用 /tmp/bot-<任务> 前缀（沙箱清单内），否则清理只能交用户手工。

2026-11-03 P5-02（基点在 P5-01.f1 之前）也改了 sandbox-hardened.test.ts，主会话按文件清单 checkout 合并时把 .f1 的布局分叉修复整个盖掉、main 复红——清单 checkout 不是合并 → 合并任何分支前先 `git diff <base>..<head> --name-only` 与「合并窗口内该文件已被别的 commit 改过」对一遍，命中就 git merge-file 三方合并（base=分支基点）或让分支先 rebase；.f 修复尤其容易成为受害者。

2026-11-03 P5-03 builder 实测 fake 插件坑：cursors 按会话持内存游标，同会话第二次 writeScriptCalls 覆盖脚本不重置（第二次模型调用按旧游标取新文件条目，拿到纯文本零 tool result）→ e2e 每 turn 用新会话，或一次写全整段脚本；多 turn 工具用例莫名"没调工具"先查这个。

2026-11-03 P5-04.f1 实测：approval.yml insert 行加载顺序不可靠（两种排列 shell-ask 都先注册居 waterfall 外层，guard 收不到 bash exec；此前用例恰好都区分不了顺序）→ 往 pre-execute waterfall 插需要「先于 shell-ask」的插件一律用 cordis prepend（ctx.on(..., true)，vendor/cordis events register unshift），不赌 yaml 行序；凡验收里有「X 在 Y 之前」语义，测试必须能区分顺序（组合差分格），否则是空转。

2026-11-03 P5-06 测试侧五条（builder 实测）：①runtime.ts 硬编码 P2SDK_PROVIDER='mock'，real-provider e2e 必须显式 env 覆盖为 'real'；②委派子会话 id 是裸 uuid 且后台异步，识别须 prompt 标记+日志行边界；③fake 的 toolResults 逐轮累积，断言前按 toolCallId 去重；④ptc worker bootstrap 必须放会话工作区内（/tmp 会被沙箱 --tmpfs 遮掉）；⑤上游 write 有 read-before-write 规则，伪造写用例先满足读前提。

2026-11-03 用户对当前 UI 的反馈：「逆向出来的不是很准，UI 风格不太一样，颜色也好，很多 bot 的动画都不太行」——token 级数值审计（U-27/P5-11~15）逐项都对，但整体观感（色彩氛围、动效节奏、风格）仍明显偏离 → 数值断言防回归可以，**观感对齐必须以「可运行的完整参照」为准**（0.18 重构仓 1:1 移植 + 与 0.78.1 并排跑对照）；「每项都符合规格」不等于「看起来像」。L-UI 路线据此变更（Q-014 落实）。

2026-11-03 L-UI 观感差距根因（BRIEF §12.3，用户「数值对但看起来不对」的教训）：①组件来自 dsh 骨架只换 token——哪个面用哪个 token 是推断的；②审计按差异项逐条列，整屏构件形态（composer 药丸、40px 圆钮、选中态）从没进过清单；③**bot 头像原版是带状态动画的 SVG 角色、我们是首字母圆——头像内容从未被审计**，盒模型审计量不出这个；④原版动效 JS 驱动，CSS 断言测不到；⑤三个来源（0.18/0.78.1/dsh）混用；⑥半透明 token 颜色取决于底层。规则：观感对齐必须有「可运行的完整参照」（0.18 整树移植 + 对照台并排），逐项规格只防回归。

2026-11-03 P5-25×P5-21 事故：git stash 栈（refs/stash）跨 worktree 共享，两 builder 在重叠窗口各自 stash、后 pop 者拿到对方栈顶双向串位（13:02 已恢复+备份 /tmp/bot-p5-25-stash-mixup/）→ **多 worktree 并行期间一律禁用 git stash**；临时收起改动用 `git diff > /tmp/<任务>.patch` + `git checkout --`，恢复 `git apply`；builder 派发提示词加入此条。

## 又一次整树 checkout（P6-22 r2 合并，2026-11-05，第三次同类事故）
- 现象：`git checkout feat/P6-22 -- .` 把分支基点（ae41ce7）以来 main 的 P6-26/26t 安全改动全部回退；事后补救第一刀「M 文件一律恢复 main 版」又把 P6-22 自己的 DESCRIPTION 文案冲掉。最终以 ae41ce7 为 base 逐文件 `git apply --3way` 修复（b138aad）。
- 规则（升级 SKILL §7.3 为硬性）：合并一律 `git merge --no-ff`（真三方），清单 checkout 仅限「与 main 无共同改动文件」且交集检查为空；**修复回退时同样禁止一刀切**——M 文件里混着「基点旧导致的假差异」和「分支真实增量」，必须 `git diff <merge-base>..<branch> -- <file> | git apply --3way` 逐文件分辨。

## （记账恢复 2026-11-05 07:4x）以下条目在 P6-22 合并事故中被整树 checkout 抹掉，按上下文重录；原文措辞可能略有出入
- e2e 里 SDK 数据目录与 UI main 数据目录分裂：挂 orch 插件的测试必须显式 P2SDK_ORCH_DATA_DIR 并预写 {"version":1} 骨架（P6-17.f1）。
- 裸 sh scripts/run-e2e.sh 会被 miniconda 旧版 playwright 截胡（unknown command 'test'）——一律 pnpm -C app/ui test:e2e。
- 测试的桌面通知没隔离：Xvfb 只挡窗口不挡 DBus；run-e2e.sh Xvfb 分支已加死总线守卫（P6-18）。
- 竞态/绕过类 review 派 Sol 可能被其服务商内容策略拦截——改用确定性测试接缝表述，或改派 Opus（fable）。
- 短时限速 ≠ 长封：429 retry-after 很短或主会话直探 200 = 多消费者并发限速——真模型评测独占 GLM，采集器短 429 有界退避。
- GLM 限流期 builder/drafter 改派 Sol（用户 2026-11-04）；Opus 限流期 director/judge 席 A/frontend-dev/ux 席 A 亦改派 Sol（用户 2026-11-05），panel 注明代席，续跑中的先 TaskStop 再换发。
- /tmp/p2sdk-handoff-* 累积泄漏（launchRuntime 不自清）→ P5-64。
- **work/ 记账文件（PLAN/QUESTIONS/LEARNINGS）的修改此前从未提交，全靠工作区存活——本次事故一次全损。规则：每次合并 commit 一并 `git add work/<slug>/PLAN.md work/QUESTIONS.md work/LEARNINGS.md work/LOG.md work/<slug>/LOG.md`；tick 结束时对当日有改动的记账文件做一次 docs(work) 提交。**
