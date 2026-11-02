# Superagent 在本地 DSH 上安装与加载的兼容性

调查日期：2026-11-01。本报告只做静态分析，没有安装依赖、构建、启动 profile 或访问凭证。两个参考仓保持只读。下文 `SA/` 代表 `/home/lingxufeng/bot/repos/dsh-superagent-prototype/`，`DSH/` 代表 `/home/lingxufeng/bot/repos/deepseek-harness/`；所有文件行号均针对下面记录的本地 HEAD。

## 结论与复用决策

| 能力 | 候选（owner/repo@path） | 许可证 | 维护（最近 commit） | 决策 | 理由 / 适配工作量 |
| --- | --- | --- | --- | --- | --- |
| 在本地 DSH 0.2.2-alpha.2 安装、加载 superagent 并使用其管理与 worker 能力。 | deepseek-ai/dsh-superagent-prototype@src/、cordis.patch.yml；宿主 deepseek-ai/deepseek-harness@packages/boot/app-boot/、packages/bundle/web-app/。 | 两仓均为 MIT；superagent 的版权方是 DeepSeek Harness Team，DSH 是 DeepSeek。 | superagent：6337fc823ce20251c8de8085948165c81aaa701e，2026-10-31T20:05:39+08:00；DSH：ce7073d51254c26cd63b22a60835b8f948deb447，2026-10-30T00:13:15+08:00。本地 git log 与 GitHub list_commits 最新结果一致。 | **改造** | 复用现成业务实现和 bundle，至少迁移已经删除的 `sessionController.inspect` 调用；部署复用独立的 Web 模板 profile 和 loopback HTTP，不重写调度器。默认 headless/sdk 组合缺少原版要求的 Host 服务，不能把 bundle 加进去就认定可运行。改造范围初步集中在 DSH adapter；完整工作量需 builder 的类型检查与启动验证确定。 |

许可证证据：`SA/LICENSE:1–21`、`DSH/LICENSE:1–21`。维护证据：[superagent commit](https://github.com/deepseek-ai/dsh-superagent-prototype/commit/6337fc823ce20251c8de8085948165c81aaa701e)、[DSH commit](https://github.com/deepseek-ai/deepseek-harness/commit/ce7073d51254c26cd63b22a60835b8f948deb447)。本地没有 `cards/`，因此没有可补充的本地卡片案例；结论来自两仓源码、配置、版本 diff 和 GitHub 同 SHA 源码/许可证核对，不以 README 宣称代替源码证据。

最短路径是“改造现成 superagent + 复用 Web 宿主组合”，不是自建。只有当产品明确要求完全不监听 HTTP 时，才另做可选 HTTP 和替代管理入口的适配；这不是当前仓库已经提供的安装开关。证据：`SA/src/index.ts:8`、`SA/src/app/runtime.ts:201–217`、`SA/src/app/http.ts:230–247`。

## 1. 三个版本分别意味着什么

- superagent 的 DSH peer 范围主要为 `^0.2.1-alpha.2`，`engines.dsh` 也是该范围；devDependencies 多数固定在 `0.2.1-alpha.2`。这不是“只支持精确 alpha.2”的声明，也不是源码依赖已升到 rc.3。证据：`SA/package.json:53–56,62–123`。
- 部署文档推荐安装的 CLI 是 `@deepseek-ai/dsh@0.2.1-rc.3`；它是文档验证/推荐的部署基线，不应和开发依赖版本混为一谈。文档只说其他版本需要满足 `engines.dsh`，没有证明任意满足范围的版本 API 都兼容。证据：`SA/docs/006-deployment.md:75–85`。
- 本地 DSH 根包和 CLI 包版本为 `0.2.2-alpha.2`。证据：`DSH/package.json:3`、`DSH/apps/cli/package.json:4`。
- 当前 DSH loader 优先检查插件自己的 `engines.dsh`；存在它时不逐项用 DSH peer 范围做 admission。其 semver 检查明确使用 `includePrerelease: true`。按这个范围规则，不能因为宿主是 0.2.2 的预发布版就断言它被 `^0.2.1-alpha.2` 拒绝；范围通过也不等于 API 兼容。证据：`DSH/packages/boot/app-boot/src/plugin-compatibility.ts:51–80`。
- pnpm 的 peer 解析、`link:` 外部 checkout 内部 devDependencies 的解析、以及 loader 的版本 admission 是不同层。本次没有运行安装，不能宣称运行时一定共用正确的一份 Cordis/DSH 服务类型。此项交给 builder 验证，不建议先用版本豁免绕过问题。证据：`SA/package.json:62–123`、`DSH/packages/boot/app-boot/src/profile.ts:1–21`、`DSH/apps/cli/src/plugin.ts:80–105`。

## 2. 真正使用的 API 与兼容性

### 2.1 `src/core/ports.ts` 不是 DSH API 依赖点

`ports.ts` 只从本项目的 `model.ts`、`reasons.ts` 引入领域类型，定义 Policy、Assessor、Executor、Outbox、Repositories 等接口。它没有 import DSH 包，因此不能根据这份文件推断 DSH API 兼容或需要重写 core。真正的宿主耦合在 `src/app/`、`src/executor/`、`src/infra/` 及浏览器入口。证据：`SA/src/core/ports.ts:1–135`、`SA/src/index.ts:1–23`、`SA/src/app/sessions.ts:1–16`。

### 2.2 确认存在的破坏点与保留接口

| 调用面 | superagent 的实际调用 | 当前本地 DSH 证据与判断 | 适配建议 |
| --- | --- | --- | --- |
| 完整 transcript 读取。 | `SA/src/app/resources.ts:114–116` 调用 `sessionController.inspect(workerSessionId(...)).events`；第 272、284 行依赖其事件数组做资源读取。 | **确定不兼容。** 对 `dsh-v0.2.1-rc.3..HEAD` 的只读 diff 确认 `SessionController.inspect` 和对应 import 已删除。当前同文件提供 `events(request, signal)`，不再提供旧方法；见 `DSH/packages/api/session-controller/src/index.ts:521–542`。旧接口可对照 [rc.3 源文件](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/api/session-controller/src/index.ts)。 | 必须迁移这个 adapter。`events` 是带地址、固定 cut、游标和页预算的分页接口，不能机械改方法名或只读第一页。应保持旧资源索引语义，处理完整事件前缀和取消。当前持久化层也提供 read handle，但替代方案要明确活跃 Session、冷 Session 及持久化 flush 的可见性，不可未经验证直接替换。 |
| 角色模型初始化与 request waterfall。 | `SA/src/app/role-models.ts:15–43` 先 append `model/selection`，再通过 `system-prompt/assemble` 和 `agent/request` middleware 设置初始模型字段。 | **存在新约束，不是已证实的必现故障。** 当前 `AgentModel.current/select` 读取/写入 durable model selection；见 `DSH/packages/core/agent/src/model-selection.ts:72–120`。当前 loop 禁止 `agent/request` middleware 将 provider/model/effort 改成不同于 step 捕获值的路由；见 `DSH/packages/core/agent-loop/src/agent.ts:612–652`。但 superagent 已先写入 selection，捕获值可能与 middleware 相同，故不能断言首次请求必抛错。 | 优先验证首次主会话、首次 worker、router、不同 reasoningEffort 和恢复。可考虑用 `agent.model.select()` 替换手写初始化适配并删除不再必要的路由覆盖，但是否必须改由实测决定。模型迁移指南位于 `DSH/docs/upgrade-guide/v0.2.1-alpha.4/session-model-selection/guide.zh.md:14–26`，不能把所有模型选择变化都归因于 rc.3 → 0.2.2。 |
| Agent、Session 创建和重命名。 | `SA/src/app/sessions.ts:138–154` 调用 workspace create、`resolveAgent`、`sessionController.create({sessionId,workspaceId,agentPreset})`、rename。 | 已核对的公开方法和字段仍存在；见 `DSH/packages/api/session-controller/src/index.ts:268–270,304–305,434–435`、`DSH/packages/api/session-controller/src/types.ts:265–273`。未发现这些方法被改名。 | 不预先重写；保留实际创建 Session 的集成测试。方法存在不代表所有事件和默认行为均已验证。 |
| Session 快照、请求头和 preset 查找。 | `SA/src/app/sessions.ts:240,274–307` 读取 snapshotEvents、presetForSession、projection/header，调用 scopeParentOf。 | 已核对 `snapshotEvents`、`requestHeader`、`presetForSession`、`scopeParentOf` 仍存在；见 `DSH/packages/core/session/src/index.ts:728,927`、`DSH/packages/preset/agent-preset-registry/src/index.ts:89`、`DSH/packages/core/scope/src/index.ts:89`。 | 没有证据支持为这些名字加兼容 shim。恢复和父子 Session 路由仍需实测。 |
| 工具注册、限制和查询。 | `SA/src/app/sessions.ts:208–214,263–264,291–293` 使用 register/restrict/get/guard，并注册带 schema/render 的输出。 | 已核对 register/restrict/get 仍存在，且输出 schema/render 校验仍在；见 `DSH/packages/core/tools/src/index.ts:128–136,162–182,239`。当前内部执行结构变化不等于这些 consumer 方法已删除。 | 复用原代码，测试 main/worker/router 工具可见性和实际拒绝路径。本次不是完整工具权限审计，不能据此宣称所有 guard 行为已通过。 |
| 持久化读写与消息投递。 | `SA/src/app/delivery.ts:45–84` 使用 flush、open(read)、handle.read 和 Agent inbox。 | `sessionPersistence.open(id, access, options?)`、flush 仍存在；见 `DSH/packages/session/session-persistence/src/index.ts:161–187`。 | 这部分不应与被删的 controller.inspect 混为一谈。完整 inbox、后台取消、恢复语义没有全部动态验证。 |
| Web 路由。 | `SA/src/app/http.ts:230–247` 注册 `/orchestrator` 前缀，处理 `/orchestrator/api/`。 | webServer 的 host/port/register 仍存在；见 `DSH/packages/host/webserver/src/index.ts:405–445`。rc.3 → HEAD 的 register 接受类型扩展不是已发现的改名破坏。 | 保留路由。当前 port getter 类型包含 undefined，superagent 的 sameOrigin 参数是 number；是否造成目标依赖下 typecheck 问题和监听时序问题尚未验证，不能当作已确认版本新增故障。证据：`SA/src/app/http.ts:75`。 |
| Web 客户端 Session 导航。 | `SA/src/navigation.ts:14–22` 使用 sessions.list/getSnapshot/refresh；`SA/src/client/index.tsx:31–57` 使用 uiWorkspace 和 slots。 | 当前 ISessions 仍公开 list、refresh；见 `DSH/packages/api/session-controller/src/client/contract/sessions.ts:49–51,108–112`。 | 这只证明导航依赖的部分接口仍在，不代表 slots、配置面板等全部 UI 兼容。若本阶段只走 HTTP，UI 全面回归可以另列，但不能对外宣称完整 UI 已兼容。 |

### 2.3 `cordis.patch.yml` 的包名与配置

这份文件是 Cordis 插件组合 overlay，不是对 DSH 源码打补丁，也不是 pnpm patchedDependencies。superagent 在 `package.json` 的 `dsh.bundle.patch` 声明它，Host 按 profile 的 bundle 顺序加载。证据：`SA/package.json:30–33`、`DSH/packages/boot/app-boot/src/profile.ts:685–710`。

该 overlay 插入主插件、GitHub Source、默认禁用的 Feishu Source，并声明两个 preset：`dsh-superagent-worker` 与 `dsh-superagent-router`。证据：`SA/cordis.patch.yml:1–21,125–126`。已逐个对照本地 package manifest，所引用的 DSH 插件包在本地仍存在，没有发现包名迁移或删除；但“包存在”不等于已经完整验证每个配置字段及依赖闭包。

| overlay 内容 | 本地源码对应 | 静态结果 |
| --- | --- | --- |
| Agent preset、persona、instructions、time context。 | `DSH/packages/preset/agent-preset/`、`preset/persona/`、`context/agent-instructions/`、`context/time-context/`；引用见 `SA/cordis.patch.yml:21–37,126–138`。 | 包仍存在；preset 插件自身要求 `agentPresets`，见 `DSH/packages/preset/agent-preset/src/index.ts:13`，默认 SDK/headless 缺少该 registry 的问题不能通过包名存在来消除。 |
| Bash/PowerShell sandbox 与工具、文件工具。 | `DSH/packages/shell/{bash-sandbox,pwsh-sandbox,tool-bash,tool-pwsh}/`、`packages/fs/{tool-fs,tool-fs-search}/`；引用见 `SA/cordis.patch.yml:39–69,140–168`。 | 包仍存在。Bash sandbox 当前注入 subprocess/sandbox/sandboxPolicy，并继承 local executor 配置，见 `DSH/packages/shell/bash-sandbox/src/index.ts:29–50`。fs-search 的 sampleOverCapGlobResults 仍存在，见 `DSH/packages/fs/tool-fs-search/src/index.ts:76–99`。timeout 配置和全部依赖闭包未逐项完成 schema 验证。 |
| jobs、skills、compaction。 | `DSH/packages/jobs/tool-jobs/`、`packages/skill/{skill-filesystem,tool-skill}/`、`packages/compaction/{compaction-basic,command-compact,compaction-tool-result-pruner}/`；引用见 `SA/cordis.patch.yml:71–93,170–192`。 | 包仍存在；jobs 的 waitTimeoutMs/maxWaitTimeoutMs 仍存在，见 `DSH/packages/jobs/tool-jobs/src/index.ts:45–74`。pruner 等全部配置字段没有逐项验证。 |
| worker 的 subagent、todo、web。 | `DSH/packages/subagent/{tool-subagent-control,tool-subagent}/`、`packages/todo/tool-todo/`、`packages/web/tool-web/`；引用见 `SA/cordis.patch.yml:95–120`。 | modelSelection/modelDiscovery/agentPreset 仍存在，见 `DSH/packages/subagent/tool-subagent/src/index.ts:59–100`；allowParallelInProgress 仍存在，见 `DSH/packages/todo/tool-todo/src/index.ts:37–42`；fetch/searchTimeoutMs 仍存在，见 `DSH/packages/web/tool-web/src/index.ts:43–65`。没有发现这些配置被改名。 |

## 3. headless/sdk 能否直接加载，以及 HTTP 的替代入口

### 3.1 默认组合不能原样承载整个 bundle

当前 profile 模板明确为：web = base + web-app；headless = base + headless；sdk = base + sdk-app；sdk-minimal 为自己的最小 bundle。证据：`DSH/packages/util/official-bundles/src/bundles.ts:9–25`。同文件第 28–34 行还记录旧 headless tuple 曾包含 web-app；不能拿旧版组合经验推断当前 headless 仍有 Web Host。

superagent 主入口硬注入 `webServer`、`sessionController`、`workspaceRegistry` 等服务；其 preset 还需要 `agentPresets`。证据：`SA/src/index.ts:8`、`DSH/packages/preset/agent-preset/src/index.ts:13`。

- 当前 headless bundle 明确不挂 Host/HTTP/Web/browser；其 runner 面向单次任务，完成后退出，且不接管带 preset 的 Session。它既不是现成的常驻 superagent daemon，也不是仅少一个浏览器。证据：`DSH/packages/bundle/headless/cordis.patch.yml:1–25`、`DSH/packages/bundle/headless/src/index.ts:223–231,367–370,435–443`。
- sdk-app 提供 SDK JSON-RPC server，注释明确不启动 Web server；默认组合也没有 superagent 所需的 SessionController 和 preset registry。证据：`DSH/packages/bundle/sdk-app/cordis.patch.yml:17–21,46–54`；对照 Web 组合显式安装这些服务的位置：`DSH/packages/bundle/web-app/cordis.patch.yml:117–118,175–176,586–593`。
- 因此，将原版 superagent bundle 直接加到默认 headless/sdk，不能认定它会就绪。只补 webServer 也不足以证明可运行：当前 SessionController 自身还有 attachments、fileUploads、remoteAccess、sessionQuery、typert、typertGateway、workspaceRegistry 等注入要求。证据：`DSH/packages/api/session-controller/src/index.ts:136–150`。

profile 名称不必叫 `web`，也不要求打开浏览器。上游选择的是一个名为 `superagent`、从 Web 模板创建的独立 profile。对于当前目标，这是现成依赖闭包最充分、改动最少的路线；另造精简 daemon profile 可以做，但需要重新验证服务闭包，不能说它已受原版支持。证据：`SA/docs/006-deployment.md:79–87,107`。

### 3.2 loopback HTTP 不是可选 UI 附件

Runtime.initialize 无条件调用 registerHttp；后者严格要求 `ctx.webServer.host === '127.0.0.1'`，否则抛错，再注册 `/orchestrator/api/`。这里的判断不是泛指所有 loopback 地址，`localhost` 和 `::1` 也不满足该字面条件。证据：`SA/src/app/runtime.ts:201–217`、`SA/src/app/http.ts:230–247`。

因此，默认 headless 下没有自动降级处理：既没有 webServer 注入，也没有内置的无 HTTP 分支。关闭管理 UI 不会取消该硬依赖。管理脚本和浏览器客户端都调用 HTTP，而 HTTP 的存在本身不要求打开浏览器。证据：`SA/scripts/dsh-superagent:83`、`SA/src/client/api.ts:37`、`SA/src/app/http.ts:230–247`。

没有发现提供等价 `/orchestrator/api/` 管理面的现成 SDK/stdio 入口。SDK JSON-RPC 是 DSH 自己的传输，并不会自动发布 superagent 的 Node req/res 路由。同进程的 orchestrator SourceHost、Runtime.receive/pump 等方法，以及 main Session tools 是其他入口，但不等价于完整管理 API，也不会自动移除 webServer 注入。证据：`DSH/packages/bundle/sdk-app/cordis.patch.yml:17–21`、`SA/src/app/runtime.ts:88,194–197`、`SA/src/app/http.ts:195–247`、`SA/src/app/tools/main.ts`。

特别是配置保存、暂停等 HTTP 操作带 `origin: 'panel'` 权限语义，不能为了无 HTTP 部署就把它们偷换成普通 main tools 并当作权限等价。证据：`SA/src/app/http.ts:195–217`。本阶段建议保留 `127.0.0.1:3082` 管理 HTTP；纯 SDK 管理若成为确定需求，应作为单独的 adapter 改造验收。

## 4. 安装位置、profile 与两层 patch

### 4.1 上游原文安装步骤

以下是 `SA/docs/006-deployment.md:73–85` 的原文命令，仅摘录，**本次没有执行**。已有本地 checkout，不应再 clone；也不应为了照抄文档而覆盖用户当前的全局 DSH。

```sh
npm install -g @deepseek-ai/dsh@0.2.1-rc.3
git clone <this repository> dsh-superagent && cd dsh-superagent
pnpm install && pnpm build
dsh superagent --from-default-profile web --dump-config > /dev/null
dsh plugin --profile superagent add "link:$PWD"
```

文档随后明确：第四条命令从 Web 模板创建 `~/.dsh/profiles/superagent`，第五条把 bundle 装入这个 profile；`DSH_HOME` 可迁移 `~/.dsh`。已有 profile 不可再次用该创建命令升级，因为它会替换 profile 并删除机器配置 patch。证据：`SA/docs/006-deployment.md:85–87`。

CLI 确实把 profile 目录和当前调用 cwd 分开传给包管理操作；bundle 安装不是往全局 Web profile 随便追加一个插件。证据：`DSH/apps/cli/src/plugin.ts:80–98`。成功包管理操作后，新发现的 bundle dependency 会被自动加入 profile 的 bundles 列表；证据：`DSH/packages/boot/app-boot/src/profile-plugins.ts:95–132`。实际 `link:` 在本机形成的 symlink/peer 依赖树尚未安装验证。

### 4.2 不要混淆两个同名 patch

1. **bundle 层：** `SA/cordis.patch.yml` 随 package 发布/链接，由 `SA/package.json:30–33` 声明。DSH 解析 profile package.json 的 `dsh.profile.bundles`，顺序读取每个 bundle 的 patch，再读取 profile 自己的 patch；见 `DSH/packages/boot/app-boot/src/profile.ts:685–710`。这份 bundle patch 不应被直接复制到 profile 路径替代机器配置，也不应复制进 DSH 源码仓打补丁。
2. **profile 机器配置层：** 上游要求将 `SA/examples/profile.cordis.patch.yml` 复制到 `$DSH_HOME/profiles/superagent/cordis.patch.yml`，替换占位值。它只覆盖已有 webserver 和主插件配置，并按需启用 Feishu；见 `SA/docs/006-deployment.md:89–98`、`SA/examples/profile.cordis.patch.yml:1–12`。

示例原文关键项为：

```yaml
- id: webserver
  config:
    host: 127.0.0.1
    port: 3082
- id: dsh-superagent
  config:
    stateDir: <absolute path, for example /home/me/.dsh/state/superagent>
```

`stateDir` 必须是替换后的真实绝对路径，不能保留尖括号占位。它保存 SQLite、锁、worker-bin 等状态，不是 bundle 的安装目录。证据：`SA/docs/006-deployment.md:93–98`、`SA/src/app/runtime.ts:91–98`。bundle patch 本身也明确要求由 profile 提供 stateDir，未配置时拒绝启动；见 `SA/cordis.patch.yml:1–3`。

启动原文为 `scripts/dsh-superagent start` 和 `scripts/dsh-superagent status`。脚本在 tmux 中运行 `dsh --profile superagent`，等待 ready 或 setup 需求；profile/URL 可通过参数或环境变量覆盖。证据：`SA/docs/006-deployment.md:100–111`。完整可用还需要 provider、账户及 superagent 自身 setup，插件装入 profile 不等于已完成所有配置；见 `SA/SETUP.md:27,55–74`。

## 5. builder 的最小实测缺口

以下均为**未验证**，不能把本报告当成安装成功或产品可交付的证明。

1. 在隔离的应用副本及独立 `DSH_HOME` 中，使用目标 `0.2.2-alpha.2` 安装/链接改造后的 superagent，核查 profile 的 dependencies、bundles 和实际解析到的 Cordis/DSH 包版本。不要改 `repos/`，不要覆盖已有用户 profile。依据是 `SA/package.json:53–123` 和本报告第 4 节的加载顺序。
2. 用目标依赖执行 superagent 的 typecheck/test/build，首先修复 resources.ts 的 inspect 调用，再处理真实编译错误，不凭静态猜测批量重写适配层。项目已有 check 脚本串联这些检查；见 `SA/package.json:47–51`。
3. 从 Web 模板建立全新的测试 superagent profile，合入示例机器 patch，验证插件和两个 preset 都激活、HTTP 监听严格绑定 127.0.0.1、status 给出 ready 或可解释的 setup 需求。现成期望见 `SA/docs/006-deployment.md:79–111`。
4. 验证首次主会话、worker、router 的模型选择和 reasoningEffort，与恢复后 durable selection 一致；覆盖 loop 的不同路由拒绝约束，不能只测默认模型。相关证据见第 2.2 节模型行。
5. 对活跃和冷 worker 都读取 transcript/tool/resource，覆盖分页后的长记录及稳定索引；然后做一次服务级优雅停止/再启动的恢复验证，核查无重复投递、状态锁释放。不要重启机器。相关证据：`SA/src/app/resources.ts:114–116,272–284`、`SA/src/app/runtime.ts:235–243`、`SA/src/app/delivery.ts:45–84`。
6. 若计划提供 UI，补测侧栏、Session 导航、部署配置保存；若要求纯 SDK/无 HTTP，则另立可选 HTTP 与管理传输适配任务，不能把默认 sdk profile 的 JSON-RPC 当作现成替代。证据：`SA/src/client/index.tsx:31–57`、`SA/src/app/http.ts:195–247`。

三个调查问题均已有静态结论；真实安装、完整配置 schema、依赖解析、首次请求和恢复行为留给 builder，不再扩展为自建或逆向任务。
