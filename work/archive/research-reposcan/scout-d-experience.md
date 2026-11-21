# Grok Bot 用户体验侦察：值得复刻什么，哪些地方不要照抄

调研日期：2026-11-08。对象为 **xAI 的 Grok Bot 桌面／移动端智能体产品**，不包括普通 Grok 聊天、X 上的 @Grok、第三方同名机器人。优先窗口为 2026-08-08 至今。

## 0. 结论与证据口径

**最值得抄的是「像给同事发消息一样派活」：一句职责就能开工、有身份的专职 bot、跨设备继续看同一份工作；其次是多账号连接和可追溯的协作记录。最不该照抄的是忙闲不可见、群聊看不到正在工作的电脑、执行中发消息可能重开任务。**

本报告不是功能规格，也不是 Hivebot 代码审计。下文分别标明：

- **A：一手使用反馈**——作者明确说自己用过／测试过；论坛原帖亦属此类。仍然是个人体验，不等于普遍表现。
- **B：一手材料的编辑摘要／二手转述**——可作线索，不冒充独立实测。
- **C：界面记录／产品说明**——能证明界面或功能曾出现，不能证明用户喜欢。
- **推导**——给 Hivebot 的体验建议，不冒充 Grok Bot 现有行为。

**重要空白**：没有找到可直接核验、足以支撑本报告的 Reddit 原帖、HN 讨论或专门的 Grok Bot Product Hunt 评论。搜索偶有返回“当前不可执行搜索”的文本，这只能算检索失败，不代表这些讨论不存在。没有找到 **Users 分组、Workers 分组、内部 subagent 进度卡／回报卡** 的用户评价；公开讨论中的 bot 群聊与互发消息，**不能等同内部 worker/subagent**。没有找到可靠的原生通知音效、空状态原文体验反馈。不能为凑每节 3～6 条而编造。

### 核心来源索引

| ID | 来源、日期 | 类型／独立性 | 用途 |
|---|---|---|---|
| S1 | [Ben Tossell：Grok Bot is not what you think](https://www.bensbites.com/p/grok-bot-is-not-what-you-think)，2026-08-13 | A，作者使用感受 | 同事式消息、少即是多、连接故障、与 Codex/Claude 比 |
| S2 | [Claire Vo：My Hands-On Review…](https://www.chatprd.ai/how-i-ai/how-i-ai-my-hands-on-review-of-grokbot-cursor-origin-and-the-grok-46-model)，2026-08-18 | A，实测整理 | 简单上手、多账号、命名专职 bot、可调性不足 |
| S3 | [Lenny’s Newsletter：Grok Bot + Grok 4.6](https://www.lennysnewsletter.com/p/how-i-ai-grok-bot-grok-46whats-great)，2026-08-24；[对应视频](https://youtu.be/8ONFvAtboZ4) | B，与 S2 **同一 Claire 体验，不算另一独立用户** | 界面与多账号评价、对照意见 |
| S4 | [Zapier：What is Grok Bot?](https://zapier.com/blog/grok-bot/) | A+C；抓取正文未可靠提供作者和发布日期，时效待核 | bot 互发消息实测、飞行预订中断、审批、额度 |
| S5 | [Debbie O’Brien：Job Hunt With a Bot?](https://dev.to/debs_obrien/job-hunt-with-a-bot-56g3)，页面显示 Aug 22，**年份未明确** | A，求职实用案例；不硬算已确认近三个月 | 手机续办、结果预览、来源、增量搜岗 |
| S6 | [Cursor 社区：no glanceable working/finishing signal](https://forum.cursor.com/t/grok-bot-no-glanceable-working-finishing-signal-unless-the-pointer-is-on-the-bot-icon/168456)，2026-08-15；官方 08-17 回应 | A，用户原帖＋工作人员回应 | 忙闲与完成不可见 |
| S7 | [Cursor 社区：group chats need a live Computer view](https://forum.cursor.com/t/grok-bot-group-chats-need-a-live-computer-view-for-the-bot-that-is-working/168592)，2026-08-17 | A，用户原帖 | 群聊观察工作流的断裂 |
| S8 | [Cursor 社区：Shared Grok Bot team across teammates](https://forum.cursor.com/t/shared-grok-bot-team-across-teammates-same-roster-separate-chats/169904)，2026-08-29 起；官方 09-30 更新 | A，用户原帖＋工作人员回应 | 团队克隆导致状态漂移；**后来已有 Team Bots beta，不能再写成当前必缺功能** |
| S9 | [Cursor 社区：computer very slow](https://forum.cursor.com/t/grok-bot-computer-very-slow-high-cpu-steal-and-i-o-stalls-while-idle/173995)，2026-10-07 | A，用户＋工作人员确认基础设施事件 | 云电脑卡顿与排障消耗额度 |
| S10 | [Hermes issue #113680](https://github.com/NousResearch/hermes-agent/issues/113680)，2026-09-17 | A，GitHub MCP 已读取原 issue | 用户把 Grok Bot 当桌面流畅度标杆；非性能基准 |
| S11 | [60fps.design：Splash Mascot Expression Animation](https://60fps.design/shots/grok-bot-splash-mascot-expression-animation)，2026-11-02 | C，**iOS 录屏描述，不是桌面实测或用户好评** | 吉祥物微动画参考 |
| S12 | [中文转述 Nate B Jones 实测](https://www.jxxy.net/ai/articles/grok-bot-install-review-200-dollars/)，2026-11-06 更新；[原视频](https://www.youtube.com/watch?v=LM7Ft7g8qJw)，转述页标 2026-08-14 | B，未独立核验视频全文，不当逐字稿 | 一句安装式定位、12 bot／幕僚长案例线索 |

## 1. 上手体验：先让用户完成一件事，再让他配置系统

1. **一句角色描述 → 自动提出需要的连接。** Claire 的首轮任务是家庭管理：`I want you to be a family manager bot that keeps track of my personal email and personal calendar.` 随后 bot 识别必要集成并开始处理；她总体评价 `it just works`。**值得抄**：第一句话围绕“替我做什么”，授权在需要时出现，而非先让用户理解工具清单。证据 A：[S2](https://www.chatprd.ai/how-i-ai/how-i-ai-my-hands-on-review-of-grokbot-cursor-origin-and-the-grok-46-model)。这不证明授权从不失败。
2. **给 bot 起一个任务名就能试第一件事。** Debbie 建了名为 `job hunt` 的 bot，先让它调查自己的公开背景、推荐岗位、问必要的问题；原话 `Literally just created it with the name job hunt.` **值得抄**：新建后的默认入口应是一个可验证的小任务，不是空白等待用户设计完整 prompt。证据 A：[S5](https://dev.to/debs_obrien/job-hunt-with-a-bot-56g3)；年份未明确。
3. **简洁并不是“功能少”，而是不用先学一套控制台。** Ben 从自己很少真正用掉的 OpenClaw/Hermes 批量产出，转向 Grok Bot，评价 `I think it’s just less is more`、`it feels like you’re messaging a teammate in Slack.` **值得抄**：把“发一个明确请求—收到交付”放在第一屏；复杂编排按需进入。证据 A：[S1](https://www.bensbites.com/p/grok-bot-is-not-what-you-think)。这不是对完整 onboarding 各页的测评。
4. **授权成功率直接决定上手是否成立。** 同一位 Ben 也说连接 Gmail、Calendar、Slack 时 `I ran into several hiccups trying to connect accounts`。**不要照抄故障**：连接卡至少让用户知道失败在哪一步、能否重试、已成功的账号是否保留。证据 A：[S1](https://www.bensbites.com/p/grok-bot-is-not-what-you-think)；具体出错界面、重试行为未给出，后半是 Hivebot 推导。

**未找到**：对首启每一屏的独立满意度、首次响应耗时、空状态文案或“第一句话惊艳”的多用户交叉验证。不要把 S2/S3 计成两票。

## 2. 日常使用流：常驻的岗位与上下文，比一次性大对话更有价值

1. **多账号不是角落功能，而是“第一天就值回使用”的关键。** Claire 接了四个 Gmail 账号和七个 Slack 账号／workspace，反应是 `This feature alone would have product-market fit with me.` 真实工作的账号不是一人一个；跨个人／公司／项目身份少切换，是很具体的价值。证据 A：[S2](https://www.chatprd.ai/how-i-ai/how-i-ai-my-hands-on-review-of-grokbot-cursor-origin-and-the-grok-46-model)；[S3](https://www.lennysnewsletter.com/p/how-i-ai-grok-bot-grok-46whats-great) 为同一体验的编辑摘要。不能由此推定所有连接器都支持任意数量账号。
2. **有名字、有稳定职责的 bot，替代到处找旧 chat。** Claire 使用产品管理、承诺跟踪、收款／销售、案例写作、数据监测等专职 bot。**值得抄**：列表让人一眼认出“谁负责什么”，重复任务回到同一个对象，而不是重新解释背景。证据 A：[S2](https://www.chatprd.ai/how-i-ai/how-i-ai-my-hands-on-review-of-grokbot-cursor-origin-and-the-grok-46-model)。这是使用组织方式，不是要求给每个小步骤永久新建一个 bot。
3. **手机发一个增量请求，桌面继续看结果。** Debbie 在手机上让求职 bot 找“自周五以来新增”的岗位、优先关注 Cursor/Grok Bot、排除此前讨论过的线索；后续可在桌面接着看。**值得抄**：跨设备继续同一上下文，以及“只给新增、别重复”的日常轻请求。证据 A：[S5](https://dev.to/debs_obrien/job-hunt-with-a-bot-56g3)。未验证自动去重算法或固定调度已经配置成功。
4. **结果可快速预览、可回到来源，不必每项跳网页。** Debbie 提到 hover 预览结果、查看岗位来源、继续要求取完整 JD 并解释。**值得抄**：交付物不是长篇汇总，而是可扫读的候选项＋来源＋下一步。证据 A：[S5](https://dev.to/debs_obrien/job-hunt-with-a-bot-56g3)。具体卡片尺寸、动画、下载样式未提供。
5. **自动化的价值是可持续交付，不是堆满输出。** Ben 赞赏易用的 automations、观察屏幕教任务、可观看的虚拟电脑，同时坦言自己不喜欢审大批 agent 输出、习惯一次一个 session。**值得抄**：让用户确定“下次什么时候、交付到哪、只在什么情况打扰”，不要默认开启大量 routine。证据 A：[S1](https://www.bensbites.com/p/grok-bot-is-not-what-you-think)；后半是设计推导，不是已证实的 Grok 设置项。

**文件／定时任务证据边界**：S4 描述远程 Computer 内能看文件、浏览器、终端，作者也实际建了新闻简报 bot 与研究团队；但未给出足以复刻的附件预览、导出、下载与完成通知细节。Debbie 的“每天搜岗”是使用建议，不能算她已验证的定时执行；S9 的“依赖定时录制”则是用户真实用途，却伴随云机故障，不是成功率证明。

## 3. Workers／委派体验：有协作实据，但不能混淆两种编排

1. **主 bot 自行问另一个 bot、拿选题、继续研究，且另一边留下记录。** Zapier 作者测试 Researcher Bot 联系 Topic Scout，后者返回三个主题，Researcher 自选后研究；Topic Scout 保留简短交互记录，作者评价 `which is great for tracking what's happening`。**值得抄**：委派有“派给谁—拿回什么—下一步是什么”的可追溯链，而非只见主 bot 自言自语。证据 A：[S4](https://zapier.com/blog/grok-bot/)。这是 bot↔bot 消息测试，**不是**内部 Workers 卡片证据。
2. **多人／多 bot 的房间，最重要的是不丢失“谁在干活”。** macOS 用户 GrokUser841719 说，一对一可以打开那个 bot 的 Computer/VM，群聊里却没有；必须退出群聊逐个进私聊找活跃 bot。他要求在群聊直接看当前执行者的 Computer，或可选其桌面。**值得做得更好**：协作面板能直接跳到当前执行者的上下文／输出，不迫使用户挨个找。证据 A：[S7](https://forum.cursor.com/t/grok-bot-group-chats-need-a-live-computer-view-for-the-bot-that-is-working/168592)，2026-08-17；未见该帖修复回复，不能断言今天仍未修。
3. **“幕僚长＋专才”的心智模型存在，但效果证据弱于流程证据。** Ben 亲用评价中列出 agent 互发消息和 persona 可定制；Nate 的中文转述则说其建立 12 个 bot，并让幕僚长协调。**可借鉴**：用户始终有一个可追问的负责人，而非被迫直接管理每个执行单元。证据 A：[S1](https://www.bensbites.com/p/grok-bot-is-not-what-you-think)；证据 B：[S12](https://www.jxxy.net/ai/articles/grok-bot-install-review-200-dollars/)。后者没有消息日志、延迟或交付质量测量，不算“12 bot 协作可靠”的实据。

**明确未找到**：对产品里 `Users`／`Workers` 分组的公开评价；subagent 创建、折叠、取消、阶段进度条、完成回报卡的用户截图或文字实测。不能据以上三点决定 Hivebot 的内部 subagent 生命周期，也不能把用户创建的对等 bot 自动改叫 worker。

## 4. 槽点／期望：真正的差异化机会

1. **忙／闲／将完成没有常驻信号。** manolito_nora 报告只有 hover 到头像才看得到工作动画，侧栏、设置、信息页都无法一瞥判断；他因此在任务还等待时追问结果，强调 `silence ≠ progress`。工作人员 08-17 表示内部也收到类似反馈并已记录，未承诺修复时间。**机会**：无需 hover 的状态＋失败／等用户的区分；不要凭模型猜测虚假的“即将完成”。证据 A：[S6](https://forum.cursor.com/t/grok-bot-no-glanceable-working-finishing-signal-unless-the-pointer-is-on-the-bot-icon/168456)。
2. **中途发一条消息，可能把任务退回起点。** Zapier 作者在测试订加拿大航班时，于完成前发消息，结果 `The Bot went back to step 1.` **机会**：明确区分追问进度、补充约束、取消重来；保留已经完成的阶段。证据 A：[S4](https://zapier.com/blog/grok-bot/)。仅一例，不推定所有任务都如此。
3. **审批不透明，让“没打扰我”变成不放心。** 同一作者连接 Google Docs 后 `I didn't get pinged for approval on anything`；虽按指令完成，未经检查的操作仍让他担心。**机会**：对发送、发布、删除、覆盖等边界显示审批与执行记录；不能把少审批本身当优秀 UX。证据 A：[S4](https://zapier.com/blog/grok-bot/)。不等于已证明所有操作无审批或不安全。
4. **额度消耗难预期，排障也在花钱。** Zapier 作者说试用在持续操作时约一小时就容易耗尽；另一位真实用户在云机变慢时抱怨 `burning through my plan credits ... trying to figure this out`。**机会**：消耗可见、卡住及时止损、系统问题不要诱导用户反复付费重试。证据 A：[S4](https://zapier.com/blog/grok-bot/)、[S9](https://forum.cursor.com/t/grok-bot-computer-very-slow-high-cpu-steal-and-i-o-stalls-while-idle/173995)。这是两人各自情境，不把“一小时”当统一额度规格。
5. **云电脑故障不能伪装成 bot 思考中。** 10-07 用户报告云电脑大部分空闲却负载高、命令要几分钟、Chrome 无响应，影响定时录制；工作人员确认当日底层宿主负载导致多台 Grok Bot 电脑变慢。**机会**：区分模型忙、远程执行忙、基础设施故障，并给出明确恢复入口。证据 A：[S9](https://forum.cursor.com/t/grok-bot-computer-very-slow-high-cpu-steal-and-i-o-stalls-while-idle/173995)。**不是本地 Mac／Electron UI 卡顿**。
6. **简单与可调性有真实冲突；团队共享的旧槽点则已出现回应。** Claire 不满不能选底层模型、深度调配置或获得满意的人格体验（她用 `no vibes` 形容）；可给熟练用户渐进式高级选项，而不污染默认体验。另一个团队用户 08-29 抱怨分享只会克隆，memory/files/logins/history 随即分叉；但工作人员 **09-30 已宣布 Team Bots public beta**。所以共享实时上下文是需求实据，**不是截至今日仍缺失的结论**。证据 A：[S2](https://www.chatprd.ai/how-i-ai/how-i-ai-my-hands-on-review-of-grokbot-cursor-origin-and-the-grok-46-model)、[S8](https://forum.cursor.com/t/shared-grok-bot-team-across-teammates-same-roster-separate-chats/169904)。

## 5. 视觉／微交互：让角色有生命感，但状态必须有信息量

1. **iMessage 式简洁聊天，让 agent 像联系人而不是流程编辑器。** Claire 的编辑摘要称 `the iMessage-style interface is clean`、setup 快、plugins 有效；Ben 的独立观感是 Slack 同事式消息。**复刻重点**：信息密度、熟悉的聊天操作与名字／职责可辨认，而非只抄某个圆角数值。证据 A/B：[S1](https://www.bensbites.com/p/grok-bot-is-not-what-you-think)、[S3](https://www.lennysnewsletter.com/p/how-i-ai-grok-bot-grok-46whats-great)；S3 与 S2 同一体验。
2. **桌面整体流畅，已经被其他项目用户拿来当标杆。** Hermes 用户原帖说 `Grok Bot feels much smoother to me`，并希望输入、切会话、历史滚动、后台工作时的交互都能更流畅。GitHub MCP 核验了该原文。**可转成验收面**：后台跑任务时仍能输入、切换、滚动，不抢光标、不重置阅读位置。证据 A：[S10](https://github.com/NousResearch/hermes-agent/issues/113680)。后面这些是其提出的测量面，**不是他逐项完成的对照测试**，没有毫秒／FPS 数据。
3. **结果 hover 预览降低查阅成本。** Debbie 的求职演示提到不用打开每个条目便可预览。证据 A：[S5](https://dev.to/debs_obrien/job-hunt-with-a-bot-56g3)。没有足够数据指定其卡片版式；Hivebot 也需提供键盘／触屏等价入口，不把内容藏在 hover 后。
4. **头像动起来不等于用户知道它在干活。** S6 恰好给出反例：工作动画只在 hover 可见。**复刻取舍**：可爱的 idle animation 与任务状态分开；无 hover 时也能识别 running／waiting／failed／done。证据 A：[S6](https://forum.cursor.com/t/grok-bot-no-glanceable-working-finishing-signal-unless-the-pointer-is-on-the-bot-icon/168456)。这些状态名称是建议，不是原版标签。
5. **启动页小角色的错峰微动画可参考，但没有用户好评数据。** 60fps.design 的 **iOS** 录屏描述为彩色几何吉祥物环绕标题，各自不同步眨眼、侧看、倾斜、挤压，不遮盖 Sign in 主操作。证据 C：[S11](https://60fps.design/shots/grok-bot-splash-mascot-expression-animation)。**只能作为低优先视觉参考，不可据此宣布桌面原版同样如此或“用户最爱”**。

**未找到**：可核验的桌面通知音效、成功提示音、具体空状态文案、状态短语轮换、Workers 进度动画的用户体验反馈。搜索出来的 voice mode／第三方语音封装不是通知音效，已排除。

## 6. 与 ChatGPT 桌面／Claude 桌面对比：可以说什么，不能说什么

1. **可成立的优势线索：多账号连接的开箱即用。** Claire 的摘要明确说 Codex 和 Claude 尚未匹配她在 Grok Bot 上获得的跨多账号实用性。**可取的是减少身份切换与授权重复，不是宣布模型更强。** 证据 B，基于一手经历：[S3](https://www.lennysnewsletter.com/p/how-i-ai-grok-bot-grok-46whats-great)。没有同版本逐项连接器测试，不扩大成所有 Claude／ChatGPT 产品都不支持多账号。
2. **可成立的取舍：同样能办事，但 Grok Bot 少几步。** Ben 认为 Codex 或 Claude 有类似能力，不过要额外步骤；他的好感来自少即是多、像发消息给同事，而非完成率／模型性能比较。证据 A：[S1](https://www.bensbites.com/p/grok-bot-is-not-what-you-think)。文章也提到他此前用 Codex/ChatGPT 的手机联动覆盖远程电脑需求，不能写成 Grok 首创。
3. **反向结论同样重要：好装不等于对话体验最强。** Claire 仍偏好 Sonnet 5 在其 OpenClaw 中简洁、响应快、聊天有趣的表现，且认为 Grok 4.6 没追上那种聊天感；这是**模型／宿主组合偏好**，不是 Claude 桌面 App 直接 A/B。证据 B：[S3](https://www.lennysnewsletter.com/p/how-i-ai-grok-bot-grok-46whats-great)。Hivebot 应保留简洁回复与适量可调性，不能只靠吉祥物替代输出质量。

**严格边界：未找到 ChatGPT 桌面 App vs Grok Bot 桌面 App、Claude Desktop vs Grok Bot 桌面 App 的可靠同机同任务实测。** 搜索中大量 Cowork／ChatGPT Work／Codex 的商业对比是不同产品边界，不能拼接成桌面 App 性能排名。上述三条是可追溯的评价／取舍，不是桌面产品胜负判定。

## 7. Hivebot 体验复刻清单

“我们现状猜测”仅依据本任务背景（桌面壳、多 bot、Workers 编排、onboarding、创建对话框已有）与 `work/HANDOFF.md` 开头快照；**没有审代码或跑产品**。未知处写待查，不把猜测记为缺陷。优先级是研究建议，不是已批准工单。

| 待办 | 可执行体验项／最小验收方向 | 出处 | 我们现状猜测 | 优先级 |
|---|---|---|---|---|
| [ ] | 首次新建后引导一个职责明确、可验证的小任务；用户不必先列工具／完整系统提示 | S2、S5 | onboarding／创建链已有；首任务是否真正交付待体验 | 高 |
| [ ] | 连接卡显示账号身份、授权中／已连／失败和独立重试；失败不丢其他已连接项 | S1；后半为推导 | 授权状态与重试体验待查 | 高 |
| [ ] | 每个 bot 无 hover 也可见任务状态；区分运行、等用户、失败、完成，不虚报“即将完成” | S6 | 已有状态短语链；常驻状态与异常区分待查 | 高 |
| [ ] | 委派面显示父任务、执行者、当前阶段与回传；可从主会话直接跳到对应上下文 | S4、S7；用于 worker 为迁移推导 | Workers 已有；subagent 全覆盖与关联可达性待查 | 高 |
| [ ] | **保持两种身份分开**：用户创建 bot 是对等联系人；派生 worker 归属父任务，不把群聊证据当 subagent 规格 | 本报告证据边界 | 与当前背景方向一致；仍需 UI 口径一致 | 高 |
| [ ] | 正在执行时发“进度怎样”不重开任务；修改／追问／取消有明确语义，已有阶段保留 | S4 | 需单独验收，不从聊天 UI 已完成推定 | 高 |
| [ ] | 关键外部写入提供审批与可追溯执行记录；明确批准的是哪项动作 | S4 | 现有审批范围与视觉反馈待查 | 高 |
| [ ] | 检测卡住／执行端异常，区别于正常思考，提供重试或恢复入口，避免无限消耗 | S9 | 不能假定我们有同型云机；适配本地／SSH 执行端 | 高 |
| [ ] | 后台任务运行时，输入／切会话／历史滚动仍流畅，不丢光标、草稿和阅读位置 | S10 | 桌面壳已有；并发负载下交互未在本次验证 | 高 |
| [ ] | bot 列表把名字与职责做好，让用户回到固定负责对象；新任务避免无意义永久增殖 bot | S2、S1 | 多 bot 已有；名称／职责的信息层级待体验 | 中 |
| [ ] | 结果用短候选项＋来源＋下一步，支持快速预览及键盘／触屏等价访问 | S5 | 主聊天首答／终答已打磨；结果预览未知 | 中 |
| [ ] | 成本／额度与异常重试次数可见；任务开始前至少提示昂贵或持续执行属性 | S4、S9；具体形态为推导 | 模型／用量已有何种展示待查 | 中 |
| [ ] | routine 默认少而精，明确交付物、触发条件与打扰策略，而非堆高频简报 | S1、S4 | 定时链有工作记录；交付与通知策略待查 | 中 |
| [ ] | 多账号连接的身份选择清楚，允许同类服务多个身份；先以真实需求验证，不凭热度扩全连接器 | S2／S3 | 多账号能力未知；不是本轮 UI 即刻扩建要求 | 中 |
| [ ] | 高级用户可渐进调整模型／角色风格；默认维持简单聊天，不暴露全部控制台 | S2、S3 | 现有模型选择／风格入口待查 | 中 |
| [ ] | 移动端／远程端可以继续同一任务及上下文 | S5 | 本任务只确认桌面壳；**涉及范围扩张，先记录，不直接做移动端** | 低 |
| [ ] | 启动吉祥物用不同步眨眼、侧看、轻微形变，优先不挡主操作且尊重减少动画设置 | S11；无好评证据，最后一项为可访问性推导 | 已有 onboarding／头像；精确动画待比对 | 低 |
| [ ] | 若未来做团队共享，区分“复制模板”与“同一 bot 的共享实时状态”，显示共享范围 | S8，原版后已出 beta | 当前多 bot 不等于多人团队；**未获需求不开发** | 低 |

### 建议先做的三个体验验收场景

1. **新用户只说职责** → 给最少授权 → 首个可核查结果；中途连接失败能重试，不回到起点。
2. **主 bot 派活** → 不 hover 也知道忙闲 → 一步看执行者／回传 → 问一次进度不重跑任务。
3. **任务后台长跑** → 聊天输入与切会话不被阻塞 → 执行端卡住显示异常而非永远“思考中” → 不反复消耗重试。

## 8. 检索覆盖与排除记录

- WebSearch 已覆盖：`Grok Bot review desktop`、`Grok Bot reddit workers`、`grok bot 评测 桌面`、`Grok Bot experience group chats`、`Grok Bot workers UI review`、`Grok Bot review notifications progress onboarding`、`Grok Bot Users Workers`、`Grok Bot review animation`、`Grok Bot sound UI`、`Grok Bot Claude desktop review comparison`，以及 Reddit、X、HN、Product Hunt 定向词。
- 对相关结果用 WebFetch 追到正文；对群聊与团队原帖尤其检查工作人员的后续回复，避免把已回应的旧问题当当前缺口。
- GitHub MCP：先 `get_me`，再体验关键词 issue 搜索（该次无结果）；对 WebSearch 找到的 NousResearch/hermes-agent #113680 用 `issue_read(get)` 读取原文。它证明一位用户的主观流畅度参照，不是 Grok 官方 issue。
- Reddit/X 精确域名查询多次未获得可用结果，部分工具回复是执行失败；**不以“没搜到”证明没有用户讨论**。Ben 文章链接了 X 发布／反应帖，但本报告未拿到帖文全文，所以不另算独立评价。
- HN 未得到直接讨论；Product Hunt 搜到的是普通 Grok 产品评论，已排除。不能把聊天模型评分转成 Grok Bot 评分。
- TechTwitter 的“过去 30 天实际用途”聚合页未返回正文，未采用其社区结论；大量 alternatives／comparison 商业页未给一手过程，未当主要证据。
- S11 为 iOS 动画记录；S12 为中文转述；两者均未伪装成桌面实测。没有为了凑数引入未核验的音效、进度卡、Workers 分组、附件交付行为。

**调研收口**：公开实据支持“任务式开局、身份明确的专职 bot、多账号、轻消息派活、协作可追溯、预览来源、桌面流畅”的方向；不足以给出 Workers 内部 UI 的精确复刻规格。这里最有把握的差异化不是更多面板，而是**持续可见的状态、不中断的追问、可检查的权限与故障反馈**。
