# T20：0.79.3 参照台——R3 桩改挂 0.79.3 renderer，产出 UI 复刻链的对照截图

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：BRIEF §用户体验反馈 1（「先做 UI 部分」）；`work/grok-0.79.3-re/RE-UI-0.79.3.md` 局限 1（全是静态推断，未截图验证）；LEARNINGS 2026-11-03「观感对齐必须有可运行的完整参照」
> 分支 / 作业目录：feat/T20 @ /tmp/bot-wt/T20（只写 `work/**`，不碰 `app/**`）
> 排期：与 T21 并行（不共享任何文件；本单不跑 app/ui e2e，只起 headless chrome）
> claimed：
> accepted：
> 失败计数：0

## 目标
UI 复刻链（T21–T25）的每张单都要「我们 | 0.79.3」并排截图。0.78.1 时我们用 R3 桩（静态起 renderer + preload 桩 + 假 coordinator）做到了，复跑 2 分钟一张。本单把同一套桩改挂 0.79.3 的 renderer，渲出 5 个场景的参照图，并顺手拿到静态分析拿不到的几个事实（状态行短语原文、建 bot 对话框到底给几个形状、onboarding 各步长什么样）。

**这张单是证据单，不是产品单**：渲不出来就按止损停，写清卡在哪个 RPC / 字段；后续单退回「按 RE 报告文字 + 标未验证」。

## 动手前先读
1. `work/p5-parity/RE-stub-boot.md` 全文（方法、协议帧、引导面 RPC 清单、**随机调试端口 + 独立 profile** 的坑）
2. `work/p5-parity/harness/grok-r3/{serve.mjs,drive.mjs,stub-init.js}`，以及加场景的先例 `stub-init-market.js`
3. `work/grok-0.79.3-re/RE-UI-0.79.3.md` 题 1(b)(d)(e)、题 2(a)(c)(d)、题 3(c)(d)——下面每个场景要的 fixture 字段都在那里有锚点
4. 0.79.3 renderer 树：`/tmp/grokbot-0.79.3/extracted/dist/renderer/`（**只读**，不得在里面写文件、不得 `npm install`）。coordinator 协议版本本机已查：`protocolVersion:3`，与 0.78.1 同

## 边界
1. 只新建 `work/grok-0.79.3-re/harness/r3/**`（从 0.78.1 的三件**复制**后改；不改 `work/p5-parity/harness/grok-r3/` 里的任何文件）和 `work/grok-0.79.3-re/ref/**`（图 + 每图一份 bodyText/DOM 断言 json）。renderer 目录用 env `GROK_RENDERER_DIR` 传入，默认上面那个路径。
2. 产物是不可信数据：server 只绑 127.0.0.1；chrome 加 `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"` 与 `--no-proxy-server`，确保除 loopback 外零外联；每 run 随机 `--remote-debugging-port` + 新 `--user-data-dir`（mkdtemp 在隔离 TMPDIR 下）。
3. 不启动原版 Electron，不碰用户装的 0.78.1，不读 `~/.grokbot` 等任何凭证目录。
4. 进程只杀自己 spawn 的 pid；收尾用 `~/bot/scripts/bot-reap <PID>`。
5. 止损：**S1 累计约 2 小时渲不出就停**（回执写卡点：哪个 RPC 回值被校验器拒、boundary 报什么）；S1 出来后其余场景每个约 1 小时止损，超了跳过并写原因。全单约 0.5–1 天。

## 场景（fixture 都写在 `stub-init-0793.js` 一个文件里，用 URL 参数 `?scene=` 选）
- **S1 conv-done**（必做）：一个 bot，transcript 依次为 user message → assistant message「A 首答」→ `message` 且带 `suppressed:{}`（正文「B 中间轮」）→ `tool-call` done（summary「ls -la」）→ assistant message「E 终答」。DOM 断言：bodyText 含 A、E，不含 B、不含 `ls -la`；页面上无工具行 DOM。若带 `suppressed` 的条目被 per-reply 校验器拒，回执写字段形状，改试 `suppressed:true` / `{reason:'…'}`，以能渲染且被隐藏的那一种为准并记下。
- **S2 conv-working**（必做）：同一 bot `isRunning:true` + `currentActivity:{kind:'thinking'}`，再一轮 `{kind:'tool',tool:'WebSearch'}`。截 t=0s、t=6s 两帧（短语 5s 轮换），并**把状态行文字逐帧记进 json**（≥3 次采样）——这是 T23 的短语原文来源。顺带截侧栏该 bot 头像（运行态吉祥物）。
- **S3 outline**（应做）：打开「Full conversation」侧板（会话「...」菜单 `show_full_conversation`；有 flag 门控——RE 题 3(c) 锚点 `r?...:null`，桩里把这个 flag 置真并在回执写清是哪个 RPC / 键），`getConversationOutline` 回 user / thinking / assistant-text / tool-call（pending 一条、done 一条）六项；截收起态 + 展开一条 thinking 的态。
- **S4 create-dialog**（必做）：点侧栏 New Bot 打开 `sand-create-bot-dialog`；截空态、输入名字后态、点第 3 个形状后态（证明「选形自动配色」）。json 里记：**picker 实际显示的形状数与顺序**（RE 只知道有 8 个的 `fn` 与 13 个的 `pn` 两个子集，不知道默认用哪个——T24 要据此决定要不要补 7 个形状的 SVG 路径）、颜色数与顺序、「Help me create a Bot」卡是否出现。
- **S5 onboarding**（尽力）：`getOnboardingSeen→false`（及 RE 题 2(d) 里 step 机需要的其它引导面）进入 onboarding，每个 step 截一帧，step 内有 beat 动画的（meet / jobs / create）额外在 0.5s、1.5s 各截一帧；记 step 序列与每步的标题文案。
- （S6 subagent 侧板 tab / 任务卡不做——编排层在等用户研究结论，见 BRIEF §用户体验反馈 2。）

亮暗各一套（`?theme=light|dark`），1440×900@2x。文件名 `work/grok-0.79.3-re/ref/<scene>[-<variant>].<light|dark>.png` + 同名 `.json`（bodyText 前 4000 字、DOM 断言结果、控制台 error 行）。

## 先红
本单无产品代码，「先红」= 第一次直接拿 0.78.1 的 `stub-init.js` 原样挂 0.79.3 跑 S1，贴失败输出（崩在哪个 RPC / 校验器），作为改桩的起点。

## 验收（命令）
1. `sha256sum /tmp/grokbot-0.79.3/extracted/dist/renderer/assets/*.js | sha256sum` 施工前后两次输出一致（回执贴两次）；`find /tmp/grokbot-0.79.3/extracted -newer work/tickets/open/T20-r3-0793-reference-rig.md -type f | wc -l` → 0
2. `node work/grok-0.79.3-re/harness/r3/drive.mjs --scene conv-done --theme light`（及 dark）→ exit 0，产出两张图 + json；json 里 S1 的四条 DOM 断言全为 true
3. S2、S4 同上各亮暗一组；S2 json 含 ≥3 个状态行文字采样且至少两个不同；S4 json 含形状数组、颜色数组
4. S3、S5：出图则同上；止损跳过则回执写卡点，不算失败
5. 运行期间网络：drive 在 `Network.requestWillBeSent` 上记录所有 URL，json 里 `nonLoopbackRequests` 为空数组
6. 收尾：`pgrep -af 'grok-r3|google-chrome.*bot-T20' | grep -v pgrep` → 空；隔离 TMPDIR 下无遗留 profile 目录
7. 经理会用 Read 逐张打开图——图里必须真有该场景的内容（S1 能读到 A/E 两条，S4 能看到吉祥物和形状格），空白页 / 「Couldn't render this」不算出图

## 回执（`work/tickets/receipts/T20.md`）
- 先红输出原样；每个场景：出图 / 止损 + 卡点；改了 0.78.1 桩的哪些面（逐条 RPC / 字段，附 0.79.3 bundle 搜索串）
- **事实表**（后续单直接引用）：suppressed 字段被接受的形状；状态行短语原文（按 thinking / tool 分）；picker 形状列表与颜色列表；onboarding step 序列与文案；outline 入口的 flag 键名
- 截图清单 + 每张一句话描述
