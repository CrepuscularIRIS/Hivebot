# S-5 · Claude Cowork 产品机制与 p6 借鉴

调研日：2026-11-03（现场时钟 21:32 -05:00；npm 时间为 UTC，可能显示 11-04）。范围：产品事实、交互机制、复用候选；不修改产品代码、不代 director 改方案。

## 结论先行

1. 用户说的「Claude Coworker」最可能指官方 **Claude Cowork**，不是一个叫 Coworker 的独立多 agent 产品。官方当前产品页写 **“Claude Cowork is now just Claude”**，说明正合入统一 Claude 体验；部分账号仍显示 Cowork 与 Chat 并列。不能只用早期「Desktop 专属」介绍描述当前产品。[A][B]
2. 最值得借的不是「让每个 worker 成为永久侧栏联系人」，而是 **交代目标 → 看计划/进度 → 仅关键点介入 → 收到可用成果**。官方证实并行子任务、过程可查看、可纠偏/停止；**没有证实 Cowork 默认隐藏每个子 agent、可 pin 到侧栏、可单独聊天或独立接管每个子 agent**。[A][B]
3. 「worker 默认不占一等 bot 列表，按需展开/提升可见性」可以作为 p6 建议，但须标注为**我们的组合设计**：Cowork 的任务监督 + Claude Code 的 agent panel + 现有 Grok bot 导航，不能冒称 Cowork 原样机制。[A][B][C]
4. 不换 dsh、不引入另一套桌面 runtime。优先改造现有 G18 导航/过程行；新找到的 OpenCoworkAI 进度卡仅作可选源代码参照。隐藏必须只是投影，不是停止、删除或取消通知。

## 1. 产品定位与名词边界

| 名词 | 已核实定位 | 不应混淆 |
|---|---|---|
| Claude Cowork | 面向知识工作的 agentic 工作方式：处理文件、研究、表格、文档、演示等多步任务；与 Claude Code 使用相同的 agentic approach。当前官方文档涵盖 web / desktop / mobile，cloud 工作可继续，依赖本机资源的步骤仍需桌面在线。[A][B] | 不等于 Claude Code agent teams；不能从「相同方法」推导内部协议/消息/权限完全相同 |
| Claude Code subagents | 主会话委派，独立上下文，结果返回调用者；适合聚焦任务。当前 teams 对照文档还提及具名 subagent 的消息能力，故不能武断说所有 subagent 永远不能互相通信。[C] | 不是每个都必须成为持久、一等用户会话 |
| Claude Code agent teams | 实验功能，默认关闭；lead + 独立 teammate 会话 + 消息 +（有 Task 工具时）共享任务清单；能直接向 teammate 发消息，有 agent panel / split panes。[C] | 这是 Code 的交互，不能标为 Cowork 截图或 Cowork 行为；当前文档还明确 non-interactive / Agent SDK 不 spawn teammates |
| Claude Research 多 agent 系统 | Anthropic 工程文章描述 lead researcher 委派并行探索、汇总、加引用。[D] | 文章不提 Cowork；仅作设计参考，不能作为 Cowork 实现证据 |
| GitHub open-cowork / open-claude-cowork | 第三方开源桌面产品，非 Anthropic 官方 Cowork 源码。[F][G] | 名字相近不代表 UI/行为与官方一致 |

原始发布日期本轮**未可靠核定**。旧 anthropic.com/news/cowork 与 /news/cowork-research-preview 返回 404；claude.com/blog/cowork-research-preview 返回的内容已是当前产品页式文案，不能据此重建首发 UI。以下以当前官方页面为事实基线。

## 2. 官方 Cowork 核心交互与可见性：证据到哪里就说到哪里

| 维度 | 官方已证实 | 本轮未验证 |
|---|---|---|
| 开始工作 | 描述期望结果，检查 Claude 的 approach/plan，再让它执行。[B] | 所有任务是否必需显式点一次计划确认；不可把可选权限配置写成强制流程 |
| 并行 | 大项目可拆成同时运行的部分；复杂任务可以协调多个 subagents 和工具调用。[A][B] | 每个子 agent 的独立上下文、调度队列、并发上限、是否独立 session |
| 默认监督 | 有逐步进度，能查看涉及的文件、工具、决策/处理思路；用户不必逐条发指令。[A][B] | 子 agent 名册是否默认展示；某一行是否默认收起；不可把官方“reasoning/approach”解释为提供模型原始隐藏思维链 |
| 侧栏/面板 | [B] 明确左侧 **Scheduled** 用于计划任务；[A] 的 **side panel** 有内置浏览器。[A][B] | 这两者都不能证明存在「每个 worker 一个侧栏 bot」或「右侧 agent roster」 |
| 展开 | 官方允许监督工作过程。[A][B] | 展开按钮、卡片层级、工具细节和子 agent transcript 的具体视觉结构，需真实 UI 核验 |
| 人介入 | 可以中断、补充指示、重定向、停止，也可从另一设备继续监督/回答问题。[A][B] | 人能否直接给某个 Cowork 子 agent 发消息，或无缝接管某个子 agent 的执行上下文 |
| 成果 | 完成的文件可在 session 预览/下载；Markdown 草稿可选中局部并 “Edit with Claude”；单个 artifact 可分享，不能由此推导整个 session 可分享。[B] | 每个子 agent 是否各有成果区；子 agent 失败是否自动重试/保留固定卡片 |
| 权限 | 有 Manual / Auto / Skip；永久删除需要显式 Allow。官方强调专用工作目录、敏感操作手动批准、监视越界。[B][E] | 不把官方 Skip 或默认值复制成 p6 授权策略；p6 现有 guard/审批约束不变 |

**可下的产品判断**：Cowork 的监督单位主要是「委托的工作与成果」，并不是在现有资料里可证实的「永久 agent 联系人」。少打扰不等于完全无进度，后台运行不等于不可访问，查看过程不等于逐步审批。[A][B][E]

## 3. 可借鉴机制清单（来源机制 → p6 可借点）

以下右列均为建议，不是已获用户批准的规格，也不是声称官方已实现全部右列行为。

| # | 来源机制与证据 | 对 p6 的具体借鉴 | 最小落点 / 边界 |
|---|---|---|---|
| M1 | Cowork：用户给 outcome，Claude 展示 approach 后执行。[B] | 主 bot ack 写「收到 + 如何拆分 + 预期交付」，以任务名而非模型/进程名标 worker | 沿用三段式；低风险任务不新增每次计划审批 |
| M2 | Cowork：并行研究/起草/组织，过程可监督。[A][B] | 主 bot 不等待 worker；主视图只保留一句任务进度入口，具体过程进 worker | 复用 p6 D5/D6；不为了视觉换编排底座 |
| M3 | Code panel：工作中/失败/正在查看的 agent 保持独立行；大量 idle 行可聚合；全 idle 后行可隐藏，仍可寻址。[C] | 默认不把临时 worker 混进永久 bot 列表；主 bot 下提供可展开「工作中 N / 需你处理 N」；隐藏不改变运行和寻址 | **来自 Code，不是 Cowork**。可见性是 view projection；不要靠 stop/delete 实现收起 |
| M4 | Code panel：Enter 查看 transcript 并直接消息；split panes 可同时查看多人。[C] | 点 worker 打开既有 transcript；「显示到侧栏」是常驻入口，不再创建第二个 worker | 具体 pin/提升动作是 p6 自己的设计，官方 Cowork 未验证；复用同一 sessionId |
| M5 | OpenCoworkAI：一张子 agent 卡头显示任务、运行/成功/失败、耗时；展开是工具活动与错误；结果另外折叠。[F1] | 中间过程不刷气泡，但有真实运行态；展开看工具，不展示伪百分比；失败收起态仍有可读原因 | 尽量复用 G18 tool-call/thinking 行；不是要求再加一套卡片 |
| M6 | OpenCoworkAI：`parentSessionId + subagentId` 绑定进度事件，再按 parent 过滤。[F2][F3] | 同一 worker 的状态事件归属于同一个主 bot 任务入口，避免串会话 | 复用现有会话关联数据；需持久关系时由 main 元数据管理，不照搬 hook 的内存 Map |
| M7 | Cowork：可纠偏、停止；安全指南建议对敏感/不可逆动作手动批准。[B][E] | 平时收起，审批/提问/失败自动显著；主 bot 一条「谁在等你、等什么」+ 跳转 | 沿用 D8 与既有审批/提问卡；父 bot 的转述不算人的授权 |
| M8 | dsh Superagent：监督面板先回答「需要我吗」，再健康，最后历史；即时动作优先，细节折叠。[H] | 需人项优先于 running 数量，不能把等待用户伪装成仍在努力的 spinner | 无须照搬 Source/Eval/Ticket 全领域模型 |
| M9 | Cowork：交付可预览/下载文件，支持局部继续编辑。[B] | 主 bot 给结果摘要 + 成果/worker 链接；用户进 worker 可继续细化，不必重贴上下文 | 首批只沿用现有文件/链接；不要在本任务新造 artifact 平台 |
| M10 | Research 工程文章：输出可存外部存储，向协调者交轻量引用，减少多轮转述丢信息。[D] | worker 大报告直接落成果，通知只传摘要/引用；主 bot 汇总附原始证据入口 | 这是 Research 的工程建议，不是 Cowork UI 已验证行为；仍须防 worker 文本注入 |
| M11 | Code：自动完成/失败通知，lead 不必轮询。[C] | 完成、失败、阻塞有事件；主 bot 忙时排队，不能用 UI 是否打开决定通知 | p6 已有 D5/D8 方向，S-5 不另建消息系统 |

**不照搬的具体反例**：[F2] completed/failed 都在 5 秒后从 tracker 内存移除；这会让晚回来看的人错过失败，不能拿它当 p6 历史/成果保存策略。[F1] `expanded` 初始化为 `status === 'running'`，不是「所有运行 worker 默认折叠」，也没有在 completed 时自动 setExpanded(false)。若宣传默认折叠，必须改代码，而非只改文案。

## 4. Harness 人机接力点：什么时候给人看什么

| 时机 | 给人看的最小内容 | 人可做什么 | 来源 / 设计边界 |
|---|---|---|---|
| 受理 | 收到、工作范围、预期成果，必要时问一个缺失条件 | 纠正目标/缩小范围 | [B]；不新增无条件计划闸门 |
| 已委派 | 任务名、worker 入口、真实 running 状态 | 继续聊别的，按需查看 | [A][B] + [C] 的可查看 agent；后台与可见性独立 |
| 正常执行 | 少量过程摘要/工具状态，默认不推每条中间正文 | 展开过程；到 worker 对话页补充/停止 | 后半能力借 [C]，不是 Cowork 子 agent 已验证能力 |
| 需人决策 | 点名 worker、请求内容、风险/阻塞原因、原审批入口 | 人亲自在原入口批准/拒绝/回答 | [B][E][H]；不能由主 bot 代称用户已同意 |
| 失败/中断 | 明确终态、原因、已产生什么、下一步入口 | 改目标或决定是否重试 | [F1] 状态可见思路；不自动把失败卡隐藏、不把 turn/end 一律当成功 |
| 完成 | 简短结果、可打开的成果与来源、worker 链接 | 验收、下载、继续修改、按需提升侧栏可见性 | [B]；提升侧栏是 p6 建议 |
| 很久后返回/重启 | 可追溯成果与终态；隐藏 worker 仍能从任务入口找回 | 重新打开/继续，而不是再派同一活 | [C] 的隐藏≠停止可借；持久恢复属于 p6 自身验收，不能宣称 Code teams 已解决（其文档有 resume 限制） |

## 5. 搬运阶梯与候选比较（决策行）

先查本地 `repos/MANIFEST.tsv`、`work/p4-ui/REUSE.md`、`work/p5-parity/REUSE.md`、p6 BRIEF，以及 dsh Superagent panel。后查 GitHub 两个同类候选的 LICENSE、源码、commit/release 与 npm。**本轮只决定可借机制与可选出处，不授权重写/切换 p6 底座。**

| 能力 | 候选（owner/repo@path 或 npm） | 阶梯级别（1～5） | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| p6 worker 默认收起、按需查看 | 已在本地的 `b-nnett/grok-bot-0.18-reconstructed@a9f633e:frontend/src/recovered/features/conversation/` 的 sidebar/transcript；参照本仓 BRIEF §2.2、§2.3 | 3 | 无独立 LICENSE，非官方重构；私用 | 快照 2026-08-23；不是持续上游依赖 | **改造**（首选） | p6 已在 G18 移植树上；先用已有导航、thinking/tool-call 折叠和 worker transcript，增可见性投影/分组即可，不再引一套 Cowork 壳。此轮没有重做该树源码审计，具体搬码清单沿用 S-4/P5-51，适配工时未实测 |
| 独立子 agent 生命周期进度卡 | `OpenCoworkAI/open-cowork@e94ee2c50239e64ba0e18921e339d49b93dae31f:src/renderer/components/{SubagentProgress.tsx,SubagentTracker.tsx}` 与 `hooks/useSubagentProgress.ts` | 3 | MIT，已读 LICENSE | commit 2026-10-20；release v3.3.1 2026-05-23；issue #377 2026-10-13 COLLABORATOR 人工回应，满足维护判断 [F4] | **改造**（备选，不立即搬） | npm `open-cowork` E404，非组件包；整仓连带 Electron / pi runtime / config / IPC，不适合嵌入既有 dsh/G18。真需要卡片时只改造展示文件与事件映射，移除其短时清理策略，补本项目 ARIA/样式；未在目标宿主 boot，不能声称可直接跑 |
| 另一套 Cowork 桌面壳 | `composio-community/open-claude-cowork@52335ef50fd033cb5ce87068be0b5b546fa5b73d:preload.js,package.json` | 3 | LICENSE=MIT；package.json 却写 ISC，出处不一致需记录 [G] | commit 2026-05-03（六个月边界）；issue 人工响应、release 未验证，不认定满足第 1/2 级 | **改造**（候选不选） | npm 同名 E404；preload 只有 sendMessage/stopQuery/getProviders，且单个 currentAbortController 在发新请求时取消旧请求，不能直接提供我们要的多 worker 监督。这里不是断言整个服务端绝无多 agent；仅已读接口不足，整壳成本明显高于现有树 |
| 官方 Cowork 的确切 worker 侧栏/接管规则 | 官方闭源 Claude 产品，目标 https://claude.com/product/cowork | 4 | 专有产品 | 活跃产品文档，非开源 commit/release | **逆向**（只有需要像素/行为对齐时） | 公开文档未说明 worker pin/展开/单独对话。不能用第三方 clone 代替实物证据；建议 REA 问题见 §6。本轮不自行启动逆向 |

第 1/2 级排查：两开源候选没有核到可直接安装的同名 npm 包；OpenCoworkAI 的 package.json 是整桌面 app，不是导出进度组件的库。[F][G] `@anthropic-ai/claude-agent-sdk` 确实有 npm 发布（现场 version 0.3.318 / modified 2026-11-04T00:02:24Z），但它不是 Cowork UI 包；更换既有 dsh runtime 不能解决本任务的 worker 可见性，所以不选。**未得出“GitHub 上完全没有可用组件”的结论，也不提出第 5 级自建整套面板。**

值得深读的 OpenCoworkAI 仓已 depth-1 sparse clone 到 `/home/lingxufeng/bot/repos/OpenCoworkAI__open-cowork`，并追加 MANIFEST。未安装依赖、未运行仓内脚本。

## 6. 对当前 p6 文档的提醒与待证问题

- 现场 BRIEF:30、:93、:150 仍以「默认侧栏可见」为前提；此次派发输入明确语境为「worker 默认不可见，可像 coworker 展示到侧栏」。这是**产品输入与旧方案前提的冲突**，不能当成 UI 皮肤调整：若采默认隐藏，原先“不做 bot_status/read_bot，因为侧栏可见”的排除理由必须重审。是否需工具仍由 S-2/导演判断，S-5 不擅自加回。
- 最小安全路径：worker 不占永久列表，但主 bot 任务入口始终可找回；审批/失败不能静默；用户选择「显示到侧栏」后打开**同一 session**。这不要求把 worker 全部改成 agent teams。
- 若派 reverse-engineer，目标为官方当前 Cowork（记录客户端版本、平台、账号 rollout 状态），只问三件：①一个并行任务里 subagents 默认究竟在哪显示，点击能否看各自 transcript；②有无“提升到侧栏/独立会话”，该操作是否创建/复用 session；③审批、纠偏、停止分别作用于整体任务还是某个 worker，完成后入口保留在哪里。无可用授权实物就标未验证，不触碰凭证。
- 没有官方实物截图/浏览器操作证据；本报告不能作为 Cowork 像素复刻规格。WebSearch 两次返回不可检索、一次返回聚合 changelog；未用聚合页支撑核心结论，以成功获取的官方页面和 GitHub 源码为准。

## 7. 证据索引 / Sources

- [A] 官方产品页：https://claude.com/product/cowork （定位、统一体验 rollout、并行、监督与停止；动态页面，不当历史首发资料）。
- [B] 官方帮助：https://support.claude.com/en/articles/13345190-getting-started-with-cowork （工作流程、进度、干预、跨平台、文件成果、审批）。
- [C] 官方 Code agent teams 文档：https://code.claude.com/docs/en/agent-teams ，重点 `#compare-with-subagents`、`#start-your-first-agent-team`、`#choose-a-display-mode`、`#talk-to-teammates-directly`、`#permissions`、`#limitations`。当前页面为滚动文档，具体 idle 30 秒/超过三行聚合等属于当次抓取版本，不应硬编码进 p6。
- [D] Anthropic 工程博客：https://www.anthropic.com/engineering/multi-agent-research-system （orchestrator-worker、并行与 artifact 引用；不是 Cowork 行为证据）。
- [E] 官方安全指南：https://support.claude.com/en/articles/13364135-using-cowork-safely （监督、专用目录、注入风险、审批与删除）。
- [F] OpenCoworkAI LICENSE / package：https://github.com/OpenCoworkAI/open-cowork/blob/e94ee2c50239e64ba0e18921e339d49b93dae31f/LICENSE ，同 SHA `/package.json`；本地同仓根目录。
- [F1] 进度卡：https://github.com/OpenCoworkAI/open-cowork/blob/e94ee2c50239e64ba0e18921e339d49b93dae31f/src/renderer/components/SubagentProgress.tsx#L28-L38 （初始展开）、#L50-L98（头部）、#L100-L164（展开/结果）；本地同路径同源行号。
- [F2] 事件 hook：https://github.com/OpenCoworkAI/open-cowork/blob/e94ee2c50239e64ba0e18921e339d49b93dae31f/src/renderer/hooks/useSubagentProgress.ts#L18-L29 （关联状态）、#L117-L157（5 秒移除）、#L184-L203（按 parent 过滤）。
- [F3] Tracker：https://github.com/OpenCoworkAI/open-cowork/blob/e94ee2c50239e64ba0e18921e339d49b93dae31f/src/renderer/components/SubagentTracker.tsx#L1-L20 （明确 inline chat，不是侧栏）；后端 `src/main/agent/subagent-extension.ts:60-72,85-93,114-119`（focused task/事件 envelope；当前使用 pi-coding-agent，不能凭 README 当成纯 Claude SDK 包）。
- [F4] 维护：https://github.com/OpenCoworkAI/open-cowork/commit/e94ee2c50239e64ba0e18921e339d49b93dae31f ；https://github.com/OpenCoworkAI/open-cowork/releases/tag/v3.3.1 ；https://github.com/OpenCoworkAI/open-cowork/issues/377#issuecomment-6144028473 （人工回应，与 bot 回复分开核实）。
- [G] 第二候选：https://github.com/composio-community/open-claude-cowork/blob/52335ef50fd033cb5ce87068be0b5b546fa5b73d/preload.js ，同 SHA `/package.json`、`/LICENSE`；维护 commit：https://github.com/composio-community/open-claude-cowork/commit/52335ef50fd033cb5ce87068be0b5b546fa5b73d 。
- [H] 本地已有 Superagent 监督原则：`/home/lingxufeng/bot/repos/dsh-superagent-prototype/docs/005-panel.md:3-11,26-32,50-58`；上游 https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc8/docs/005-panel.md 。
- 本地方案/复用基线：`/home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:27-30,40-61,91-95,149-150`；`/home/lingxufeng/bot/work/p4-ui/REUSE.md:14-15`；`/home/lingxufeng/bot/work/p5-parity/REUSE.md:21-24`；`/home/lingxufeng/bot/repos/MANIFEST.tsv`。
- npm 核查：`npm view open-cowork version time.modified repository --json` 与 `npm view open-claude-cowork ...` 均 E404；`npm view @anthropic-ai/claude-agent-sdk ...` 成功。未安装这些包。
