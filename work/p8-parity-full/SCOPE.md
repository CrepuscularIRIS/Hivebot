# SCOPE · p8-parity-full（立项前范围账，不是 BRIEF）

v1 · 2026-11-05 · director（Opus 5.5）
用户方向（LOG 06:41）：「接下来是1比1复刻grok bot逆向的所有功能. 例如grok bot可以开放电脑. 所以后续要远程集成测试了」
输入：`work/p1-re/RE-COVERAGE.md`（下称 COV）全表、第一波 RE 六份（`p5-parity/RE-{question-card,connector-grant,market-detail}.md`、`p6-orchestration/RE-{outline-tasks,cross-session}.md`、`p6-orchestration/reuse/r06-host-tools.md`）、`p7-admin/BRIEF.md` v2.1、`p7-admin/RE-admin-078.md`、`LEARNINGS.md`、`QUESTIONS.md` Q-023。本次对 `/dev/shm/grok-re/0.78.1/app/dist/` 做了只读字符串探查（锚点见 §2.2），对 `repos/deepseek-harness` 做了目录与 README 级查看。没有派 agent，没有改代码。

## 0. 结论先行

1. **153 个缺口面（未逆 97 + 部分 56）聚成 16 簇**，6 个主题（§1）。其中 **22 面已被第一波 RE 覆盖**（R-01/02/04/05/06/10 已回报），只是 COV 状态列没回写；真实缺口是 131 面。
2. **COV 对「电脑」的定性需要更正**：COV 把 computer 全部记为「非目标（云 box）」（P30、D15、M4、R-31「不建议派」）。本次探查发现 **0.78.1 有完整的本机 computer use**：daemon 里 14 个 `computer_*` 工具、本机 CU 闸门文件、应用白名单 + 限速、「终端类应用 = 可执行 shell」分类、macOS sidecar 宿主，设置里有 your-computer / manage-devices / computer-use / bot-computer 四节（§2.2）。这些**不在 COV 的 198 行里**，本账提议补 8 行（N1–N8）。
3. **「开放电脑」在原版是三层**，和我们的基线方向相反（§2.1）：原版 bot 默认跑在**它自己的云电脑**上，用户再把**本机**开放给它；我们的 bot 本来就跑在本机 dsh 沙箱里。所以第①层（本机执行开关）对我们是 UI 对齐问题，**真正的新能力是第②层（GUI 操控）和多机路由**。
4. **上游已经有现成件**（搬运阶梯第 1 级）：dsh 自带 `computer-use`（单 provider 注册表）、`browser-use`（experimental provider：Playwright MCP / Chrome DevTools MCP / Stagehand）、`ssh`（fs-ssh / sandbox-ssh / subprocess-ssh）三族；`dsh-computer-use`、`dsh-cua`、`dsh-cua-bundle` 0.2.2-alpha.2 **已装**在 `app/sdk/node_modules/.pnpm`。缺口是 **cua-bundle 只支持 macOS（Windows 开发中），没有 Linux provider**，本机是 X11（`XDG_SESSION_TYPE=x11`），有 `Xvfb`、`xdotool`、`tailscale`、`ssh`，没有 docker / podman / qemu。
5. **computer use 相关面：COV 内 11 面（未逆 8 + 部分 3）+ 本账新增 8 面 = 19 面**。远程集成测试的直接依赖：CU 簇全部 + 多机路由（N7）+ 浏览器（N8）。
6. **按字面「全部」估算约 117–183 个任务单元**（≈ p5+p6 合计 107 行的 1.1–1.7 倍）。其中约 40 面依赖 xAI 云、多人后端或付费外部服务，私用场景下做不出可用的 1:1，建议分档（§6 U-1）。
7. **第一批建议**（§7）：T-05 回写 COV、T-01 逆本机 CU 全链、T-20~T-24 五个 scout 并行、T-31 CU 护栏 panel 题干起草。**CU 任何 builder 任务在 T-31 panel 通过、T-30 用户签字前不开工。**

## 1. 聚类账（153 面全部归簇，每面只归一簇）

计数口径：COV §2.1–§2.8 行，`grep` 复核未逆 97、部分 56。「依赖」列：**电** = 属于「开放电脑」，**远** = 远程集成测试的直接依赖，p7 = 归 p7。

| # | 主题 / 簇 | 未逆 | 部分 | 合计 | 代表条目 | 依赖 | 建议归属 |
|---|---|---|---|---|---|---|---|
| 0 | **第一波 RE 已回报、待回写** | 7 | 15 | 22 | S3/S7/D3 提问卡（R-01）；S28/D4/K9/A14 connector-grant（R-02）；P15–P18/D10/M1 市场（R-04）；P9/P10/E5/D1/D14 outline 与任务（R-05）；D2/K8 跨线程（R-10）；A4/H6 host 源码（R-06） | — | p8 只核对实现，RE 不再派 |
| 1 | **开放电脑：本机执行 / GUI 操控 / bot 自己的电脑 / 浏览器** | 8 | 3 | 11 | P30 computer overlay + VNC；D15 computer(5)；D16 teach(3)；E15 desktop-goal；A5 本地工具执行语义；D21 getHostStatus；S31 cookie-origin-approval；K14 SandBox 55；M4 窗口/computer/box/tailnet；T3 设置 computer 节；A6 /local-exec 反向通道 | 电 远 | **p8 主线**（另加 §2.2 N1–N8） |
| 2 | 审批 / 秘钥类卡 | 5 | 3 | 8 | S5 secret-request；S6 credential-request；S26 auto-review-approval；S27 meeting-join-consent；S32 publish-approval；S33 app-secrets-request；T4 permissions 节；A9 tree-sitter | 电（S6、T4 与 CU 审批共用） | p8 |
| 3 | 连接器 / 集成卡 | 10 | 0 | 10 | S15/S16 connector(s)；S17 listener-connect；S18 scm-connect；S19 onepassword-connect；S20 notifications-enable；S21 appearance-picker；S24 slack-connect；D8 listeners；T2 integrations 节 | — | p8 |
| 4 | 会话流卡片保真 | 11 | 9 | 20 | C2 message 分支；C3 notice；C4 mcp-app；C5/S2 附件；C6 feedback；S4 cursor-agent；S13 visualization（d3 277K + three 679K）；S25 bot-template-share；E1–E3/E6/E14 event 卡；D12 mcp_apps；W2/W3/W6/H4 wire 对照 | — | p8 |
| 5a | 外壳 / 设置 / composer / 浮层 | 8 | 12 | 20 | P2 onboarding；P7 ChatHeader；P8 composer；P11–P13 info-pane（含 **computer tab**）+ avatar-editor；P19 设置壳；P20 命令面板；P21 全局浮层；P22 popout；P36 markdown；T1 general；T7 updates；D17 trays；M2/M3/M5/M12；K12；A8 | P12 computer tab → 电 | p8 |
| 5b | 视觉 / i18n / 动画 / 对照基础 | 0 | 7 | 7 | V6 bot mark 动画引擎；V7 i18n 3,880 条；V4 图标；V9 stylex 映射；M15 gate；A12 通知音；H3 组件级对照 | — | p8（收益覆盖所有 UI） |
| 6 | 自动化 / routines / workflows | 2 | 2 | 4 | E4 automation-changed；D9 workflows(7)；D20 automations(13)；K7 webhook | — | **p7**（J2-b、L4） |
| 7 | 记忆 | 0 | 2 | 2 | M16 记忆方法族；K6 GrokBot 记忆 | — | 待 D-MEM（p7 §8 写了「长期记忆不做」） |
| 8a | 群聊 Room | 5 | 1 | 6 | K5 Room；E9–E13 person-* / bot-* 事件 | — | p8 |
| 8b | 团队 / 分享 / 模板市场 | 10 | 2 | 12 | S23 team-access；E7 team-shared（87.5K）；E8 team-bot-publish；P23–P26 模板与团队 overlay；P34 邀请分享；D22 sharing；M8；K10；K11 | — | 待 U-1（多人后端） |
| 9a | 草稿 / 邮件 / 消息 / 移动设备 | 9 | 0 | 9 | S8–S12 email/slack/meeting/imessage 草稿、calendar-event；S22 email-offer；M10 email + messages/phone；A7 messages-worker（mac 专属）；S34 mobile-tool-permission | 远（外发动作） | 待 U-1 |
| 9b | 语音 / 电话 | 5 | 0 | 5 | C7 voice-call；S35 phone-call；P31 voice 浮层；D13 media；M11 语音 / 听写 | — | 待 U-1 |
| 9c | Slack / Teams 渠道 | 2 | 0 | 2 | P27 slack/teams overlay；D18 channels | — | 待 U-1 |
| 10 | Library / canvas / 文档 / places | 4 | 0 | 4 | P32 document-page 229K；P33 places-stage 122K；D6 searchMedia；M14 | — | p8（先 S 级盘点） |
| 11 | 计费 / vault / 1P / passkey / 支付 | 10 | 0 | 10 | S30 virtual-card；P28 passkey；P29 billing/top-up/checkout；P35 vault dialog；T5 vault；T6 usage；D19 secrets；M7；M9；A15 | 电（vault 与浏览器凭证共用） | 待 U-1（计费不可做；vault 与 CLAUDE.md §4 冲突） |
| 12 | Cursor 云 agent | 1 | 0 | 1 | D7 cloud_agents(13) | — | 不做（无后端） |
| | **合计** | **97** | **56** | **153** | | | |

COV 边界外 6 行（K13、A17、A19–A21、W7）不在本账：A19–A21 已由 R-06 读 G18 源码覆盖，A17/W7/K13 属云 box 网关，按 §2.1 第③层的重释处理。

## 2. 开放电脑：原版到底有什么（本次探查，COV 漏项）

### 2.1 三层语义

| 层 | 原版含义（证据） | 我们的现状 | p8 要做的 |
|---|---|---|---|
| ① 本机执行开关 | bot 默认在**它自己的电脑**上干活；用户可以开放本机：「Allow Grok Bot to run tasks on this computer, not only on its own computer」（APP i18n `Hd1KB+`）、「Grok Bot can run commands on your computer」（`0dyBiF`）、「Execution on this computer, {name}」（`8bwi7d`） | bot 本来就在本机 dsh 沙箱里跑（P5/P6 审批档位、P6-25/26 写边界） | 设置 computer 节与开关的 UI 对齐；语义上是「已经开放」，开关映射到我们的沙箱 / 档位 |
| ② 本机 GUI 操控（computer use） | daemon 14 个 `computer_*` 工具 + 应用白名单 + 限速 + 终端类应用分类，macOS 走 sidecar（§2.2 N1–N6） | **没有** | 新能力，最高风险（§4） |
| ③ bot 自己的电脑 | 云 box：VNC 桌面、desktop-mount、box-desktop-modal、teach recording、desktop-goal 事件（COV P30/D15/D16/E15/K14） | 没有，也没有云 | **重释**：bot 自己的电脑 = 本机上一块隔离的虚拟屏（Xvfb），用户可以看、可以接管。它同时就是远程集成测试的目标机（§5） |
| 多机 | 「Routing through another of your computers. Send a message from this computer to route through it instead.」（`1Pw5TN`）、「Rename this computer」（`F2CnOC`）、`ListMachines` 工具、tailnet 状态机（MAIN 约 100 处） | 没有 | 对应 dsh `ssh` 族；与远程集成测试同一件事 |

### 2.2 提议补进 COV 的 8 行（T-05 落表，T-01/T-02/T-04 深挖）

锚点格式 `文件@字节偏移`；`DAEMON`=`local-exec-daemon/main.cjs`，`MAIN`=`electron-main/main-app.cjs`，`COORD`=`node-agent-coordinator/main.cjs`，`APP`=`renderer/assets/index.eager-app-iGTgHP_Q.js`。

| # | 面 | 证据 | 状态 |
|---|---|---|---|
| N1 | 本机 CU 工具 14 个：screenshot / click / move / drag / type / key / scroll / wait / check_permissions / apps / resolve_app / app_state / set_value / app_action；每个工具带作用域 `app` / `free` / `resolve` | DAEMON@2119898（列表）、@2120174（`SI` 作用域表） | 未逆（只有名字和作用域） |
| N2 | 本机 CU 闸门 + 应用白名单 + 限速，默认 `{isEnabled:false, allowedApps:[], minIntervalMs:5000, maxPerWindow:10, windowMs:300000}`；闸门文件 `local-computer-use-gate.json` | DAEMON@2061000（默认值）、@1994607（文件名）；MAIN@1426894（RPC schema）；COORD@978640 | 部分（默认值已知，判定流程未逆） |
| N3 | 应用危险分类 `oJt`：`runsShellCommands`（Terminal、iTerm、Warp、kitty、Alacritty、WezTerm、Ghostty、Hyper）、`runsScripts`… | DAEMON@~2120400 | 部分（只看到开头，全表与用途未逆） |
| N4 | CU sidecar 宿主：「Cursor Computer Use」/`CUCursorService`，protocolMajor 1，调用超时 45s，启动就绪 8s；sidecar 从 `downloads.cursor.com/computer-use-sidecar/releases/…/<sha40>.json` 下载并校验 | DAEMON@2868977；MAIN@1672300 | 部分（macOS 闭源二进制，Linux 不适用；只借协议形状） |
| N5 | CU 权限 UI：`computerUsePermissions` store（grants / helperName / watch / refresh / openSettings）、`computer-use-allowed-apps`；Screen Recording + Accessibility 引导文案；设置四节 your-computer / manage-devices / computer-use / bot-computer | APP@464233–464605、@3996780；i18n `KNLII8`/`bPHX4U`/`tFV1bd`；COORD@971418 | 未逆 |
| N6 | computerUse 子 agent 与模型：`subagentType==='computerUse'` 的运行中行显示「On its computer」（device-desktop 图标）；设置项 `computerUseModel` | APP@1060365、@2605780；DAEMON@2061199、@2075748 | 未逆 |
| N7 | 多机：ListMachines、本机改名、经另一台电脑路由、tailnet 状态（waiting_for_approval / tailnet_locked / joining）、「Can't reach your computer」「Connecting to your computer…」 | COORD@938042；MAIN@14624、@1787229；i18n `Wb92Ws`/`afTcdw`/`1Pw5TN`/`F2CnOC` | 未逆 |
| N8 | 浏览器：从本机 Chrome 复制 cookie（「Copies cookies from Chrome on your computer so the Bot can use sites you're already signed into」）、cookie-origin 审批卡、BrowserSecureFill、sand-playwright-runtime、preload-webview | i18n `/348Id`；COV S31、§2.9 R-26 | 未逆 |

另：box 侧 proto 里有 `native_x11` / `xdotool` 两种驱动枚举（DAEMON@2852083，`computer_use.session.*` 指标），说明原版云电脑本身就是 Linux X11 + xdotool。这和我们本机条件（X11、已装 xdotool、Xvfb）一致，是 §2.1 第③层「本机隔离屏」路线的旁证，**待 T-03 核实**。

## 3. 与 p7 的边界

| 面 | p7 已覆盖（不重复） | p8 只做 |
|---|---|---|
| routines / automations / workflows（簇 6） | J2-b 定时链、L4、routines UI（G18 移植） | info-pane routines tab 的外观对齐（P12 的一个 tab），和 automation-changed 卡的外观（E4），不碰调度语义 |
| 管理四项：建 / 改 / 删 bot、装 / 卸插件、自重启 | 7a-M M1–M8（执行器、溯源、可回退、审计） | 无。市场 UI 在簇 0（R-04 已回报） |
| 技能 | 7b B2 技能生命周期；D10 skills 9 方法的语义 | 市场里 skills tab 的外观（随簇 0 核对） |
| 回合来源与授权（D-1 / H1） | p7 定 | **p8 的 CU、浏览器、外发工具全部继承 D-1**：非人类回合里是否可见，按 D-1 结果；H1 溯源检查扩到「操作哪个应用 / 哪个网站 / 发给谁」 |
| 操作记录 / 审计 | p7 建一个 jsonl | CU 每个动作入同一份记录（复用，不另建） |
| 远端 / 云 worker | **p7 §8 非目标** | p8 的「远程」是**执行目标**（bot 操作另一台机器 / 一块隔离屏），不是 worker 宿主；若 T-22 显示 dsh-ssh 会把 worker 整体搬到远端，要回 p7 改非目标行，列为 D 题 |
| 长期记忆 | **p7 §8 非目标** | 簇 7 的记忆 UI 是否对齐，待 D-MEM |

**p8 独有面**：簇 1（开放电脑，含 N1–N8）、2、3、4、5a、5b、8a、10；以及 U-1 定档后的 8b、9a–9c、11。

## 4. 风险分级

| 级 | 面 | 为什么 | 前置闸门 |
|---|---|---|---|
| **R0** | **GUI 操控用户桌面**（N1–N3、P30）：键鼠注入、截图 | ①注入到真桌面 `:0` 就是以用户身份做任何事，用户有过桌面会话被注销的事故（CLAUDE.md §5），e2e 窗口弹主屏已发生三次（LEARNINGS 11-04）；②截图把屏幕上的私信、凭证、验证码送进模型，与 CLAUDE.md §4「凭证不进模型」冲突；③终端类应用 = 免卡 shell，原版自己都专门分类（N3），P6-26t 的 `run_code` 漏配是同一类洞 | **T-31 panel D 通过 + T-30 用户 C2 签字前，任何 CU builder 任务不开工**。这是放宽，不是收紧，Q-023「纯收紧先做后告知」的先例**不适用**，顺序反过来 |
| **R0** | **浏览器凭证**（N8、S6、S31、簇 11 vault / 1P）：复制 Chrome cookie、自动填密码 | 直接违反 CLAUDE.md §4「凭证不进模型，也不进容器」与「不读 `~/.grokbot` 等凭证文件」；cookie 一旦进隔离浏览器就等于把用户已登录的所有站点交给 bot | 默认**不做 cookie 复制与密码代填**；做的话单独 D 题 + 用户 C2，引用户原话授权 |
| **R1** | **远程 / 多机执行**（N7、A5、A6、dsh ssh 族） | ssh 私钥与 tailnet 授权是凭证；`process_guard` hook 只管本机，远端没有同等护栏；远端机若是用户的另一台真电脑，R0 的问题全部复制一遍 | T-22、T-24 回来后定形态；远端护栏与本机同级才开工 |
| **R1** | **对外动作**（9a 邮件 / 消息发送、9b 电话、9c Slack、8b 分享、11 支付） | LEARNINGS 11-02：「花钱 / 对外动作」是用户三类必问之一 | 按簇在 U-1 后逐项问 |
| R2 | 审批类卡（簇 2）、连接器卡（簇 3） | 改审批面，但有 P5/P6 的档位底座和对抗探针惯例 | 常规 verifier + review A/C 方向 |
| R3 | 外观保真（簇 0、4、5a、5b、10） | 只影响观感；风险是「数值对、看起来不对」（LEARNINGS 11-03） | 对照台并排 + `/panel GU` |

**CU 护栏草案**（T-31 的题干素材，panel 前不算定案）：
- G1 **默认目标 = bot 自己的隔离屏**（应用启动的 Xvfb `:N`，用户在窗口里看、可接管）；真桌面 `:0` 的可达性由执行器里的 DISPLAY 白名单（代码常量）决定，默认不可达。
- G2 应用白名单 + 限速，默认值照抄原版 N2（关、空白名单、5s 间隔、5 分钟 10 次）。
- G3 终端 / 脚本类应用 = shell 等价，落 bash 档（原版 N3）；`computer_*` 每个工具在 tiers 里显式落档，不许落 `default`（LEARNINGS 11-05 P6-25.f1 第②条）。
- G4 非人类回合 CU 工具可见性继承 p7 D-1；H1 溯源扩到目标应用 / 网站。
- G5 隔离屏里不登录任何用户真实账号；截图不进永久 transcript，只留哈希与动作记录。
- G6 浏览器只用隔离 profile，不读用户真实 Chrome / Firefox profile。
- G7 一键停 + 接管：UI 按钮与全局快捷键，停后新动作计数为 0。
- G8 每个动作先落操作记录再执行（复用 p7）。
- G9 测试侧：`process_guard` 扩一条，拦截目标为 `:0` 的 `xdotool` / 截图命令；CU 测试一律走 run-e2e.sh 的 Xvfb + 死 DBus。

## 5. 远程集成测试的形态（待查）

谁来扮演远程端，现在没有答案。本机条件：有 `Xvfb`、`xdotool`、`ssh`、`tailscale`；**没有** docker / podman / qemu（装它们要 sudo，agent 不能做，CLAUDE.md §5）。

| 形态 | 做法 | 能验证什么 | 代价 / 前提 | 待查 |
|---|---|---|---|---|
| F1 同机隔离屏 | app 起 Xvfb `:N`，bot 的 CU 工具只打这块屏；Playwright 驱动我们的 Electron（另一块 Xvfb）；verifier 读隔离屏截图核对 | CU 工具全链、护栏 G1–G9、接管 / 一键停 | 零安装；**不算真远程**（同机、同用户） | T-24①：bwrap 沙箱里的 X 客户端能否连到 Xvfb、能否截图 |
| F2 同机 ssh 回环 | ssh 到 localhost 同一用户 | dsh ssh 族协议与远端 fs 语义 | 不隔离，只测协议 | T-22 |
| F3 第二台机器 | tailscale + ssh 到用户另一台机器；远端跑 Xvfb | 多机路由 N7、真网络、真远端护栏 | 需要用户有机器并同意；远端的 R0 风险要先有护栏 | **用户 U-3** |
| F4 本机 VM / 容器 | rootless podman 或 qemu 起带桌面的 Linux | 强隔离的「bot 自己的电脑」，最接近原版 box | 需用户 sudo 安装；机器在跑 GPU 训练，VM 占资源 | T-24②、U-3 |
| F5 云 VM | 云上开一台 | 真远程 | 花钱 → 用户必问 | 仅 F3/F4 都不行时 |

**建议**：F1 作为日常回归（等价于今天的 run-e2e.sh 地位），F3 或 F4 作为「远程集成测试」验收闸门。F1 的隔离屏同时是第③层「bot 自己的电脑」的产品形态，一份投入两处用。

## 6. 范围模式、逆向一问、待用户确认

**范围模式**：分层而不是一刀切。
- **账面 HOLD**：198 + N1–N8 每一行都要有处置（做 / 外观壳 / 不做 + 理由），这是对「全部」的兑现方式。
- **开放电脑 EXPAND**：10 星体验 = bot 有一块自己的屏，你在侧栏里看它点鼠标，随时一键接管或叫停；它做完把证据贴回会话。
- **云依赖面 REDUCE**：簇 8b、9b 电话、9c、11 计费、12 没有后端，做出来只能是不可用的壳。

**CU 路线双方案**：

| 路线 | 做法 | 代价 |
|---|---|---|
| **α 拼 dsh（倾向）** | dsh `computer-use` 注册表 + 自写或搬一个 Linux X11 provider（xdotool + Xvfb）；浏览器走 dsh `browser-use` 的 Playwright MCP provider；远程走 dsh `ssh` 族 | Linux provider 没有现成（cua-bundle 只有 macOS），要搬或写；alpha 版本 |
| β 照原版 sidecar | 复刻 `CUCursorService` sidecar 协议 + 真桌面应用白名单 | sidecar 是 macOS 闭源二进制，Linux 不存在；默认操控真桌面，R0 最大；等于自建 |

倾向 α，放弃 β：β 在 Linux 上没有可搬的东西，且默认目标是真桌面。α 的 Linux provider 是第 3 级搬还是第 5 级自建，由 T-20 / T-23 决定。

**逆向一问**：三个月后 p8 失败，最可能的死因：
1. **198 行全绿，但没有一条旅程能用**：每簇做成只有外观的壳，云依赖面点了没反应。和 L-UI「每项符合规格 ≠ 看起来像」同一个坑。防法：BRIEF 的 DONE 按簇写旅程，不按行数；外观壳必须有明确的不可用态。
2. **CU 在用户真桌面出事**：一次误点、误输入，或测试窗口又弹到主屏。防法：G1 默认隔离屏、G9 hook 级拦截、R0 闸门在开工前。
3. **GLM 额度烧在低价值面上**：团队、计费、Slack 这类私用用不到的面先占了波次。防法：U-1 分档，簇 1 和簇 0 核对排第一。

**待用户确认**（≤3，主会话一次问一个，按这个顺序）：
- **U-2（阻塞 CU）开放电脑操控哪块屏**：A bot 自己的隔离屏（推荐，你在应用里看、可接管）；B 你正在用的真桌面（按应用白名单开放）；C 两者都要，B 晚于 A。
- **U-1（阻塞 8b/9/11 的排期）「所有功能」怎么理解需要云或付费服务的面**：A 本地能做的做实，需要外部服务的接替代后端（邮件走你的邮箱、语音走本地识别），只有 xAI 云才有的（计费、团队多人、电话、虚拟卡、Cursor 云 agent）只登记不做（推荐）；B 全部做外观和不可用态；C 全部做实（需要你提供外部账号与费用）。
- **U-3（阻塞远程验收）远程端由谁扮演**：A 你的第二台机器（本机已装 tailscale）；B 你装 podman 或 qemu，我们起本机 VM；C 先只用同机隔离屏，远程验收以后再说。

## 7. 缺口任务清单（编号供 PLAN 引用）

### 7.1 逆向（→ reverse-engineer；派发统一要求照 COV §3 抬头）

| ID | 簇 | 目标 | 入口 | 量 | 优先 |
|---|---|---|---|---|---|
| **T-01** | 1 | 本机 CU 全链：14 工具参数与返回、作用域判定、闸门文件 schema 与判定流程、白名单与限速的执行点、N3 应用分类全表与用途、sidecar RPC 方法面（只读协议，不跑 sidecar）、N5 权限 UI 与设置四节结构、N6 子 agent 行与 computerUseModel | §2.2 N1–N6 锚点 | M | **1** |
| **T-02** | 1 | 多机与本机执行：ListMachines、本机执行开关、跨机路由、改名、tailnet 状态机、`/local-exec` 反向通道 kind 全表、getHostStatus（并入 COV R-19、R-21） | N7；DAEMON@2349816；COV A5/A6/D21/A9 | L | 2 |
| T-03 | 1 | bot 自己的电脑（只取形状）：computer overlay、desktop-mount、box-desktop-modal、VNC 视图、teach recording、desktop-goal 卡；核实 box 侧 native_x11 / xdotool 驱动（替代 COV R-31「不建议派」） | COV P30/D15/D16/E15；DAEMON@2852083 | M | 2 |
| T-04 | 1 | 浏览器：cookie-origin 卡、cookie 复制流程、BrowserSecureFill、sand-playwright-runtime、preload-webview（COV R-26 + S31） | N8；`preload-webview.cjs` | M | 3 |
| T-07 | 2 | 审批类卡 8 型（COV R-12c） | COV §2.1 | M | 3 |
| T-08 | 3 | 连接器类卡 10 型 + listeners 域（COV R-12a） | COV §2.1 | M | 4 |
| T-09 | 4 | 卡片保真：R-12f、R-12d、R-12g、R-11 合派两次 | COV §2.1、§2.7 | M | 4 |
| T-10 | 5a | 外壳设置：R-03 + R-23（含 computer 节，与 T-01 共享）一次；R-15 + R-16 + R-17 + R-18 一次 | COV §3 | M×2 | 3 |
| T-11 | 5b | R-14、R-33（先）；R-13、R-34、R-36、R-22、R-32（后） | COV §3 | S–M | 2（R-33 先行，所有 UI 受益） |
| T-12 | 7 | 记忆 R-07 | — | M | 待 D-MEM |
| T-13 | 8a | 群聊 R-09 | — | L | 5 |
| T-14 | 9a | R-12b + R-27；R-20 标「mac 专属，Linux N/A」只登记 | — | M | 待 U-1 |
| T-15 | 9b | R-25 | — | L | 待 U-1 |
| T-16 | 10 | R-24 先做 S 级盘点 | — | S | 5 |
| T-17 | 8b/9c/11 | R-28、R-29、R-30 只取形状（外观壳用） | — | S×3 | 待 U-1 |

### 7.2 账目（director / drafter，不派 REA）

| ID | 内容 | 量 |
|---|---|---|
| **T-05** | 回写 COV：第一波六份报告覆盖的 22 行改状态；新增 N1–N8；R-31 由「不建议派」改为 T-03；§0 计数更新 | S |
| **T-06** | **实现覆盖账**：COV 只记「逆没逆」，不记「做没做」。给 198 + 8 行加实现列（main 上有没有、对照台验过没有、对应任务 id），由 6.1 Sol 读代码出初稿 | M |

### 7.3 scout 待查（→ `work/p8-parity-full/reuse/<能力>.md`）

| ID | 问题 |
|---|---|
| **T-20** | dsh computer-use 族：已装的 `dsh-computer-use` / `dsh-cua` / `dsh-cua-bundle` 0.2.2-alpha.2 的 provider 接口要实现什么；README 提到的「Cua Driver adapters」是哪个上游（trycua/cua？），支不支持 Linux X11，许可证与维护状况；dsh 有没有 Linux provider 在路上（issue / 分支）；在 headless p2sdk 宿主里能否挂上并**实际走通一次 screenshot → click**（LEARNINGS 11-02：只验构建的结论标「未实证」） |
| **T-21** | dsh browser-use 族：experimental 下 Playwright MCP / Chrome DevTools MCP / Stagehand 三个 provider 哪个能在本机 Linux 跑；浏览器 profile 能否强制隔离（不碰用户真实 profile）；下载、上传文件落在哪，和 P6-25/26 写边界的关系 |
| **T-22** | dsh ssh 族（ssh、fs-ssh、sandbox-ssh、subprocess-ssh、ssh-helper-runtime）：远端执行语义、私钥由谁持有（能否不进模型、不进沙箱）、远端沙箱边界、是否已装；**它把整个 worker 搬到远端，还是只把工具执行搬过去**（决定和 p7 非目标是否冲突） |
| **T-23** | Linux 桌面 CU 上游对照：Anthropic computer-use 参考实现（xdotool + Xvfb）、trycua/cua、open-interpreter OS 模式、UI-TARS desktop、OpenAI CUA 示例；每个给维护状况、许可证、是否必须 docker、能否作为 dsh provider 的第 2/3 级来源 |
| **T-24** | 远程端可行性：① bwrap 沙箱里的进程能否连上应用起的 Xvfb、截图、注入键鼠（F1）；② rootless podman / qemu 的安装路径是否必须 sudo、资源占用（F4）；③ 有没有现成的「远程桌面 agent 集成测试」harness 可搬 |
| T-25 | 本地语音识别 / 合成上游（仅 U-1 选 A 且做 9b 时） |

### 7.4 决策（→ /panel D，标 C2 的再问用户）

| ID | 题 | 何时 |
|---|---|---|
| **T-30** | D-CU1：开放电脑的目标屏（= U-2）→ /panel D → 用户 C2 | T-01、T-20、T-24 回来后 |
| **T-31** | D-CU2：CU 护栏 G1–G9 是否构成执行边界、默认值、测试闸门 → /panel D（**CU 开工闸门**） | 同上；题干由 director 起草 |
| T-32 | D-SCOPE：非本地面分档（= U-1） | 可立即问 |
| T-33 | D-MEM：记忆 UI 做不做（p7 §8 写了不做长期记忆） | T-06 后 |
| T-34 | D-REMOTE：远程执行是工具级还是 worker 级（与 p7 §8 的冲突） | T-22 后 |

## 8. 估算

单位 = 任务单元（一个 builder / frontend-dev 在一个 worktree 里能独立验收的一条）。S = 1–2，M = 3–6，L = 7–15。RE 列按派发次数计。

| 簇 | 面 | RE | 实现 | 合计（单元） | 备注 |
|---|---|---|---|---|---|
| 0 已回报待核对 | 22 | 0 | M | 3–6 | 只补实现缺口 |
| **1 开放电脑（+N1–N8）** | 19 | L | L | **17–25** | 含 Linux provider、隔离屏、接管 UI、护栏、F1 harness；不含 F3/F4 环境搭建 |
| 2 审批卡 | 8 | M | M | 5–8 | |
| 3 连接器卡 | 10 | M | M | 5–8 | 单卡小（1–5K） |
| 4 卡片保真 | 20 | M | L | 9–13 | visualization（d3 + three）单独占 2–3 |
| 5a 外壳设置 | 20 | M | L | 12–18 | |
| 5b 视觉基础 | 7 | M | M | 7–11 | bot mark 引擎单独占 3–4 |
| 6 routines | 4 | — | — | 0 | 归 p7 |
| 7 记忆 | 2 | M | M | 4–6 | 待 D-MEM |
| 8a 群聊 | 6 | L | L | 8–12 | |
| 8b 团队分享 | 12 | L | L | 11–16 | U-1 选 A 则降到 2–3（只登记） |
| 9a 草稿邮件 | 9 | M | L | 8–13 | 外发动作逐项问 |
| 9b 语音电话 | 5 | L | L | 8–13 | 电话需付费外部服务 |
| 9c Slack/Teams | 2 | M | L | 6–10 | 需注册外部应用 |
| 10 Library | 4 | S→L | L | 7–13 | 先盘点再定 |
| 11 计费 vault | 10 | L | L | 7–11 | 计费不可做；vault 与 §4 冲突 |
| 12 Cursor 云 | 1 | — | — | 0 | 不做 |
| **合计（字面「全部」）** | **161** | | | **117–183** | ≈ p5+p6 合计 107 行的 1.1–1.7 倍 |
| **U-1 选 A（推荐）** | | | | **约 85–130** | 8b、9b 电话、9c、11 计费、12 只登记 |

不在估算内：F3/F4 远程环境搭建（依赖用户的机器或 sudo）、p7 尚未完成的 D-1 / H1 接线（p8 的 CU 继承它们）、GLM 限流窗口（LEARNINGS 11-04：一封约 3 小时）。

## 9. 建议的第一批（可同时派，GLM ≤3）

1. **T-05** 回写 COV（drafter，S）：后面所有计数以它为准。
2. **T-01** 逆本机 CU 全链（REA，M）：R0 护栏的原版参照。
3. **T-20、T-21、T-22、T-23、T-24** 五个 scout 并行（Sol，不占 GLM）：决定 α 路线能不能走、远程端怎么搭。
4. 同时**问用户 U-2**（开放电脑操控哪块屏），它决定 T-31 护栏题干的前提。
5. 第一批回来后：director 起草 T-31 题干 → /panel D → 用户签字；同时派 T-06 实现覆盖账、T-11 的 R-33。**到这一步之前不写 BRIEF 正文。**
