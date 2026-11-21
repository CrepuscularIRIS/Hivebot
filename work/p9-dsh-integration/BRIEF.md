# BRIEF · p9-dsh-integration

## 用户原话
- 2026-11-06：「我们希望是Grok Bot的所有功能, DSH+SUperAgent去完成……比如还可以控制远程的服务器. 现在我们要把远程连接灵魂, 还有一个之前cursor 员工的要求作为目标产物去做. 我们会鼓励glm用github mcp多去检索dsh的插件……dsh本来就是plugins为核心的……现在可能是一个superagent+dsh的集成.」
- 2026-11-06（澄清）：「都是需要的. 就是lauren tan说的grok bot的使用方法. 我们希望一开始, grok bot至少需要具备这些功能. 尤其是使用体验上. 我们会把这个grok bot打造为这种level……然后可以对照到dsh的一些插件集成进去. ssh可以先做本机测试. 后续其实就是一个ssh的问题.」

## 目标
1. 项目性质从「复刻」改为「集成」：Grok Bot 全部功能用 **dsh 插件 + SuperAgent** 实现。每个能力先找现成 dsh 插件（本地 `repos/deepseek-harness` 533 个包 + GitHub MCP 检索第三方插件），再写胶水。
2. **第一个目标产物**：Lauren Tan（Grok Bot 核心成员）展示的 Grok Bot 用法要能在我们的产品里跑通，**使用体验优先**。
3. **远程连接**：bot 能操作远程服务器。原版是 bot 跑在 xAI 云电脑上；我们用 dsh `ssh` 插件组，把一台 ssh 主机当作 bot 的电脑。先 ssh 到本机（sshd 已在 :22 运行）测试，之后换真实远程主机只是换 ssh 目标。
4. **灵魂**：每个 bot 有自己的人格（职责、语气、不做什么）和持续上下文。

## Lauren Tan 的用法 → 要具备的功能 → dsh 对应

来源：[Lauren Tan 七条建议](https://www.bit.fan/en/news/list/lauren-tan-grok-bot-skills-vault-voice-guide-2a03fdcc-en-keyName-7f9957c6)、[pstack 工作流](https://aiidelist.com/blog/lauren-tan-grok-bot-pstack-workflow)、[14 个 bot（公开部分）](https://creatoreconomy.so/p/grok-bot-team-14-best-bots-peng-zheng-lauren-tan)、[演讲摘要](https://youtubesummary.com/summary/Cmoh-yR-usA)。

| # | 用法 | 需要的功能 | dsh / 现有 | 现状 |
|---|---|---|---|---|
| L1 | 少量常驻 bot，每个只做一件事、一种语气、写明不做什么 | 多 bot 名册、每 bot 人格（灵魂）、持续会话 | session-controller、preset/persona；我们的 M3 名册 | 名册已有；人格编辑待做 |
| L2 | Chief of Staff 收需求、分派给专职 bot；工程主管 bot（Matcha）拆项目交给工程 bot | 主 bot 委派、跨 bot 发消息与交接 | SuperAgent 编排（P6 已做大部分）、`subagent` | 大部分已做；P6-14b 开闸未完 |
| L3 | dr eggbot：用 bot 创建 / 审计 bot | bot 能建 bot（CreateAgent） | 我们的 P7-M1 | 卡在 P7-F2/F3 |
| L4 | 把可重复流程存成命名 Skill；同账户 bot 共用 Skill 库，按 bot 启用；Teach a Task | Skill 库、对话中「把刚才的流程存成 skill」 | `skill` 包 | 待对接 |
| L5 | 定时收集 Slack bug、X 投诉，分派给负责人 | 定时任务、外部事件触发 | `schedule`、`experimental/webhook`、`webhook-github` | 待对接（P7-L3 相关） |
| L6 | Connect apps（Figma MCP、Slack 等），凭据留在连接器后端 | 连接器市场、MCP | `mcp`、`plugin-market`；我们的市场 UI | 市场已有，连接器授权部分做了 |
| L7 | Vault 存账号密码 / 卡，bot 能用但看不到明文 | 凭据库 + 填充时脱敏 | `credentials`、`client/ui-secret-mask` | 待对接 |
| L8 | bot 共用一台电脑（浏览器登录态、文件、命令行） | bot 的电脑：远程执行、文件、终端 | **`ssh` 组**（ssh / fs-ssh / subprocess-ssh / sandbox-ssh / ssh-helper-runtime） | **新，本机 ssh 先测** |
| L9 | 复现 bug：操作真实 UI、截图、取 trace | 浏览器操作、电脑操控 | `browser-use`（Playwright MCP / Chrome DevTools MCP / Stagehand）、`computer-use` | 待对接（p8 范围） |
| L10 | 工程 bot：隔离 worktree、测试、出 PR、独立审查者复验后才合并、过夜跑 | 长期目标循环、子 agent、验证 | `goal`、`subagent`、`workflow`；我们的 P7-L2 | 部分 |
| L11 | 语音一次讲完任务再让 bot 复述；Cmd/Ctrl+D 语音输入 | 语音输入 / 转写 | `experimental/voice-input-bundle`、`speech-to-text-sensevoice` | 待对接 |
| L12 | PM、设计、工程 bot 在同一个 Room 协作 | 群聊 Room | 无现成（待检索） | p8 簇 8a |
| L13 | 像 iMessage 的界面，非工程师也能派活、审批 | Grok UI 外壳、审批卡、通知 | 我们的 renderer-grok 移植；`client/ui-approval` | 已有，继续打磨 |
| L14 | 离开电脑后继续跑、回来看结果；跨设备 | 后台常驻、远程客户端接入 | `api/gateway`、`remote-access`、`remotes` | 待评估 |

不做：mail.grokbot.com 独立邮箱、xAI 云电脑本身、Cursor Cloud Agents 后端（用 ssh 主机 + 本地 subagent 替代）。

## 验收（第一版，由 manager 细化成工单）
- 能按 Lauren Tan 的方式搭一个 3 bot 小队（Chief of Staff + 工程 bot + 审查 bot），通过界面派一个真实小任务，主 bot 分派、工程 bot 在 ssh 主机（先是本机）上改代码跑测试、审查 bot 复验，结果回到对话。
- 在对话里说「把刚才的流程存成 skill」，之后另一个 bot 能启用并复用它。
- 一条定时任务按时触发并把结果投递到指定会话。
- 每个功能有真实 e2e 证据；UI 截图对照 0.78.1。

## 下一步
派 `manager`（任务 A）：
1. 按上表逐行核对 dsh 插件能力（读包 README / 源码；用 GitHub MCP 检索第三方 dsh 插件，记入 `repos/MANIFEST.tsv` 或 reuse 文件），给出「直接用 / 插件+胶水 / 需自建 / 不做」。
2. 标出现有自建模块（`app/sdk/src` policy / orchestration / admin / market）中能被插件替代的部分。
3. 定第一批工单：建议从 L8（ssh 本机）和 L4（skill）开始，二者独立、插件现成、能最快跑出一条端到端体验；重排 p5–p8 剩余任务。

## 产品方向（用户定调 2026-11-06 23:5x）

- **第一阶段（现在）**：本机 Linux 完整体验——产品启动器拉起 SDK + Electron，日常使用 skills/定时/M1-M3 全链。
- **第二阶段**：**Windows exe 客户端**，连接到 ssh ubuntu 远端电脑（bot 的电脑）。测试链路可能走 **tailscale**；Windows 侧由用户自己连接过来测试。
- 含义：T9-T12 的 ssh 链最终消费者 = Windows exe 客户端；启动器/打包设计为 Windows 预留（electron-builder 目标 win、SDK 跑远端不进 exe、handoff 通道经 tailscale 可达）。
- **经理注（2026-11-06 23:5x，任务 A）**：上一条两句互相矛盾——「SDK 跑远端不进 exe」时 ubuntu 本身就是 bot 的电脑，SDK 以本机模式在那里跑，Windows 客户端只经隧道连 SDK，**不消费** T9–T12 的 ssh 链（ssh 链的设计前提是「SDK 在这边、电脑在那边」）。两种走法（A：exe 含 SDK、工具经 ssh 在 ubuntu 执行 = ssh 链的消费者；B：exe 只是 UI、SDK 在 ubuntu 本机模式 + ssh -L 隧道 / tailscale）的对比与推荐（B）见 `work/product-launcher/DESIGN-launcher.md` §4，交用户拍板 = **Q-031**。T11 两种走法都用得上（B 下它的 `workspace.ensure` RPC 是 main 文件职责迁 SDK 侧的第一块），照常做完；T12/T13 随 Q-031 定。

## 用户体验反馈（2026-11-07 04:0x，用户实测 Hivebot 后）

1. **UI 层（用户定调最优先）**：逆向的 UI 缺很多元素。重逆向 0.79.3（已下载解包 /tmp/grokbot-0.79.3/）：
   - 回复呈现：原版**无 CoT**——只有回复结果，「第一次回答和最后一次回答」（中间过程不可见的形态要逆向）
   - 创建 bot：有很多**动画**、UI 有很多**素材可配置**——都要逆向
   - 先做 UI 部分
2. **编排层（用户自己研究中）**：跨 bot 交流 / subagent 区分不合理——「随便说一个需求，结果人家都弄错了」；dsh 本身也有 subagent（且看不了）；感觉没有完全连接起来；superagent 没看到创建。→ 等用户研究结论再拆单。

## 体验对齐目标升级（用户 2026-11-07 05:0x）

原话：「尽量把所有的最新版本的所有的功能UI, 背后的控制一系列行为, 看看能否都逆向出来. 我们尽量让Opus去取舍对齐. 至少在使用体验上, 几乎和Grok Bot保持一模一样即可」

含义：
- RE 范围从「UI 三题」扩到 **0.79.3 全功能面**（UI + 背后控制行为：交互流程/RPC 面/状态机/设置/快捷键/面板等）
- 对齐取舍由 **manager（Opus）** 做：gap 全景 → 取舍清单 → 主计划
- 验收标准 = **使用体验与 Grok Bot 几乎一模一样**（非逐字节，但用户可感知面全对齐）
