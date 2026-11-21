# Scout F：dsh 桌宠、房间与社区

调研日期：2026-11-09。只做公开资料与本地只读盘点，未安装插件、未运行参考仓、未改产品代码。GitHub stars 是本次 API 快照；README 的功能是作者声明，不是 Hivebot 集成验收。B 站数字区分视频页直接可读值与文章转述；“最火”只限本轮样本，不能当全站排行榜。

## 一、桌宠项目盘点

### 1. dsh 生态里真正成规模的是“大肥鱼二创 + 可玩动作 + agent 状态可视化”

| 项目 | stars / 最近默认分支 commit | 怎么做、怎么互动 | 对 Hivebot 的价值与边界 |
|---|---|---|---|
| [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) | **5,921** / 2026-11-09 | TypeScript；DSH 浏览器 overlay、**Electron 透明置顶窗**、独立模式三形态。100+ VP9-alpha WebM 动画；点击 Q 弹、拖拽甩抛、弹弓、漫游、宠物互撞、多开、睡觉。会话事件驱动思考/工作/整理/等待/成功/出错；另有聊天、碎碎念、语音、待办、余额。 | **最贴近现有栈的一号候选**。npm `dsh-pet`，已有 pet pack 与素材制作链；还提供同页面 Cordis `petApi7340` 与 HTTP 控制面。代码 MIT，**鲸鱼娘资产不是 MIT**。 |
| [MerZlin/dsh-pet-indesktop](https://github.com/MerZlin/dsh-pet-indesktop) | **3,188** / 2026-10-22 | **Python + PySide6，不是 Electron**。脱离 DSH 的透明无边框置顶宠物，WebM/帧序列、托盘、角色热加载、多宠、可选 OpenAI 兼容聊天、语音/截图问答；README 记录 DSH bridge 与多 DPI 修复。 | 成熟“独立养宠”形态参考，但引入 Python/Qt 与额外打包链不如复用现有 Electron；不优先整仓集成。 |
| [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu) | **604** / 2026-10-29 | DSH 插件启动原生 Qt Helper，随 Host 退出；部分架构回退 Python/PySide6。透明置顶、工具阶段状态、审批提示音、点击与拖放；16 组透明 WebP 动作、3,444 帧。 | **状态诚实性**值得借鉴：不读屏，进度/推理强度只显示上游实际给出的信息。宠物在 Host 所在桌面，不是自动在远程浏览器所在电脑。 |
| [vlln/whale-girl](https://github.com/vlln/whale-girl) | **405** / 2026-10-30 | DSH Web 右下角 QQ 宠物式 overlay；投喂、玩球、打瞌睡、等级/头衔/共同记忆，任务/会话/陪伴时间积累。另有 Node engine + **Tauri v2** 桌面 companion，保留旧 Electron 壳；presence TTL 避免页面和桌面重复显示。 | 对“桌宠不只是状态图标”的留存机制最直接；但不要为它换主壳。 |
| [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume) | **209** / 2026-11-08 | README/仓库描述：鲸鱼娘、按工具切换工作姿态、45 项成就、3 个小游戏、存档迁移，桌面与旧 Web 双端。 | 适合养成玩法参考；已见 owner 实际回应 [#38](https://github.com/Sutera-Diffusus/dsh-whale-musume/issues/38)。本轮未读实现，不把自述当性能/安全证明。 |
| [Andersen216/dsh-whale-girl-live2d](https://github.com/Andersen216/dsh-whale-girl-live2d) | **92** / 2026-10-20 | DSH Web **Live2D**，真实 agent 状态切表情动作；点击对话、右键钱包、拖动、表情/装饰/场景/动作菜单。README 目标 0.2.0-rc.1/rc.2，非 0.1.x。 | Live2D 产品原型参考；未证明兼容我们 **0.2.2-rc.1**。代码 MIT、形象 CC BY-NC-SA 4.0；不照抄一键脚本。 |
| [skr311/dsh-codex-pet](https://github.com/skr311/dsh-codex-pet) | **5** / 2026-09-21 | Web `shell.overlay` 播 WebP 精灵图；zip/URL 导入图库，idle/running/waiting/review/failed 等状态，点击挥手、拖动。已确认宿主仅 0.1.5-rc.2。 | **资产包导入/图库**参考；小样本，不是成熟桌面壳，不应直接假定能装进 Hivebot renderer。 |
| [LINNoot/dsh-co-pet](https://github.com/LINNoot/dsh-co-pet) | **1** / 2026-08-17 | DSH 细事件 + `agents` 轮询校正；UDP + 原子状态文件双通道驱动 **PySide6** 桌宠。接 Codex/Petdex 精灵图；状态到动作不调 LLM。 | 可学“事件驱动、轮询纠偏”；不是规模化依赖首选。README 的“零 LLM 成本”指状态动画推导，气泡另列 AI 总结，不能外推全部功能零成本。 |

**核心辨析**：宠物外观像 3D，不代表实时 3D。`dsh-pet` 主路线是预渲染透明视频，`dsh-dafeiyu` 是从其视频转出的透明帧。**通常由确定性状态机选动作，而非让 LLM 每帧操控身体**。LLM 更适合负责说什么、选择有限情绪/动作；拖拽、惯性、点击、打断优先级留给本地规则。

### 2. 泛 agent 桌宠与素材生态

- [rullerzhou-afk/clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk)：**6,701★**，2026-11-09 commit，Electron + 像素风，监视 Claude Code/Codex/Cursor 等 agent。AGPL-3.0；是“我不盯终端，宠物替我盯状态”的强需求信号，不能由 stars 推断 B 站同样最热。
- [crafter-station/petdex](https://github.com/crafter-station/petdex)：**4,348★**，2026-10-10 commit。`petdex.dev` 是投稿、审核、展示的公共图库，CLI 另负责安装；标准 `pet.json` + `spritesheet.webp/png`，8×9 或 v2 8×11 格，192×208/格。公有 `/api/manifest` 提供审核通过条目与动画/资产 URL。**代码 MIT，素材由投稿者各自授权**。
- [OpenPetsHQ/openpets](https://github.com/OpenPetsHQ/openpets)：**1,390★**，2026-11-08 commit；最新 release API 为 **v4.1.0 / 2026-10-18**。Electron 桌宠平台，`@open-pets/client` IPC helper、MCP、agent-events、pet-format，Plugin SDK v3 声明有权限/配额/存储/调度/通知。可外接 agent 反应，不必另造一套 AI 后端。README 宣称气泡过滤代码/路径/秘密，但本轮未审计其隔离有效性。

**走红原因（有资料支撑的归纳，不是因果实验）**：可识别的大肥鱼共同形象 + 几秒就能看懂的 Q 弹/投喂/工作动作 + 不会编程也能安装 + 生成/换皮/分享的低门槛 + B 站评论反馈进入下一版。`dsh-pet` 连提示词、绿幕视频到透明资产的配方一起给出，天然鼓励二创；MerZlin README 明确将多项修复归因于 Bilibili 用户实测反馈。并不是“有一个聊天 API”就会火。

## 二、B 站热度形态与证据

### 1. 可直接读到的视频页

| 视频 | 发布 / UP 主 | 播放 / 赞 / 收藏（本次页快照） | 能说明什么 |
|---|---|---|---|
| [《DeepSeek Harness大肥鱼宠物插件》BV1JAbC6wEWW](https://www.bilibili.com/video/BV1JAbC6wEWW/) | 2026-08-15 / 瓜皮老花生 | **约 14.3 万 / 1,969 / 3,146** | 简介指向 `QCYTSN/dsh-dafeiyu`，可把视频与具体仓对应；简介本身不足以逐项证明交互。 |
| [《【DSH插件】DeeepseekHarness大肥鱼桌宠》BV14Zbv6HEnG](https://www.bilibili.com/video/BV14Zbv6HEnG/) | 2026-08-18 / 我-是-个-人 | **4,968 / 136 / 152** | 同类内容并非条条爆款，不能只挑大数字。 |
| [《【全动态Live2D】大肥鱼桌宠！？》BV1E6aq6pEpz](https://www.bilibili.com/video/BV1E6aq6pEpz/) | 2026-09-28 / PalAILab | **17.2 万 / 约 1 万 / 约 1.1 万** | Live2D 桌宠有实在观看与收藏需求；本轮未确认它与上表哪个 GitHub 仓一一对应。 |
| [《什么是“鱼灾”？B站大肥鱼一周爆发始末全复盘【附安全养鱼指南】》BV126nt6GE4W](https://www.bilibili.com/video/BV126nt6GE4W/) | 2026-10-23 / WorkFisher | **280.8 万 / 9.6 万 / 8.6 万** | 证明大肥鱼/agent 社区现象的传播规模，**不是桌宠软件装机量，也不是某种渲染技术的胜出证据**。 |

以上是 WebFetch 提取视频页正文，未调用用户账号、未用登录 cookie；没有视频逐帧观看或 B 站后台数据。

### 2. 媒体旁证与数字防串用

- [人人都是产品经理，2026-11-04《一天涨粉40万！DeepSeek把B站开发者全炸出来了》](https://www.woshipm.com/ai/6488922.html)：称**“4B 本地模型跑的大肥鱼桌宠”55.6 万播放**，但未给可确认的该视频 BV。只能作为媒体转述，**不能硬套到上面的 Live2D 视频**。
- [优设《从养鱼到开发插件！DeepSeek 在B站掀起了一场全民AI创造实验》](https://www.uisdc.com/deepseek-harness-debut)也转述 55.6 万，内容高度接近，**不算两个独立测量**。页面仅“4天前”，不把图片文件日期当确定出版日期。
- 上述文章的 **211 万/24h、一天涨粉 40 万**属于 DSH 官方入驻视频；**270 万、236 万**属于吃白饭/吃 token 等二创视频，**都不能计作桌宠使用热度**。

### 3. 哪种形态受欢迎

1. **本轮最有把握：大肥鱼二创角色 + 可互动、可陪伴、可晒的桌宠**。渲染可以是预渲染视频/帧，不必先做 Live2D，更不必自建实时 3D 引擎。
2. **Live2D：需求已证实，不是唯一赢家**。17.2 万视频与 Open-LLM-VTuber/AIRI 的开发生态支持其长线价值；但模型、表情、口型、语音链增加制作与调参成本。
3. **像素风：agent 状态助手的强开源信号**（clawd-on-desk 6,701★、Petdex 4,348★），本轮**没有同口径 B 站视频样本证明它比大肥鱼更火**。
4. **实时 3D/VRM：有成熟候选 AIRI，但本轮没有足够 B 站量化证据排名**。不要把 3D 质感透明视频误判成实时 3D，也不要把更重的技术当更高优先级。

## 三、房间与社区机制

### 1. 先分清四种“房间”

| 产品/机制 | 已有公开证据 | 不应混淆的边界 |
|---|---|---|
| [Grok Bot 官方公告](https://x.ai/news/introducing-grok-bot) | bots 可独立互发消息、在线程共享上下文；拉入 group chat 后协调、分派 ownership、移交工作，必要时找人判断。 | 这是**多个持久 bot 的任务群聊**，不等于把 subagent 日志堆成一页。公告未证明 bot 模板跨用户导入/分享；页脚 Marketplace 链接不是功能证据。 |
| [OpenAI dots 发布报道](https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/) | 持续 personal assistant；原话 **“Over time, we envision teams of Dots working together on your behalf.”** | teams 是愿景；未证实已交付“多 bot room”，也没有据此确认 bot 分享市场。不能补写“dots 的房间”。 |
| [OpenMausBot](https://github.com/milind-soni/OpenMausBot)；沿用本地 scout-b 已读 README 证据 | channel 自己的 transcript/目录/成员/responder rules；room 选一个 responder，可回落 lead；支持 reviewed Markdown team/department 包。 | **有 room 不等于全员轮流抢答**。此项不是本轮重跑产品验收。 |
| [SillyTavern group chats 官方文档](https://docs.sillytavern.app/usage/core-concepts/groupchats/) | Manual、Natural、List、Pooled 发言策略；名字提及与 talkativeness；Force Talk；自动回合；共享历史。 | 是**角色发言调度**，不自带工具执行、委派、成果验收。可学说话控制，不宜当 agent 协作后端。 |
| [duxingxiake3/dsh-project-room](https://github.com/duxingxiake3/dsh-project-room) | README：room 成员各落真实 session、默认 coordinator、@member/@Everyone、按成员路由模型、任务依赖/验收/版本、成员身份和房间先落事务、最终回复自动归房间、权限按 membership。 | **1★、最近 commit 2026-10-18、无 issue 样本**。只是作者功能声明，未跑验收；不能因 README 很全就推翻既定 L12 判据。 |
| dsh liveshare / agent-team | 现有本地 p9 计划：前者把**一个 session 分享给人**；后者在**单 session 内**管理 lead/队友/收件箱/任务板。 | neither 等同名册中多个独立顶层 bot 进入共同 room；“多人看一个会话”“内部 team”“多 bot 群聊”是三个产品。 |

### 2. 对照 Hivebot 已有 L12，而不是另起重构

本地锚点：
- `/home/lingxufeng/bot/work/p9-dsh-integration/PLAN.md:30`：**L12 Room 需自建产品胶水**；已有对 `dsh-project-room` 的同样降级判断。
- 同文件 `:42`：保留 P6 的独立顶层 bot + 主 bot 权威 + CONTRACT v1.5，不迁到单 session agent-team。
- `/home/lingxufeng/bot/work/p8-parity-full/SCOPE.md:32,164`：簇 8a / R-09 群聊，T-13、量级 L、优先 5；本轮不改变排期。

**建议的最小 room 语义（方案建议，不是当前已有）**：一个共享时间线 + member bot IDs + 默认主 bot 回答 + 用户显式 @ 目标；复用现有跨 bot 派发/回传。每条消息保留 roomId/messageId/sender bot/目标 turn；显式展示当前执行者和可跳转的工具/Computer。先不做全员自动自聊、跨用户实时共同编辑和 3D 空间。后续需防自激回声、重复投递、私聊串入房间、成员移除后续写、权限/审批被群聊文本冒充。引用房间消息不意味着获得另一 bot 的工具授权。

### 3. 社区实际有三层，别一步造社交平台

**A. dsh 插件分发层**
- [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)：**23,869★**、2026-11-09 commit、CC0-1.0（目录许可证，不覆盖被收录插件）；[awesome-dsh-plugin.com](https://awesome-dsh-plugin.com/) 是发现入口。
- [DSH Hub](https://dsh-hub.cc/)、[dsh-plugin.org](https://dsh-plugin.org/about)等是**社区站**，不假定官方背书；[sliverp/dsh-hub-plugin](https://github.com/sliverp/dsh-hub-plugin)把市场装入 DSH 设置页（19★）。[DSH 官方仓 Discussion #4997](https://github.com/deepseek-ai/deepseek-harness/discussions/4997)是社区市场发布渠道，不等于安全认证。
- 安装第三方插件是执行代码；“被市场收录/验证标记”与代码审计、我们审批体系不可互换。Hivebot 的独立 renderer 也不等于天然消费 DSH `shell.overlay` 插件。

**B. 桌宠素材/二创层**
- **Petdex 最直接可复用**：公共 manifest → 选宠 → 下载声明式资产包 → 导入本地；投稿/审核/作者主页/Discord（README 链接 `https://discord.gg/byhubdyBTe`）组成闭环。不是必须复制它的 Next.js/Postgres/用户系统。
- `dsh-pet` 提供 prompts + 绿幕到透明资产流程 + pet pack；`dsh-co-pet`也指向 codex-pet.org/Petdex，表明**格式兼容比自建图库更能接入现有供给**。
- B 站承担玩法展示、评论反馈、角色设定/形象约定；GitHub 承担版本、issue、PR。Open-LLM-VTuber 有 Discord/Zulip，AIRI 有 Discord/QQ 入口，但社群人数不是本轮已测数据。

**C. bot/团队模板层**
- Grok Bot 的 routine 可复用已确认；**跨用户 bot 一键分享市场、本次没证实**。dots 同样未证实，不把社区教程当官方市场。
- OpenMausBot 的 reviewed team 包是更靠谱借鉴：**导入模板 ≠ 启用 skills、连接器、routine 或授予执行权**（本地 scout-b 记录其导入默认关闭/暂停，组织包策略另算）。
- Hivebot 先做“人格/指令/模型引用 + 素材 + skill 引用清单”的可预览模板包；不导出密钥、绝对宿主路径、聊天历史、浏览器登录态。导入后连接器需重新绑定、定时默认暂停、权限不随包继承。云榜单、交易、关注关系与评论治理等到有真实分享量再做。

## 四、技术选型：按 stars 看热度，按维护与集成边界选依赖

### 1. 候选排序与活跃性核验

“近六个月”窗口从 **2026-05-09** 起；以下采用**实际默认分支 commit**，不是 `updated_at`（后者可能只是有人点星/提 issue）。项目要求还包括“issue 有人回应”，故单独标明。本轮只读 README/元数据，不宣称已做源码级审计或锁包试装。

| 候选（不同层级，stars 不代表可互换） | stars / 最近 commit | Electron 集成成熟度 | 维护判定与建议 |
|---|---|---|---|
| [moeru-ai/airi](https://github.com/moeru-ai/airi) | **51,230** / 2026-11-08 | 现有 Electron 桌面 `stage-tamagotchi`、Web 舞台；Live2D 和 VRM、共享 stage/renderer packages、语音/模型后端，MIT 主体。 | 高热度完整伴侣平台。见 [#3456](https://github.com/moeru-ai/airi/issues/3456) CONTRIBUTOR 回应；可作维护正向信号，仍需确认具体组件负责人。重于 MVP；以后需 Live2D/VRM/语音时优先做组件/依赖探针，**不整仓替换 Hivebot**。 |
| [Open-LLM-VTuber/Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | **14,651** / 2026-05-15 | 现成跨平台语音 + Live2D 桌宠产品；透明、置顶、穿透，Python 后端与前端。 | commit 尚在窗口内，但 v2 重写处讨论/规划期，v1 暂不接新功能请求；抽样 [#451](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/issues/451)无回复，**不据此宣称完全满足维护门槛**。GitHub license API `NOASSERTION`，README 称项目 MIT、模型另授；正式复用先逐文件核许可证。 |
| [clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) | **6,701** / 2026-11-09 | Electron 像素 agent 状态桌宠，场景贴合。 | AGPL-3.0；本轮未拿到 issue 维护者回应样本，**候选而非依赖定案**。 |
| [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) | **5,921** / 2026-11-09 | npm 插件 + 独立 Electron runtime，**对当前栈最省集成工作**；透明 WebM 比建模轻。 | [#329 事件](https://api.github.com/repos/PC2005-cloud/dsh-pet/issues/329/events)见 owner PC2005-cloud 于 11-08 实际关闭；这是维护处理证据，不冒称文字答复。若严格要求 issue 文字回应，依赖定案前补查。 |
| [Petdex](https://github.com/crafter-station/petdex) | **4,348** / 2026-10-10 | 资产/格式/分发层，不是透明窗引擎；Electron Canvas/CSS 可播放格式。 | 近六月 commit 合格；抽样评论为普通用户，维护者回应未核实。**先兼容格式，联网图库依赖另验**。 |
| [guansss/pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | **1,517** / **2023-12-15** | 老牌 PixiJS **v6** Live2D 封装，WebGL 可进 Electron renderer。 | **未满足近六个月 commit**！仓库 updated_at 为 2026 不能补救；不作为新项目默认依赖。 |
| [OpenPets](https://github.com/OpenPetsHQ/openpets) | **1,390** / 2026-11-08 | 独立 Electron 应用 + client/MCP/event SDK，MIT；旁挂现成应用比嵌入其整个运行时轻。 | commit/release 活跃；本轮 issue 样本不足以确认维护者回应。外接试用候选，不把 README 的 sandbox 当审计结论。 |
| [Panzer-Jack/easy-live2d](https://github.com/Panzer-Jack/easy-live2d) | **220** / 2026-09-24 | PixiJS **8**（README 测试 8.17.1）、Cubism 5 Web R5；motion/expression/hit/drag/voice API，MIT 封装。 | owner 亲回 [#51](https://github.com/Panzer-Jack/easy-live2d/issues/51)、[#50](https://github.com/Panzer-Jack/easy-live2d/issues/50)，**明确满足窗口 + issue 回应**。要轻量 Live2D 时的库级优先候选；Core/Framework/模型需分别遵守官方许可。 |
| [kirbystudy/chatgpt-desktopPet](https://github.com/kirbystudy/chatgpt-desktopPet) | **90** / **2023-09-02** | Electron + Live2D 早期 demo，BSD-2-Clause。 | 未满足维护窗口，**不拿老 GPT 桌宠 demo 当生产骨架**。精确 `GPT-Desktop-Pet` 检索没找到一个既大热又维护可靠的唯一“标准仓”。 |

另：`avgjs/pixi-live2d` **680★且 archived**，排除。`easy-live2d` 新版不可与旧 Cubism Core 混搭；README 明确旧 Core 需回退并固定 0.4.4。正式选库要锁定配套版本，不能“装 latest 后看能不能跑”。

### 2. 基于现有 Electron 的最短技术路线

**第一顺位不是 Live2D，而是复用可运行桌宠。** 先隔离环境探测 `dsh-pet` npm/独立模式能否接我们的 dsh Host；若原样可挂，不复制源码。若插件能起却只会加载它自己的桌面壳，评估作为独立 companion 的生命周期；避免同时带两份 Electron。不直接将 DSH WebUI 插件入口当作 renderer-grok 扩展 API。

必须自己加窗口时：现有 Electron 新增单个本地透明置顶 pet renderer，复用透明 WebM 或 Petdex 精灵格式；动画由已有会话/审批状态推导。动作先限 idle / thinking / working / approval / success / error；点击返回指定 bot，拖动，通知静音/隐藏。**不重建聊天、记忆、MCP、定时或 agent runtime**。

本地具体集成锚点与必须保留的边界：
- `/home/lingxufeng/bot/app/ui/main/window.ts:67-100` 已有 BrowserWindow、安全偏好与导航限制；目前是正常主窗，**没有桌宠窗**。
- `/home/lingxufeng/bot/app/ui/main/m2-mux/index.ts:1-15` 已有 `$events` 常驻与 session/follow，能提供事件来源；但不是现成 pet API。
- `/home/lingxufeng/bot/app/ui/main/sender.ts:9-20` **特权 IPC 只认主窗口主 frame**。新 pet 窗不能为了复用而放宽全局 sender 校验；只给受限“订阅脱敏状态/点击定位”通道，不能拿到主聊天工具调用、审批代答或 SDK socket。
- `dsh-pet` README 的 HTTP 面写明 loopback **无鉴权**；本地监听不等于可信。不要让它看到提示词/审批信息/凭证；优先只传脱敏状态、用进程内/受限 IPC。该点是文档已知约束，未据此完成漏洞验证。
- 多屏 DPI、Linux X11/Wayland 的透明/穿透/置顶、无显示环境、销毁/重连/多 bot 归属需隔离验收；Wayland 原生策略可能拒绝绝对定位/置顶，不能承诺三端体验完全一致。装饰动画可以暂停，**审批本身不能因桌宠睡觉而丢失**。
- 素材 zip 要限大小/帧数/类型、防路径穿越、拒绝脚本，URL 下载需限制重定向/内网地址；带作者/许可证/来源 hash。不执行“宠物包”的任意 JS。

### 3. 许可证不是“一份 MIT”

`dsh-pet` README 明确：大肥鱼为社区二创，非 DeepSeek 官方形象；原型“溟月”来自上善无形，DeepSeek 女仆鲸鱼娘设计来自 ZipZipPipe，形象 **CC BY-NC-SA 4.0**，公开衍生项目要附原作者地址。[形象授权声明](https://www.bilibili.com/opus/1247156596114456581)。本项目私用规则允许研究/复用，但**将来 Hivebot 对外分发，不能把这些资产跟 MIT 代码一起当成可商业化素材**。Petdex 每个包授权不同；Live2D Core、模型、音色/克隆声音也分别审。最省事的公开演示包是自有原创 Hivebot 形象，不是先移除来源声明。

### Hivebot 切入建议

下列为单工程师、复用现有 backend/审批/会话体系的**粗量级估计**，不含原创美术/语音训练/跨平台签名发布；不是工期承诺，不改变已有排期。

| 方向 | 复用什么 | 最少新增什么 | 量级 / 延后什么 |
|---|---|---|---|
| **桌宠** | 首选 `dsh-pet` 已有 npm/独立模式；备用 Petdex 格式 + 当前 Electron + M2 状态 | 先 **0.5–1 人日兼容探针**；可原样挂则只做配置、生命周期、bot 归属；否则一个受限本地 pet 窗 + 6 状态 + 点回聊天 | **3–5 人日可用 MVP，1–2 周做多屏/透明/重连验收**。先不做新 LLM、Live2D 建模、实时 3D、多人联机养宠。 |
| **房间** | P6 bot 名册/跨 bot 派发回传、现有 timeline/审批；借 Grok group ownership 和 SillyTavern 发言控制 | room 成员/共享时间线、@点名、默认主 bot、执行者归属/跳转、去重/限回合/退出语义 | **1–2 周窄 MVP**；原版级自动多 bot 协作另按 **2–4 周以上**核算。先不把 agent-team 替换顶层 bot，也不做 3D 房间。 |
| **社区** | Petdex 资产格式/公共目录、GitHub Releases/PR/Discussions、现有 bot/skill 配置 | 本地模板导出/导入与预览、授权清单、去密钥；定时/技能/连接器默认不自动启用 | **3–5 人日做安全本地分享闭环**，外部目录浏览再加 **2–3 人日**。先不自建账号、评论、支付/榜单/推荐系统；分享量出来再考虑独立社区。 |

**优先级建议**：先做“会替 bot 干活报状态、可点回聊天”的可玩桌宠，最快贴近本轮用户点名的热潮；Room 继续 L12 小步产品胶水；社区先兼容现有格式与文件分享，不先造平台。

检索口径：GitHub MCP `dsh pet`、`deepseek pet`、`desktop pet agent`、`live2d desktop pet`、`pixi-live2d`、`GPT-Desktop-Pet`、`LLM Live2D`（stars 降序）；GitHub API README/默认分支 commits/issues/comments/events/releases；WebSearch `dsh 桌宠 桌面宠物 B站`、`AI 桌宠 Live2D B站 Open LLM VTuber`、`AI桌宠 哔哩哔哩 Live2D`、`dsh 大肥鱼 播放` 与 dsh 社区市场查询。若干 site 限定查询未返回结果、GitHub WebFetch 多次 504，改用 gh API；不把搜索失败写成项目不存在。报告正文所列链接即所用 Sources；未 clone/深读参考仓源码，未改 `repos/MANIFEST.tsv`。
