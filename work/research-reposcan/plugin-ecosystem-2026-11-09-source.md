截至 2026 年 11 月 9 日，我查到了 DeepSeek Harness（DSH）的官方 GitHub、社区精选仓库、插件市场、安装验证榜和第三方推荐清单。

先说结论：DSH 已经有大量值得关注的插件，但“官方公众号收录”“社区推荐”“真实安装验证”是三种不同的证据，不能混为一谈。

目前有两个重要发现：

- 官方来源：DSH 官方 GitHub 明确提供 `dsh-plugin` 社区插件发现入口，但没有在 README 中公布一份完整的官方认证优质插件名单。

  [image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

  GitHub

- 公众号线索：`dsh-TUI` 在多个社区清单中被标注为“DSH 官方公众号收录”，但我尚未找到可直接核验的公众号原文，因此暂时只能确认社区存在这一记录，不能将其表述为官方质量认证。

  [image](https://www.google.com/s2/favicons?domain=https://dpharness.com\&sz=32)

  DSH plugin: install & compatibility+1



第三方 DSH 插件库已收录数万个项目，而 2026 年 11 月版的分类精选榜列出 105 个入选项目。下面按实际用途整理，并区分重点推荐和扩展备选。

[image](https://www.google.com/s2/favicons?domain=https://dpharness.com\&sz=32)

按用途分类（每个小类只留 2\~3 个）+1



## 一、社区人工精选的 50 个插件及资源

来源：[Awesome DSH Plugins 人工精选清单](https://github.com/GordenSun/awesome-dsh-plugins?utm_source=chatgpt.com)。该项目明确采用功能价值、安装方式、文档完整性和维护状态作为筛选条件，而不仅看 GitHub Star。这 50 项包含插件、客户端和少量学习资源；以下是清单完整覆盖，不代表我已逐个进行运行测试。

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub



### 1. 视觉与多模态（2）

| 插件                 | 主要作用                     |
| ------------------ | ------------------------ |
| modlens            | 为文本模型接入 OCR、图片理解和结构化视觉证据 |
| dsh-vision-toolkit | 图片问答、长截图 OCR、UI 还原、像素级定位 |

### 2. Web UI 与创作（8）

| 插件                 | 主要作用                    |
| ------------------ | ----------------------- |
| dsh-web-ui         | 工作台增强合集，包含任务板、Git、远程访问等 |
| DSH-better-sidebar | 文件管理、编辑器、终端、Git、子代理侧栏   |
| dsh-visualize      | 对话里生成交互式 HTML 可视化卡片     |
| dsh-genui          | 在回复中渲染图表、表单、Mermaid 等   |
| dsh-at-file        | 通过 `@file` 引用工作区文件      |
| dsh-annotation     | 对 AI 回复进行选区批注与逐条反馈      |
| dsh-openpencil     | 让 Agent 操作可编辑的设计画布      |
| dsh-web-review     | 点选网页元素提出修改意见并交给 Agent   |

### 3. 终端与桌面（4）

| 插件              | 主要作用                               |
| --------------- | ---------------------------------- |
| dsh-TUI         | Claude Code 风格全屏终端，支持状态监控、上下文显示和回滚 |
| dsh-tianshu-tui | 增强终端界面，加入 TDD 和验证工作流               |
| oh-dsh          | 集成 DSH 运行时的社区桌面发行版                 |
| dsh-launcher    | Windows 轻量启动器                      |

### 4. Agent、工作流与长期记忆（12）

| 插件                | 主要作用                   |
| ----------------- | ---------------------- |
| dsh-agent-teams   | 多 Agent 团队协作、任务分派和成员通信 |
| dsh_workflow      | 可持久化、恢复及治理的 Agent 工作流  |
| dsh-memory-evolve | 跨会话记忆和技能演化             |
| dsh-mnemon        | 分层长期记忆、项目档案和检索         |
| dsh-sidechain     | 临时分支对话和侧问              |
| dsh-turn-rewind   | 同时回退会话与工作区文件           |
| allinluna         | 资源感知的多 Agent 任务拆解      |
| distill           | 从执行经验中自动提炼可复用技能        |
| dsh-automation    | 定时启动 Agent 任务          |
| dsh-deep-research | 多步骤深度研究与证据审查           |
| dsh-sentinel      | 文件、HTTP、命令等条件触发 Agent  |
| dsh-message-edit  | 历史消息修改、重试与版本记录         |

### 5. 浏览器与电脑控制（4）

| 插件                | 主要作用             |
| ----------------- | ---------------- |
| dsh-browser       | 控制已登录的 Chrome 页面 |
| browser-bridge    | 将真实浏览器连接给 Agent  |
| dsh-computer-use  | macOS 桌面自动操作     |
| dsh-record-replay | 录制并复用 macOS 操作流程 |

### 6. 搜索、内容和数据（5）

| 插件                | 主要作用                    |
| ----------------- | ----------------------- |
| modsearch         | 网页及 X 平台搜索，返回结构化结果      |
| argo              | 多语言搜索与证据核验              |
| dsh-openbiliclaw  | B站、小红书、抖音等内容平台发现与研究     |
| dsh-data-agent    | MySQL、PostgreSQL 等数据库分析 |
| dsh-plugin-mineru | PDF、Office 文件等文档解析      |

### 7. 插件开发与生态基础设施（7）

| 插件或资源              | 主要作用                      |
| ------------------ | ------------------------- |
| plugin-registry    | 查看和管理插件层及运行状态             |
| dsh-find-plugins   | 直接用自然语言搜索适合的 DSH 插件       |
| dsh-plugin-check   | 插件清单、构建方式和兼容性静态检查         |
| dsh-toolkit        | 时间、JSON、CSV、计算器、Diff 等工具集 |
| dsh-custom-tool    | 创建自定义 JavaScript 工具       |
| dsh-security-audit | 本机配置、权限、插件来源和网络暴露面审查      |
| dsh-handbook       | DSH 教程和开发手册，属于学习资源而非运行插件  |

### 8. 集成、通知与迁移（5）

| 插件                 | 主要作用                          |
| ------------------ | ----------------------------- |
| dsh-open-in-vscode | 从 DSH 打开 VS Code 工作区          |
| dsh-notification   | 任务完成、失败或等待时发送桌面通知             |
| dsh-interconnect   | 跨 DSH 实例的会话和事件交接              |
| dsh-chat-import    | 从 Claude Code、Codex 等工具迁移历史会话 |
| dsh-worktree       | Git worktree 隔离与多会话开发         |

### 9. 主题、桌宠与分享（3）

| 插件             | 主要作用     |
| -------------- | -------- |
| dsh-deep-whale | 鲸鱼娘界面主题  |
| whale-girl     | 可交互的鲸鱼桌宠 |
| dsh-share      | 将对话导出为图片 |

这 50 项中，加粗的是我认为更值得优先评估的项目，依据是其对实际工作能力的提升，而不是单纯的热度。

## 二、2026 年 11 月分类精选榜：全部 105 项

来源：[DSH 插件分类精选榜](https://dpharness.com/best?utm_source=chatgpt.com)。

该榜单截至 11 月 1 日列出 105 项，使用安装检查、实装验证、下载量、综合分等指标筛选；每月重新计算。这里保留与前面 50 项重复的名称，以确保完整覆盖这期榜单。

注意：入榜不等于每个插件都达到同样的质量水平。 某些小类第二、第三名的社区验证程度仍较弱。此外，榜单的部分分类并不精准，例如把侧边栏插件划入“浏览器”大类。

[image](https://www.google.com/s2/favicons?domain=https://dpharness.com\&sz=32)

按用途分类（每个小类只留 2\~3 个）



以下使用安装目标名称或源码仓库标识，方便直接检索。

1\. 市场、管理与基础配置（18）

`dshmarket`、`dsh-plugin`、`dsh-plugin-marketplace`、`@noob-stupid/dsh-plugin-console`、`dsh-skill-hub`、`dsh-update-checker`、`dsh-mnemon`、`meow-memory`、`dsh-prompt-manager`、`dsh-synapse`、`@anionex/dsh-turn-rewind`、`@mlgbnb/dsh-archive-manager`、`@michengai/dsh-codex-ui`、`dsh-plugin-wallpaper-engine`、`dsh-skin-market`、`dsh-connect-workbuddy`、`dsh-mcp-connector`、`dsh-pocket`。

2\. 视觉、绘图与图表（9）

`@liustack/modlens`、`@anionex/dsh-vision-toolkit`、`dsh-tool-vision`、`dsh-image-gen`、`dsh-draw`、`dsh-roleplay`、`@nagi-ovo/dsh-visualize`、`a2ui-render-in-dsh`、`Devin-AXIS/deepseek-design`。

3\. 浏览器、侧栏与移动界面（14）

`dsh-ego-browser`、`dsh-browser`、`dsh-playwright-browser`、`dsh-builtin-browser`、`dsh-browser-control`、`open-web-bridge`、`dsh-better-sidebar`、`dsh-context`、`dsh-video-preview`、`dsh-flowglass`、`@ccteam/ccteam-ui`、`Hotsteel2901/dsh-client-ui-mobile-adapt`、`dsh-plugin-qr-connect`、`dsh-ui-mobile`。

4\. 平台集成、消息通信和远程访问（9）

`@xmanrui/dsh-im`、`@tencent-connect/dsh-qqbot`、`dsh-wechat`、`@wenbin_wb/dsh-bridge`、`dsh-web-remote`、`dsh-mobile-remote`、`dsh-whale-widget`、`dsh-status-rotator`、`whale-girl`。

5\. UI、主题、桌宠、成本及客户端（18）

`dsh-dream-skin`、`dsh-bloom-theme`、`dsh-theme-endfield`、`dsh-mpkg-wallpaper`、`dsh-wallpaper_share`、`dsh-plugin-harness-whale`、`dsh-dafeiyu`、`dsh-whale-girl-pet`、`dsh-plugin-pet`、`tokentracker-cli`、`dsh-client-ui-cpa-quota`、`dsh-personal-center`、`dsh-native-launcher`、`bruc3van/dsh-desktop`、`baihejiangnan/deepseek-harness-desktop`、`meow-smooth`、`dsh-mobile-hanui`、`kelai141/dsh-mobile-apk`。

6\. 对话、记忆、上下文和 Agent 工具（16）

`stratagate-dsh`、`sage-mem`、`dsh-memento`、`misakanet`、`dsh-pentester`、`task-passport`、`GengDaPeng/dsh-agent-message`、`dsh-budget`、`dsh-argp`、`mosaic-memory-compress`、`ZSeven-W/dsh-android`、`dsh-codex-oauth`、`dsh-chatgpt-bridge`、`dsh-chat-import`、`dsh-claude-move`、`dsh-side-chat-plus`。

7\. 桌面端、任务面板及输入增强（8）

`turtle2209/Bigfish`、`MichengAI/dsh-codex-desktop`、`web-casa/DeepSeek-Harness-Desktop`、`dsh-pet`、`dsh-token-pet`、`@sunjuntao/dsh-prompt-library`、`chuspeeism/dashi-taskboard`、`dsh-drop-in`。

8\. 工具与效率（3）

`liguobao/ds-harness-remote`、`dsh-session-sync`、`1692775560/dsh-Mimir-Academic-research`。

9\. 其他、外观、语音及安全研究（10）

`YuJunZhiXue/dsh-purge`、`Minglink/dsh-infinite-gen-5`、`Small-tailqwq/dsh-deep-whale`、`Ayase34/gal-view`、`dsh-omi-voice`、`@kc0ed/dsh-bottom-bar`、`dsh-plugin-duwg`、`dsh-timeline`、`dsh-hotkeys`、`oil-oil/dsh-oil-sticky-prompt`。

这 105 项中，`dsh-purge`、`dsh-infinite-gen-5` 等偏向模型限制绕过或红队研究，并不是普通用户应该默认安装的生产力插件；桌宠、主题插件则主要提升个性化体验，不直接提高 Agent 的任务完成质量。

[image](https://www.google.com/s2/favicons?domain=https://dpharness.com\&sz=32)

按用途分类（每个小类只留 2\~3 个）+1



## 三、另一个社区精选目录补充的 44 个名称

来源：[bruc3van/awesome-dsh-plugin](https://github.com/bruc3van/awesome-dsh-plugin?utm_source=chatgpt.com)。

这份目录从工程效率、AI 能力、多媒体创作、远程控制、成本管理和安全等方向筛选插件。以下是扣除前两份名单中同名条目后，额外值得检索的 44 个名称。其中部分属于同一产品的不同名称，并非全部是独立插件。

[image](https://www.google.com/s2/favicons?domain=https://dpharness.com\&sz=32)

DSH plugin: install & compatibility+2



1\. 工程效率、视觉与记忆（11）

`dsh-ops`、`dsh-web`、`dsh-worktable`、`dsh-univer-office`、`working-activity`、`BrowserSkill`、`dsh-vision-router`、`anysearch-dsh`、`mem9`、`dsh-auto-continue`、`dsh-reasoning-effort`。

其中，`dsh-worktable` 偏向多项目管理，`BrowserSkill` 提供浏览器控制能力，`mem9` 是持久化记忆方案，`dsh-auto-continue` 用于自动接续中断的任务。

2\. 内容创作、设计与娱乐（14）

`DSH-Transparent-UI-Plugin`、`dsh-wallpaper-engine`、`baoyu-design`、`dsh-guizang-design`、`dsh-blender-plugin`、`oh-story-dsh`、`dsh-tavern`、`dsh-voice-ai-girlfriend`、`dsh-ads`、`anime-find`、`dsh-minigames`、`dsh-bili-scroll`、`qiaomu-rss-dsh`、`qiaomu-reader-dsh`。

其中更值得生产力用户关注的是 `baoyu-design`、`dsh-guizang-design`、`dsh-blender-plugin` 和 `qiaomu-rss-dsh`。

3\. Agent、设备集成与用量监控（10）

`DS-Bot`、`DSH-taskboard`、`dsh-ios`、`dsh-evolve-modes`、`pi2dsh`、`dsh-ntr`、`dsh-remote`、`DeepSeek-Balance-Whale-Widget`、`dsh-usage-stats`、`dsh-cost-meter`。

这里的重点是任务管理、远程设备操作、跨 Agent 互联与成本可视化。

4\. 模型路由、安全、市场和学习资源（9）

`dsh-plugin-subscriptions`、`dsh-model-router`、`api-relay-audit`、`dsh-undo-savepoint`、`dsh-redteam-model`、`safer-dsh-market`、`dsh-market`、`dsh-plugin-gating-hub`、`hello-dsh`。

其中 `dsh-undo-savepoint` 的回滚能力尤其值得关注；`dsh-redteam-model` 属于授权安全测试用途，`hello-dsh` 偏向入门学习资源。

## 四、近期热榜额外值得关注的 4 项

除了上述三个精选目录，近期插件下载榜还有以下名称：

[image](https://www.google.com/s2/favicons?domain=https://dpharness.com\&sz=32)

精选 Top 榜（附下载量与安装命令）



| 名称                       | 主要用途          |
| ------------------------ | ------------- |
| `billion-context`        | 长上下文与信息压缩     |
| `dsh-windows-mcp`        | Windows 系统自动化 |
| `dsh-session-superagent` | 会话、仓库或任务状态管理  |
| `cc-safety-net`          | 防止危险命令造成误操作   |

这些属于热榜线索，而不是已经独立验证的高质量插件。

## 五、真正建议优先评估哪些？

如果目标是提升 DSH 完成真实任务的能力，而不只是丰富界面，我会优先看下面这些：

| 优先级 | 插件                                      | 推荐理由              |
| --- | --------------------------------------- | ----------------- |
| 1   | dsh-turn-rewind / `dsh-undo-savepoint`  | 出错后能恢复，是可靠执行的基础   |
| 2   | dsh-context                             | 管理上下文，减少长任务中的信息丢失 |
| 3   | dsh-mnemon / `mem9`                     | 长期记忆；二选一测试        |
| 4   | dsh-agent-teams                         | 多 Agent 并行协作      |
| 5   | dsh-browser / `BrowserSkill`            | 接入真实浏览器工作流        |
| 6   | modsearch                               | 强化实时信息检索          |
| 7   | modlens / `dsh-vision-toolkit`          | 扩展视觉理解、OCR 和截图处理  |
| 8   | dsh-automation                          | 定时执行重复性任务         |
| 9   | DSH-better-sidebar                      | 提高文件、Git、终端等操作效率  |
| 10  | dsh-plugin-check / `dsh-security-audit` | 检查插件兼容性、配置及安全风险   |

这里最重要的区别是：真正限制 Agent 生产力的通常不是可安装插件的数量，而是长期任务能否稳定执行、保留状态、出错恢复。 因此我会先装可靠性和上下文相关的工具，再考虑主题、桌宠和界面插件。

## 六、来源汇总

| 来源                                                                                                       | 性质      | 用途           |
| -------------------------------------------------------------------------------------------------------- | ------- | ------------ |
| [DSH 官方 GitHub](https://github.com/deepseek-ai/deepseek-harness?utm_source=chatgpt.com)                  | 官方      | 项目文档、版本和插件入口 |
| [GordenSun/awesome-dsh-plugins](https://github.com/GordenSun/awesome-dsh-plugins?utm_source=chatgpt.com) | 人工精选    | 上述 50 项      |
| [DSH 每月精选榜](https://dpharness.com/best?utm_source=chatgpt.com)                                           | 第三方数据榜  | 上述 105 项     |
| [bruc3van/awesome-dsh-plugin](https://github.com/bruc3van/awesome-dsh-plugin?utm_source=chatgpt.com)     | 社区分类精选  | 额外 44 个名称    |
| [DSH 下载热榜](https://dpharness.com/top?utm_source=chatgpt.com)                                             | 第三方热度指标 | 近期流行项目       |
| [DSH Insights](https://dsh-insights.com/?utm_source=chatgpt.com)                                         | 生态索引与评分 | 发现更多候选插件     |
| [dsh-TUI GitHub](https://github.com/ccch1mneyyy/dsh-TUI?utm_source=chatgpt.com)                          | 开发者仓库   | 追踪公众号收录说法    |

最终统计： 上面覆盖三份明确范围的精选清单及近期热榜，共涉及约 199 个条目名称（按清单列举数量计算，尚未完全合并别名及重复项目）。这不是整个 DSH 生态的全部插件，也不能把所有入榜项目都认定为高质量。

尤其需要区分：目前有直接证据的官方推荐范围仍然有限，而社区精选、下载量和自动评分都只是候选筛选依据。真正安装前，还应检查源码、最近维护时间、DSH 版本兼容性和插件申请的权限。