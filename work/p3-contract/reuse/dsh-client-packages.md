# dsh client 包组合核实与 B′ 决策行

## 结论与核实边界

**B′ 可以采用 dsh 客户端做骨架，但不能把它理解成“安装几个普通 React 组件包，丢掉 Cordis 后直接组合”。最短路径是保留浏览器端 Cordis、SlotRegistry、客户端对象层和 Remote 组装，替换产品壳与品牌；不是把 Cordis 服务全部重写成 React hooks。** `web/src/boot.ts:80-98` 创建 Context 并加载插件，`ui-renderer/src/client/index.ts:89-96` 安装 SlotRegistry 并挂载 React，`ui-chat/src/client/apply.ts:79-82` 明确要求会话、配置、远端和侧栏服务。

本报告中的 `C/` 统一表示 `/home/lingxufeng/bot/repos/deepseek-harness/packages/client/`，`R/` 表示 `/home/lingxufeng/bot/repos/deepseek-harness/`。所有文件行号绑定本地 HEAD `ce7073d51254c26cd63b22a60835b8f948deb447`，提交时间为 2026-10-30T00:13:15+08:00。参考仓只读，没有安装依赖、构建或运行测试。本报告核实的是源码结构可行性，不是已经跑通的集成验收。

**先纠正数量：此 HEAD 的 `packages/client/*/package.json` 是 69 个，不是 74 个。** 本文按这 69 个包逐一列档。“74 个 React 18 包”也不是严格描述，因为其中包含 React-free 的 store、传输和模块加载包。69 个包名可按下表逐行与各自 `package.json:2` 对照；React 18 的实际声明例见 `C/ui-chat/package.json:96-98`。某些其他目录下也有浏览器半部，但不能计入本次 `packages/client/` 的数量。

### 搬运阶梯决策表

| 能力 | 候选（仓库路径或 npm 包） | 阶梯级别 | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| B′ 客户端整体骨架。 | `deepseek-ai/deepseek-harness@packages/client/web`、`packages/bundle/web-app/cordis.patch.yml` 及其客户端依赖闭包。 | 2。 | MIT，见 `R/LICENSE:1-13`。 | 本地 HEAD 是 2026-10-30；聊天目录最后提交为 2026-10-29 的 `babf1f6612`。Issue 回复情况本次未验证。 | **集成**。 | 推荐锁定同一 SHA 的 workspace 整体装配，原样保留浏览器 Cordis 与对象层，再用外部插件、配置和包装层换壳。`C/web/src/boot-client.ts:36-56` 已有独立于启动页面的组装函数；`C/connection/src/client/index.ts:84-119,228-233` 已有替换传输的接缝。工作量主要在 bot 导航、IPC carrier 和插件清单闭包，而不是重写聊天。 |
| 普通 React 控件和布局基础。 | `@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`，并共用 `dsh-client-store`、`dsh-client-ui-slots`。 | 1；同 SHA workspace 也可走 2。 | MIT，见各包 `package.json` 的 `license`；根许可证见 `R/LICENSE:1-13`。 | npm 查询到 primitives 最新版 `0.0.1-rc.1`，`time.modified=2026-10-29T14:18:21.112Z`；源码测试和维护见下文。 | **集成**。 | 这些是公开导出的静态基础库，不需要启动 Cordis 容器才能使用主要 API。应继续依赖它们，不复制控件。注意 npm 元数据仍声明 Cordis peer，且 primitives 的 SVG 图标需要主题 sprite；“无 Cordis 运行时调用”不等于“零安装 peer、零主题资源”。证据见 `C/ui-primitives/src/index.ts:1-35`、`C/ui-dockkit/src/index.ts:5-15,64-70`、`C/ui-primitives/src/icons/index.tsx:17-23`。 |
| 直接安装最新 npm feature 包并当成 React 组件库。 | `@deepseek-ai/dsh-client-web`、`@deepseek-ai/dsh-client-ui-chat`。 | 1，尚未证明整组可用。 | MIT。 | npm 的 web 最新版是 `0.0.1-rc.1`，修改时间为 2026-10-29T14:13:01.504Z；chat 最新版是 `0.1.2-alpha.2`，修改时间为 2026-10-29T14:06:21.468Z。本地二者版本均为 `0.2.2-alpha.2`。 | **集成**。 | 这些包确实已发布，但本次不推荐把各自 latest 混装后直接承诺 B′。npm 版本与已核实源码不一致，feature `/client` 是插件入口而非组件 barrel，还需要构建产物的模块表与服务供应者。须先验证一套兼容版本和公开产物闭包，才能替代上一行的同 SHA workspace 集成。证据见 `C/web/package.json:4,16-26,45-52`、`C/ui-chat/package.json:4,16-28`、`C/ui-chat/src/client/index.ts:1-15`；npm 事实来自本次 `npm view <包> version time.modified repository peerDependencies exports --json`，可在 https://registry.npmjs.org/@deepseek-ai%2Fdsh-client-web 和 https://registry.npmjs.org/@deepseek-ai%2Fdsh-client-ui-chat 复查。 |
| 严格去 Cordis 的独立 renderer。 | 同仓 `packages/client/*/src/client/*.tsx` 与相关 controller。 | 3，仅作为“不允许保留浏览器 Cordis”时的备选。 | MIT。 | 同上游 SHA。 | **改造**。 | 展示层确实接收 props、不直接读取 ctx，但注入 hooks、slot 渲染器、session 作用域和 controller 仍要由新壳补齐，不能只搬 JSX。若强制这条路，来源统一记录为 `https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:packages/client/<包>/src/client/<文件>`。`C/ui-chat/src/client/chat/ChatView.tsx:62-83,99-127` 展示了必需的 `useChat/useSession/useSessions` props；`C/ui-approval/src/client/ApprovalCard.tsx:13-20` 也需要 slot/t props。相较第 2 级，这条路会自有化装配和订阅逻辑，所以不是首选。 |

本任务限定核实已有 dsh，不是开放式替代库选型，因此没有扩展搜另一套聊天框架，也没有 clone 或修改 MANIFEST。上表比较的是同一上游的“公开包直接安装 / 同 SHA 整体组合 / 去壳复制”三种实质不同的复用方式。上游近期 commit 和 npm 发布已验证；“issue 有人回应”未验证，不能将其写成已满足全部维护判据。

## 1. 69 个包的依赖结构与三档清单

### 判档标准

- **可直接复用**表示公共源码 API 不需要活动的 Cordis Context。四个基础库中，只有 primitives 和 dockkit 是 UI 库；store 和 slots 是配套基础设施。
- **需适配壳**表示包入口仍是 Cordis 插件，但主要依赖 slots、布局、语言、快捷键或统一配置等壳服务。保留 dsh 客户端运行时可直接注册；去壳时要提供对应 props、callbacks 和声明位置。
- **深度绑定**表示依赖 SessionBinding、业务 Remote、持续订阅或运行时对象层；不代表不能复用，而是不能作为独立 React 组件黑盒使用。推荐连同供应者整体集成，不逐个仿造服务。

不能用 `dependencies` 一栏判断浏览器依赖。这个仓将浏览器导入和 type 关系放在 `devDependencies`，而 npm production dependencies 主要描述 Host；例如 chat 的 `dsh.client.inject` 列在 `C/ui-chat/package.json:30-48`，其实际运行时服务列在 `src/client/apply.ts:79-82`。`dsh.client.inject` 只是信息性包名边，**激活排序依据是 Cordis 的服务 inject**，见 `C/AGENTS.md:63-70,90-102,147-150`。下面依据实际插件源码，不是只看 README 或包清单。

### 可直接复用的公共基础库

| 包短名（全名均加 `@deepseek-ai/dsh-client-` 前缀） | 判档 | 结论与证据 |
|---|---|---|
| `ui-primitives`。 | 可直接复用。 | 公开导出 Button、Menu、Modal、SettingsForm、工具输出控件等，主要是 React props 和 CSS token；没有运行时 Cordis Context。证据见 `C/ui-primitives/src/index.ts:1-35,49-54,84-107`、`src/Button.tsx:4-17,27-35`。图标 sprite 是额外资源依赖，不应忽略。 |
| `ui-dockkit`。 | 可直接复用。 | docking 引擎不含 React/DOM/Host 概念，React surface 接受 labels、tab renderer 和 intents。证据见 `C/ui-dockkit/src/index.ts:5-15,55-70`。四页 MVP 不需要 docking 时可以不引入。 |
| `store`。 | 可直接复用。 | 它是 React-free 的 zustand vanilla、immer 和 observable 引擎，不创建 Cordis 容器；需要 React hooks 时由 renderer 绑定。证据见 `C/store/src/index.ts:1-16,26-37`。 |
| `ui-slots`。 | 可直接复用。 | 它是 slot 类型、协议与纯核心，不是现成 React Provider。源码只依赖 React 类型和配套 store 类型，见 `C/ui-slots/src/index.ts:1-23`。实际 ctx→React 桥在另一个包 ui-renderer。 |

### 需适配壳的插件

| 包短名 | 判档 | 依赖与适配说明（含证据） |
|---|---|---|
| `hmr`。 | 需适配壳。 | 它注入 modules 并管理客户端重载；生产 MVP 可以不启用，见 `C/hmr/src/client/index.ts:13-21`。 |
| `locale`。 | 需适配壳。 | 它需要 slots、remote、configForms，语言设置与 Host 配置相连，而不是独立 i18n React Provider，见 `C/locale/src/client/index.ts:558-566`。 |
| `modules`。 | 需适配壳。 | 它要求 loader，维护客户端模块系统；沿用 AppWebEntry 时应保留，见 `C/modules/src/client/index.ts:56`、`C/web/src/boot.ts:58-92`。 |
| `resources`。 | 需适配壳。 | 它需要 slots，提供资源协议和渲染 hooks 的绑定位置，见 `C/resources/src/client/index.ts:23`、`C/AGENTS.md:31`。 |
| `shortcuts`。 | 需适配壳。 | 它是继承 Cordis Service 的类并静态注入 locale，不是纯 React hooks 库，见 `C/shortcuts/src/client/index.ts:27-28,47`。 |
| `ui-attachment`。 | 需适配壳。 | 它需要 slots 和 fileDrag，渲染附件时仍依赖这些贡献位置，见 `C/ui-attachment/src/client/index.ts:17`。 |
| `ui-brand-official`。 | 需适配壳。 | 它只注入 slots；要换 Grok 品牌，应换此类 slot 占位者，而非额外叠一套品牌 DOM，见 `C/ui-brand-official/src/client/index.ts:8`、`R/packages/bundle/web-app/cordis.patch.yml:334-336`。 |
| `ui-context-menu`。 | 需适配壳。 | 它需要 slots、locale 和 shortcuts；菜单本体可用 primitives，插件负责全局菜单服务，见 `C/ui-context-menu/src/client/index.ts:45`。 |
| `ui-directory-picker-browse`。 | 需适配壳。 | 它需要 slots、uiWorkspace、locale；独立产品需要决定目录选择入口，见 `C/ui-directory-picker-browse/src/client/index.ts:23`。 |
| `ui-directory-picker-native`。 | 需适配壳。 | 它需要 slots、uiWorkspace、remoteAccess；不能假设浏览器可直接执行原生目录选择，见 `C/ui-directory-picker-native/src/client/index.ts:14`。 |
| `ui-entry-customization`。 | 需适配壳。 | 它需要 slots、locale、uiWorkspace；按自有导航需求决定是否保留，见 `C/ui-entry-customization/src/client/index.ts:23`。 |
| `ui-file-actions`。 | 需适配壳。 | 它没有前置 inject，但其插件注册仍需要 ctx；无前置依赖不等于普通 React 组件，见 `C/ui-file-actions/src/client/index.ts:22`。 |
| `ui-file-drag`。 | 需适配壳。 | 它依赖 slots 和 locale，提供拖拽交互服务；chat 将 fileDrag 列为必需服务，见 `C/ui-file-drag/src/client/index.ts:28`、`C/ui-chat/src/client/apply.ts:79-82`。 |
| `ui-layout`。 | 需适配壳。 | 它需要 slots、theme、locale、shortcuts，负责框架导航和布局；可被产品壳包装，但不能在不补这些服务时单独启动，见 `C/ui-layout/src/client/index.ts:154`。 |
| `ui-secret-mask`。 | 需适配壳。 | 它依赖 locale、slots、uiConversation，是可选的展示遮罩贡献，不应把它当成存储侧凭证保护，见 `C/ui-secret-mask/src/client/index.ts:21`、`R/packages/bundle/web-app/cordis.patch.yml:391-394`。 |
| `ui-settings-agent-loop`。 | 需适配壳。 | 它通过 slots、locale、configForms 装配配置页，不是 agent-loop 的实现，见 `C/ui-settings-agent-loop/src/client/index.ts:36`。 |
| `ui-settings-plugins`。 | 需适配壳。 | 它主要声明 slots 和 locale 的设置页面入口，见 `C/ui-settings-plugins/src/client/index.ts:29`。 |
| `ui-settings-session-log`。 | 需适配壳。 | 它需要 slots、locale、configForms；需要统一的配置表单供应者，见 `C/ui-settings-session-log/src/client/index.ts:19`。 |
| `ui-settings-shell`。 | 需适配壳。 | 它需要 slots、locale、configForms；本包是 shell 配置展示而非执行后端，见 `C/ui-settings-shell/src/client/index.ts:37`。 |
| `ui-shortcuts`。 | 需适配壳。 | 它展示 shortcuts 服务并注入 locale、slots，见 `C/ui-shortcuts/src/client/index.ts:22`。 |
| `ui-sidebar`。 | 需适配壳。 | 它主要是侧栏框架和面板导航，需要 layout、uiWorkspace、locale、shortcuts。真正的会话列表不在此包，见 `C/ui-sidebar/src/client/index.ts:41,81-95`。 |
| `ui-sidebar-browser`。 | 需适配壳。 | 它需要 slots、locale、sidebarRight 和 sidebarRightTabs，属于右侧浏览器 tab 插件；四页 MVP 可以不展示，见 `C/ui-sidebar-browser/src/client/index.ts:40`。 |
| `ui-theme`。 | 需适配壳。 | 它需要 slots、locale、remote、configForms，运行时安装全局样式和 sprite；仅复用 token CSS 与完整启用插件是两种不同方式，见 `C/ui-theme/src/client/index.ts:587-602`。 |
| `web`。 | 需适配壳。 | 它是模块表、Loader、启动页面和 renderer 交接内核，不是普通页面组件；外部壳须提供 bootstrap manifest、模块 facade、资源及传输，见 `C/web/src/boot.ts:58-98`。 |

### 深度绑定业务状态或运行时的插件

| 包短名 | 判档 | 依赖与适配说明（含证据） |
|---|---|---|
| `connection`。 | 深度绑定。 | 它拥有 RPC、generation、恢复与传输选择，不是 UI 包。可替换 carrier，但应保留其生命周期，见 `C/connection/src/client/index.ts:149-186,228-233`。 |
| `file-upload`。 | 深度绑定。 | 它依赖 remote 并安装 FileUploadRuntime，聊天附件链路需要该供应者，见 `C/file-upload/src/client/index.ts:18-26`、`C/ui-conversation/src/client/apply.ts:61-63`。 |
| `product-analytics`。 | 深度绑定。 | 它依赖 remote.productAnalytics；不是 MVP 必需的 UI 组件，应按产品遥测政策决定是否启用，见 `C/product-analytics/src/client/index.ts:60`。 |
| `ui-agent-preset`。 | 深度绑定。 | 它依赖 sessions、remote.agentPresets、remote.settings 和 configForms，维护绑定与未绑定会话的 preset controller，见 `C/ui-agent-preset/src/client/index.ts:65-96`。 |
| `ui-approval`。 | 深度绑定。 | 卡片 JSX 本身是 props-only，但完整能力通过 sessions、uiSession 和远端 approval/request waterfall 完成回答与取消，见 `C/ui-approval/src/client/index.ts:27,38-71,90-109`。 |
| `ui-chat`。 | 深度绑定。 | 它依赖对象层、uiConversation、uiSession、remote.session、configForms 和 sidebarRight，负责节点投影及渲染注册，见 `C/ui-chat/src/client/apply.ts:79-82,100-137`。 |
| `ui-commands`。 | 深度绑定。 | 它需要 inputTriggers、sessions、remote.commands 和 locale；不能只拿命令弹层而不补命令源与作用域，见 `C/ui-commands/src/client/index.ts:52`。 |
| `ui-conversation`。 | 深度绑定。 | 它是输入、发送与会话展示编排层，需要 sessions、fileUpload、uiSession、uiWorkspace、configForms，见 `C/ui-conversation/src/client/apply.ts:61-63,135-150`。 |
| `ui-deliverables`。 | 深度绑定。 | 它需要 remote.session、uiConversation、resources 及右侧面板服务，见 `C/ui-deliverables/src/client/index.ts:46`。 |
| `ui-goal`。 | 深度绑定。 | 它依赖 sessions、remote.goals 和 uiConversation，见 `C/ui-goal/src/client/index.ts:64`。 |
| `ui-input-trigger`。 | 深度绑定。 | 它依赖 sessions 和 locale，定义输入触发管线；model-selection 的 commandUi 又由命令链路供应，见 `C/ui-input-trigger/src/client/index.ts:52`、`C/ui-model-selection/src/client/index.ts:107`。 |
| `ui-jobs`。 | 深度绑定。 | 它依赖 jobs 服务并装配会话 job 视图，见 `C/ui-jobs/src/client/index.ts:27`。 |
| `ui-message-feedback`。 | 深度绑定。 | 它需要 remote.messageFeedback、remote.sessionFeedback，见 `C/ui-message-feedback/src/client/index.ts:60`。 |
| `ui-model-selection`。 | 深度绑定。 | 它维护每 session 的 ModelDirectoryResolver，并同时驱动 /model 和 composer seat，见 `C/ui-model-selection/src/client/index.ts:107,122-165,168-193`。 |
| `ui-open-in-app`。 | 深度绑定。 | 它需要 sessions、remote.session、remote.workspaceFiles、contextMenus、layout 和右侧面板，不是可直接移植的桌面链接按钮，见 `C/ui-open-in-app/src/client/index.ts:50`。 |
| `ui-permission-presets`。 | 深度绑定。 | 它需要 commandUi、connection、sessions、remote.permissionPresets、remote.settings、configForms 和 settingsSchema，见 `C/ui-permission-presets/src/client/index.ts:59-63`。 |
| `ui-plan`。 | 深度绑定。 | 它需要远端 commands/session、sessions、uiConversation、resources 与右侧面板，见 `C/ui-plan/src/client/index.ts:52`。 |
| `ui-plugin-manager`。 | 深度绑定。 | 它需要 pluginManager、pluginInventory、pluginRegistryProbe、configForms、layout 和 remoteAccess；市场的安装流程依赖它，见 `C/ui-plugin-manager/src/client/index.ts:86`、`R/packages/bundle/web-app/cordis.patch.yml:311-315`。 |
| `ui-plugin-market`。 | 深度绑定。 | 它需要 remote.pluginMarket 与 remote.pluginRegistryProbe，还向 Plugins 页的 plugins.tab 注册 Discover；单加本包不会产生完整页面，见 `C/ui-plugin-market/src/client/index.ts:32,40-57`。 |
| `ui-reference`。 | 深度绑定。 | 它需要 inputTriggers、sessions、remote.fileReferences、remote.sessionReferenceResolver 和 uiConversation，见 `C/ui-reference/src/client/index.ts:46-49`。 |
| `ui-renderer`。 | 深度绑定。 | 它是唯一 ctx→React 与 slot/scope hooks 的运行时桥，尽管 inject 前置列表为空，仍在 apply 内创建 SlotRegistry，见 `C/ui-renderer/src/client/index.ts:52,89-96`、`src/client/scoped-slots.tsx:534-591`。 |
| `ui-schedule`。 | 深度绑定。 | 它需要 remote.schedule、conversation、uiWorkspace、sessions、workspaces、remoteAccess 和右侧面板，见 `C/ui-schedule/src/client/index.ts:78-82`。 |
| `ui-session`。 | 深度绑定。 | 它把 sessions 对象层、访问能力和 session scope 提供给所有业务组件，见 `C/ui-session/src/client/index.ts:689-714`。 |
| `ui-settings`。 | 深度绑定。 | 它不是现成“设置大页面”，而是 remote.settings 的 schema/mirror/configForms 服务，见 `C/ui-settings/src/client/index.ts:31-53`。 |
| `ui-settings-account`。 | 深度绑定。 | 它需要 remote.account、remote.session、theme、configForms 和 remoteAccess；本产品不应为复用设置框架而强制继承上游账号流程，见 `C/ui-settings-account/src/client/index.ts:45`。 |
| `ui-settings-general`。 | 深度绑定。 | 它依赖 connection、remote.settings、configForms、shortcuts、modules 和 remoteAccess，见 `C/ui-settings-general/src/client/index.ts:75`。 |
| `ui-settings-models`。 | 深度绑定。 | 它需要 remote.credentials、remote.llm、remote.settings、remote.session、configForms 和 settingsSchema，负责模型提供方配置而非单个 session 的模型选择，见 `C/ui-settings-models/src/client/index.ts:67-71`。 |
| `ui-settings-plugin-inventory`。 | 深度绑定。 | 它需要 remote.pluginInventory 和 modules，见 `C/ui-settings-plugin-inventory/src/client/index.ts:30`。 |
| `ui-settings-subagent`。 | 深度绑定。 | 它通过 remote.session 与 configForms 展示 subagent 设置，见 `C/ui-settings-subagent/src/client/index.ts:53`。 |
| `ui-settings-web-search`。 | 深度绑定。 | 它需要 remote.credentials 和 configForms；复用时凭证操作仍须走 main 的受控通道，见 `C/ui-settings-web-search/src/client/index.ts:44`。 |
| `ui-sidebar-documentpreview`。 | 深度绑定。 | 它需要 remote.workspaceFiles、resources、configForms、fileDrag 和 sidebarRightTabs，见 `C/ui-sidebar-documentpreview/src/client/index.ts:83`。 |
| `ui-sidebar-files`。 | 深度绑定。 | 它需要 remote.workspaceFiles、sidebarRight 和 tabs，见 `C/ui-sidebar-files/src/client/index.ts:57`。 |
| `ui-sidebar-right`。 | 深度绑定。 | 它需要 sessions、uiSession、resources、layout、shortcuts 和 contextMenus，负责每会话右侧 docking 状态，见 `C/ui-sidebar-right/src/client/index.ts:89`。 |
| `ui-sidebar-terminal`。 | 深度绑定。 | 它需要 webTerminals、theme、shortcuts 和右侧面板服务，见 `C/ui-sidebar-terminal/src/client/index.ts:23`。 |
| `ui-skill`。 | 深度绑定。 | 它需要 remote.skills、inputTriggers、sessions、uiConversation 等服务，见 `C/ui-skill/src/client/index.ts:80`。 |
| `ui-subagent`。 | 深度绑定。 | 它依赖 sessions、uiWorkspace 与 sidebarRight，见 `C/ui-subagent/src/client/index.ts:34`。 |
| `ui-tool`。 | 深度绑定。 | 它注册 tool-call keyed renderer 与工具专用视图，还依赖 remote 和 sessions 提供 Host 路径等事实，见 `C/ui-tool/src/client/apply.ts:23,29-54`。 |
| `ui-trajectory`。 | 深度绑定。 | 它依赖 sessions、uiSession、uiConversation 与 remote.toolResults，见 `C/ui-trajectory/src/client/index.ts:42`。 |
| `ui-user-questions`。 | 深度绑定。 | 它需要 remote.userQuestions、sessions、uiSession、uiConversation，与审批类似属于交互请求生命周期，不只是表单，见 `C/ui-user-questions/src/client/index.ts:56`。 |
| `ui-workflow-run`。 | 深度绑定。 | 它依赖 uiConversation、uiWorkspace、sessions 并贡献 workflow 会话节点，见 `C/ui-workflow-run/src/client/index.ts:23`。 |
| `ui-workspace`。 | 深度绑定。 | 它拥有真正的工作区/会话列表、搜索和导航，需要 sessions、workspaces、remote.directoryPicker、layout、remoteAccess 等，见 `C/ui-workspace/src/client/index.ts:103-142,330-344`。 |

以上清单为 4 个可直接复用、24 个需适配壳、41 个深度绑定，共 69 个。**大部分 feature 的 `.tsx` 不读取 ctx，与“feature 包不依赖 Cordis”是两回事。** 前者由注入 props 成立，后者被实际 apply/inject 和 slot 装配否定。上游也明确把展示组件视作可替换层，而将对象层和 renderer 分开，见 `C/AGENTS.md:34-52`。

## 2. 现有 web / desktop 的组装、状态与传输

| 层次 | 实际入口与行为 | 对独立 React app 的意义 |
|---|---|---|
| Web 页面入口。 | `R/apps/web/src/main.ts:2-3,17-37` 导入品牌字体、创建 AppWebEntry 并 run。desktop 分支先取得 injections 和 streamBaseUrl，再 resolve boot gate。 | 可以复用启动形状，但它不是一句 ReactDOM.render；独立壳必须补齐初始化数据。 |
| Bootstrap 与模块表。 | `C/web/src/boot.ts:58-92` 读取 `__ModuleLoader__`、`__DSH_BOOT__`，创建 module system 与 Context；`C/web/src/platform.ts:8-15` 固定共享 React、ReactDOM、Cordis、zod、virtualizer 和四个基础库。 | 自有 app 应保持 React/Cordis 单一模块身份。直接用多个动态 bundle 的 bare import 代替模块表会遗漏既有加载约定。 |
| 插件装配。 | `C/web/src/boot-client.ts:36-56` 安装 Loader、设置 loader.internal、启动 manifest entries 并等待全部 active；`:66-87` 在失败或缺服务时拒绝启动。生产 roster 位于 `R/packages/bundle/web-app/cordis.patch.yml:217-408`。 | 可以抽取为页面无关的骨架，这个接缝已经存在；删掉页面不代表可以随意删依赖供应者。必须按服务 inject 闭包裁剪。 |
| React 挂载。 | `C/web/src/mount.ts:19-23` 等待 uiRenderer 后挂载；`C/ui-renderer/src/client/index.ts:89-96` 创建 SlotRegistry、安装 createSlotRenderer、createRoot/hydrateRoot；`src/client/app.tsx:21` 最终绘制 root slot。 | 自有产品根壳可通过 root/layout/子 slot 装配替换。保留 Cordis 不妨碍最终仍是独立 React renderer。 |
| UI 状态。 | `C/store/src/index.ts:1-16` 是 zustand vanilla + immer + selector + rAF flush；`C/ui-layout/src/client/stores.ts:5,79` 通过 defineStore 声明布局状态。`C/ui-renderer/src/client/scoped-slots.tsx:355,476-495,534-591` 统一合成外部订阅 hooks 和 scoped props。 | 不应另外上 Redux 并镜像 session/chat 状态。复用对象层和原有状态引擎；新增 bot 选择等产品状态才由产品壳自己拥有。 |
| Session 对象层。 | `R/packages/api/session-controller/src/client/index.ts:98-148` 创建 ClientSessions，接收 added/removed/status/control frames，并处理连接代际。`src/client/sessions/service.ts:238-264` 持有 SessionManager；`sessions/manager.ts:89` 与 `sessions/session.ts:96` 分别拥有管理器和单会话对象。`C/ui-session/src/client/index.ts:695-714` 把它绑定成 root/session hooks。 | 这层在 `packages/api/`，只搬 `packages/client/` 不足以得到可工作的会话客户端。 |
| 一元 API。 | `C/connection/src/client/rpc.ts:34-69` 对 `channel/endpoint` 发 client-request 信封，校验 server-response 与 rpcId；`R/packages/api/gateway/src/client/index.ts:458` 通过 connection.rpc.call('/api', ...) 调用。 | P3 的 `/api` 透传应保留这套信封及错误结果，而不是另造 Grok RPC 翻译器。 |
| 多路复用与事件。 | `R/packages/api/gateway/src/client/index.ts:159-193,224-245` 创建 RemoteStreamMuxClient，承载转发事件、重连和关闭。mux 的精确路径是 `R/packages/api/gateway/src/stream-protocol.ts:7` 的 `/api/remote.mux`，不是另一个名为 `/mux` 的裸路径；`src/client/stream-client.ts:242,502-509` 建 socket 并解析基址。 | chat、审批和 session stream 的连接层不在 ui-chat。复用时需要 api-gateway、Typert、生成的 remotes 及 controller 浏览器半部。 |
| Desktop 对同一 Web app 的复用。 | `R/apps/desktop/src/main.ts:762-775` 从 `dsh-web-frontend/dist` 提供同一应用文档，把其他请求转发 Host；`src/web-document.ts:18-35` 给 index 加 boot gate，`:43-49` 在主进程认证 Host；Web 入口 `R/apps/web/src/main.ts:21-35` 接桌面 injections。 | 上游自己已经验证过“桌面壳 + 同一 Web renderer”的组织方式。不能因此认定其默认 socket 归属满足本项目“唯一 main mux 客户端”的约束。 |

### 能抽，但需要保留与替换的部分

1. **推荐保留**模块身份、浏览器 Cordis、SlotRegistry、store、uiSession、ClientSessions、uiConversation/chat 的投影与 Remote 接口。完整链路的证据在上表，不需要重写会话协议或流式 reducer。
2. **推荐替换或包装**产品 root/layout、bot 导航、品牌 slot、四页页面入口，以及 Connection 的物理传输。`C/connection/src/client/index.ts:84-119` 已允许 `rpc`、`fetch`、`openStream`、bundle/asset transport 和 socket factory 的替换；`:233` 优先采用传入 rpc。`R/packages/api/gateway/src/client/index.ts:240-245` 在存在 rpc.open 时绕过内置 mux；`:172,177-182` 也只在没有 rpc.open 时启动或重连内置 mux。
3. **对于已定的 main-only mux 约束，优先给 renderer 注入逻辑 `rpc.call/open`，由 preload/MessagePort 转到 main；不要只改 streamBaseUrl。** 后者仍会走 renderer 内的 WebSocket。现有接口证明这是可用接缝，但本次没有实现或验收 main 的 MessagePort carrier、背压、取消、uplink、断连和 generation 同步；这些仍是 P3/P4 集成验收项。不得把 `ownsHost` 当作凭证或权限替代，见 `C/connection/src/client/index.ts:108-119,149-186`。
4. **“只做四页”不能等同于“只加载四个插件”。** 例如 chat 硬依赖 sidebarRight 与 fileDrag；conversation 硬依赖 fileUpload；uiSession 硬依赖 remoteAccess；市场只是 plugins.tab 的贡献者。若要删这些底座，要么保留无入口的服务供应者，要么确实改造 apply；不能用空 stub 冒充权限或会话服务。证据分别见 `C/ui-chat/src/client/apply.ts:79-82`、`C/ui-conversation/src/client/apply.ts:61-63`、`C/ui-session/src/client/index.ts:689`、`C/ui-plugin-market/src/client/index.ts:55-57`。

因此，**“脱离 dsh 原产品页面壳”可行；“完整功能包脱离 Cordis/slot 运行时”不成立；“保留运行时，换四页 React 产品壳”是本次建议的 B′。** 最小服务闭包尚未通过真实启动测定，不应提前承诺某个插件数或工期。

## 3. 四页 MVP 覆盖度与成熟度

四页按 panel 的“bot 列表 / 会话流 / 市场 / 设置”计算；审批与 tool-call 位于会话流中，因此下面分成六行描述能力，不把审批另算第五页。以下测试数是各包 `tests/` 下 `*.spec.*` 文件的静态数量，不是用例数或本次 PASS 数；最近改动是对相应目录执行 `git log -1` 的结果，可能包含 release 或 merge。

| MVP 能力 | 对应包与覆盖 | 成熟度与源码证据 | 本产品缺口与适配工作 |
|---|---|---|---|
| bot / 会话列表页。 | `@deepseek-ai/dsh-client-ui-sidebar` 提供框架；真正的列表来自 `@deepseek-ai/dsh-client-ui-workspace`，并依赖 api-session-controller、api-workspace-controller、ui-session。 | sidebar 有 9 个 spec，workspace 有 15 个 spec。sidebar 最近目录提交为 2026-10-28 `a5f1d4a16a`；`C/ui-sidebar/tests/apply.client.spec.tsx:65,123,147,178` 检查 slot 注册、延迟声明、动态面板与撤销；`C/ui-workspace/src/client/index.ts:139-142,157-162,175-200,330-344` 覆盖搜索、打开、pin/archive/rename 与列表注册。 | dsh 是工作区下的 session browser，不是持久 bot roster。主 bot 标识、每 bot preset/runtime、bot 与多个 session 的映射、Grok 风格头像/条目都不是 sidebar 包自动提供的。应新增产品层 bot 导航并复用会话操作，不把 bot 假装成 workspace 或 session。 |
| 聊天流及流式渲染。 | `ui-conversation` 提供输入和会话编排，`ui-chat` 提供 chat target/节点/正文；`ui-session`、api-session-controller、api-gateway 和 remotes 提供状态与传输。 | chat 有 57 个 spec，conversation 有 54 个 spec；chat 最近目录提交为 2026-10-29 `babf1f6612`。`C/ui-chat/src/client/conversation-nodes/assistant.ts:102-143` 实际处理 text-delta、reasoning-delta、tool-call-delta 和 block-end；`tests/conversation-node-definitions.client.spec.ts:331,1019,1054,1230` 检查 chunk 原地更新、答案边界与稳定 keyed 节点；`tests/reasoning-row.client.spec.tsx:58,380` 检查流式 reasoning 不丢展开状态。 | 核心流式能力无需自建，但不是给一个 messages 数组就可用的聊天组件。要保留对象层、scope 和 node 定义；Grok 的具体视觉、bot→session 切换和 main IPC carrier 需要适配。本次未运行流式 E2E。 |
| 审批卡。 | `@deepseek-ai/dsh-client-ui-approval` 有共享 ApprovalCard 与审批请求 consumer；详情 slot 可与工具信息关联。 | 有 1 个 spec 文件但包含多项用例；最近目录提交为 2026-10-28 release `00d541438b`。`C/ui-approval/src/client/ApprovalCard.tsx:17-37,75-84` 实现防重复答复、失败恢复与 allow/reject/可选 always；`src/client/index.ts:38-71,90-109` 实现 scoped request、退出委托和清理。`tests/ui-approval.client.spec.tsx:130,153,179,212,224` 覆盖一次性回答、abort、无人回答、无 scope 委托和 scoped takeover。 | 审批决策与 P2 的 pending 记录、权限规则和请求关联必须一致。`onAlways` 是展示能力，不等于产品已经授权永久允许；不得因为复用此按钮而放宽默认 ask。IPC 中止/断连时的回答归属需要验收。 |
| tool-call 行。 | `@deepseek-ai/dsh-client-ui-tool` 配合 ui-chat 的 tool 节点，另有 ui-trajectory 可按需展示详情。 | ui-tool 有 21 个 spec；`C/ui-tool/src/client/apply.ts:36-54` 注册 tool-call tree、keyed toolview 以及 bash/read/image/file/search/web/todo 等默认视图。`C/ui-chat/tests/tool-preparation.client.spec.ts:104,164,200,334` 检查参数增量、合并和历史不误生准备态。 | 原始工具 schema、显示元数据和 P2 实际暴露工具需相符。未知工具保留 generic fallback，不需要照搬所有上游工具专用页。只做纯文本聊天会漏掉 panel 的 tool-call 要求。 |
| 市场页。 | `@deepseek-ai/dsh-client-ui-plugin-market` 提供 Discover、索引源、搜索/筛选、详情；完整安装页还需 `ui-plugin-manager` 及对应 Remotes。 | market 有 6 个 spec，manager 有 9 个 spec；market 最近提交为 2026-10-29 `5444d2220c`，修复手机发现页工具栏溢出。`C/ui-plugin-market/tests/discover.client.spec.tsx:115-132,175,208` 覆盖加载/重试、首个源、安装确认、搜索和过滤；`tests/browser-plugin.client.spec.ts:13` 检查 Host 更新与 fiber 撤销。`src/client/index.ts:40-57` 将 Discover 注册进 plugins.tab，`market-store.ts:19-49` 定义分页与失败状态。 | 上游市场是 dsh plugin index/npm/git bundle 生态，不是已证实兼容的 Grok bot/skill 商店。需先明确 MVP 的“市场”对象是什么；若就是 dsh 插件市场，可原样复用核心；若是 bot 模板目录，不能宣称 ui-plugin-market 已覆盖模板导入语义。安装/启停仍依赖 profile-backed Host，见 `R/packages/bundle/web-app/cordis.patch.yml:311-315`。 |
| 设置页及每 bot 的 agent/model。 | `@deepseek-ai/dsh-client-ui-agent-preset` 有 preset roster、默认值和会话 chip/header/设置区；`@deepseek-ai/dsh-client-ui-model-selection` 是 session composer 与 /model 选择器；提供方设置还需 `ui-settings-models`、`ui-settings`、相应 settings 页面壳。 | preset 有 8 个 spec，model-selection 有 3 个 spec；最近目录提交分别为 2026-10-28 `a5f1d4a16a` 和 release `00d541438b`。`C/ui-agent-preset/tests/apply.client.spec.ts:354,371,381` 覆盖设置区与晚到 slot；`C/ui-model-selection/tests/browser-plugin.client.spec.ts:209,221,272,297,345` 覆盖 writer contention、两个入口共享状态与 session 隔离。`C/ui-agent-preset/src/client/index.ts:65-96,184-205,224-244` 说明绑定语义；`C/ui-model-selection/src/client/index.ts:134-160,178-193` 限制 addressed subagent 的模型选择。 | “全局默认 preset / 当前 session preset”不等于“每 bot 持久 preset/runtime”；需要 bot 记录和新 session 创建时的继承。model-selection 也不是完整模型提供方配置页，不能只装它就算设置完成。developer-tools gate、preset 变更对已有会话的规则、model 与 runtime 的区别需由产品契约明确。 |

上述六种能力的源码已有明确实现和测试资产，但没有做可运行的四页闭包实验，因此成熟度结论是“有产品实现与针对性测试，可作为集成起点”，不是“抽离后已通过验收”。

## 4. 样式隔离与 Grok 资产兼容性

| 项目 | 核实结果 | 对 Grok 字体 / 图标 / CSS 的结论 |
|---|---|---|
| 组件样式。 | 功能组件使用 CSS Modules 与 clsx，并引用语义 `--dsw-*` tokens；不是 Tailwind 或 StyleX。实际例见 `C/ui-primitives/src/Button.tsx:4-6,27-35`、`C/ui-chat/src/client/chat/ChatView.tsx:21`、`C/ui-approval/src/client/ApprovalCard.tsx:6`。上游规则见 `C/AGENTS.md:116-122`。 | 局部 class hash 能减少普通 class 冲突，但没有 Shadow DOM 级隔离。把 Grok 原 CSS 全局导入不能自动“换肤成功”，因为它的选择器不对应 dsh 模块化 DOM。 |
| 全局样式与 token。 | `C/ui-theme/src/client/styles.ts:2-23,29-63` 动态向 document.head 注入 base、design-platform、focus、scrollbar、shiki 等全局 sheet；`C/ui-theme/src/styles/base.css:6-34` 在 :root/body 定义字体和半径；ThemeDefinition 的 tokens 是 inline alias overrides，见 `C/ui-theme/src/client/index.ts:72-96`。 | 推荐用新 theme 插件把 Grok 的颜色、间距、圆角等映射为 dsh 语义 token，并针对四页壳写局部布局。Grok reset、body/button 规则与 dsh 全局 sheet 会互相影响，单靠导入顺序未必压过 inline token，应该走主题接口。 |
| 字体。 | `C/ui-theme/src/styles/base.css:26-31` 优先读取 body 的 `--dsh-font-family-text/code`；`C/ui-theme/src/theme-settings.ts:57-60,72-85` 提供字号与字体变量；Web 入口单独导入 `brand-font.css`，见 `R/apps/web/src/main.ts:2`。 | 可以直接复用已取得的 Grok font 文件与 @font-face，再在 theme/字体变量中设置。产品 wordmark 与正文是不同变量，不要只改 body font-family 后认定品牌字体也已替换。 |
| 图标。 | `C/ui-primitives/src/icons/index.tsx:1-6,17-23` 使用 `dsw-icon-*` 的 symbol sprite 和 currentColor。`C/ui-theme/src/client/index.ts:84-96` 已支持按图标 id 替换完整 SVG，并要求 namespace/viewBox、禁止 style/script、规范内部 id。 | Grok SVG 可映射到现有 icon id，或在自有 slot 占位组件中使用；无需 fork 每个调用者。独立用 primitives 而不启动主题时，要提供 sprite，否则使用 `<use>` 的图标可能为空。 |
| 品牌入口。 | 官方品牌由单独 `ui-brand-official` 插件填通用 sidebar/conversation slots，见 `R/packages/bundle/web-app/cordis.patch.yml:334-336`；侧栏公开 brand.mark/name，见 `C/ui-sidebar/src/client/index.ts:84-92`。 | 最短路径是替换品牌贡献插件与 theme，保留功能插件。Grok 原 CSS/图标能复用的前提是有对应 DOM/slot/token 映射，不是整包 CSS 覆盖后即可像素一致。 |
| 构建约定。 | theme CSS 使用 `?inline`，普通组件使用 `.module.css`；共享浏览器模块由 `C/web/src/platform.ts:8-15` 决定；feature `/client` 的 bundle 通过既有模块系统加载，见 `C/AGENTS.md:79-104`。 | 自有 Vite/renderer 构建应继续支持 CSS Modules、CSS inline、资产 URL 与统一 React identity。不要把已发布的动态插件 bundle 当普通 ESM 组件 barrel 强行 import。 |

**最终决策行：集成，第 2 级，同 SHA 保留 dsh 浏览器运行时与业务对象层，以外部插件/包装层替换 root、bot 导航、theme 与 Connection carrier。** 字体和图标大部分可以通过现成扩展点替换；Grok CSS 只选择性移用并映射 tokens/局部 DOM。严格“去 Cordis”应被明确识别为第 3 级改造任务，而不是 B′ 已经免费的能力。
