# P7 主 bot 自主管理：复用调研

调研日期：2026-11-05。范围：长期 bot CRUD、插件/MCP 市场管理、SDK/应用自重启、可回退护栏。只读调查；未安装包、未运行应用、未重启进程、未读取凭证、未改产品代码或 `repos/`。

## 1. 结论

**现有底座能覆盖大部分执行能力，不应另写 bot 存储、市场客户端、包管理器或进程监督器。** 最短路线是主 bot 专属的受限管理 consumer，复用 main 编排与 dsh 服务；继续禁止原始 `plugin_manager`。这里的自主权是用户已授予的产品权限，不是将所有工具设成 `danger-full-access`。

有三个容易误判的事实：

1. **dsh 已有持久会话 archive/unarchive，可直接作为 bot 软删除底座**，不是必须新建回收站数据库；没有发现自动到期清理/保留期 API。
2. **本仓 restore 链可复用，但不足以直接承接任意 SDK 热重启**：main 只在启动时读取地址/token；就绪闸门是单向打开，重连不重新关闭。
3. **参考源码与已安装包存在差异**：安装的 plugin-manager `0.2.2-alpha.2` 已有 `updateBundle` 的失败重装旧版本逻辑，不能依据参考仓较早实现断言“完全没有回滚”；但这不是任意卸载的事务回滚。

## 2. 基线、版本及维护证据

- 参考仓：`repos/MANIFEST.tsv` 已有 `deepseek-harness`；本地 SHA `ce7073d51254c26cd63b22a60835b8f948deb447`。下文 `DSH/` 指 `repos/deepseek-harness/`，`SDK/` 指 `app/sdk/`，`UI/` 指 `app/ui/`，路径均相对 `/home/lingxufeng/bot/`。
- 已安装：`SDK/package.json:21–24` 锁定 `@deepseek-ai/dsh`、plugin-manager 为 `0.2.2-alpha.2`；`SDK/pnpm-lock.yaml:1370,1696` 同代 HMR/manager。优先复用这套制品，不能单独跟 npm latest 混装。
- dsh 上游最新 commit：[`fcc0ad4`，2026-11-04](https://github.com/deepseek-ai/deepseek-harness/commit/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159)；[MIT LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/LICENSE)。GitHub `list_issues` 返回 0，**issue 回应活跃度未验证**；代码/发布活跃属实，严格按 §3 双条件不能把回应情况写成已通过。
- npm 实查 `npm view <pkg> version time.modified repository --json`：plugin-manager latest `0.1.6-alpha.2`（2026-11-04）、hmr 同号同日、agent-preset-registry `0.1.7-alpha.1`（同日）、workspace 与 tool-session-query latest `0.0.1-rc.1`（同日）。这些 dist-tag 号与已装统一版本号不同，**不能用大小比较判断功能倒退/升级**。
- 此任务明确 `repos/` 只读，故没有 clone 新候选或追加 MANIFEST；外部候选以 GitHub 固定 SHA 源码与 LICENSE 为证。若后续决定搬文件，再由获授权任务 clone/登记。

## 3. 决策表

“集成”包括复用现有包与本仓既有编排，不代表原样向模型开放全部管理权限。估量为相对适配量，不是工期承诺。未选候选仍按四种决策给出可行路线，理由注明本轮不选。

| 能力 | 候选（包 / owner/repo@path） | 阶梯级别 | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---:|---|---|---|---|
| 长期 bot 创建、列表、改名、选模型 | 本仓 `UI/main/m3-meta/orchestrate.ts` + dsh session-controller/preset 服务 | 1 | dsh MIT；本仓独立许可证未核验 | 本仓当前基线 `75267c6`，2026-11-05；dsh 11-04，issue 回应未验证 | 集成 | **首选**。复用强制 workspace、recipe 先落盘、身份重验；只加模型 consumer 和受限 main 通道，适配小到中。[A] |
| 直接用现成模型工具管理 bot | `@deepseek-ai/dsh-tool-session-query`、`dsh-tool-subagent`、agent-preset-registry | 1 | MIT | dsh 11-04；回应未验证 | 集成 | 查询/委派局部可用，**不能替代长期 bot CRUD**；query 是只读历史，subagent 是任务子代理，preset select 首轮后锁定。本轮不把它们包装成“完整管理员”。[B] |
| 第三方 persona / MCP / 回收站管理 | npm `dsh-plugin-tool-management@0.22.0`，`ouli-1242/dsh-plugin-tool-management@src/tools/{subagent,remove}.ts` | 3 | MIT | commit 2026-11-05；npm 11-04；issue 回应未验证 | 改造 | **当前不选**：确有模型 upsert、开关、回收站工具，不能说 GitHub 没有；但对象是机器级 persona/场景，不是本仓 session+recipe+createdBy 的 bot；engines 要求 `>=0.2.2-rc.1 <0.2.3`，当前 alpha 不在范围，且 consumer 文案依赖逐次用户指令。复制其胶水比复用现有 main 更长。[C] |
| 已开始 bot 的 preset/连接器修改 | 本仓 recipe/ensure + dsh preset revision/select | 5 | 本仓；dsh MIT | 同上 | 自建 | **仅本仓业务语义适配**，非重写 preset 引擎。普通 select 明确锁定；第三方 persona 文件也不等价于修改既有 bot。需定义在原会话更新，还是新会话替换并保留旧会话；两者不能伪装成 rename。[A][B][C] |
| 市场浏览与精确安装 | 现有 `pluginMarket/*` + `pluginManager/installBundle` + 本仓 npm MCP wrapper | 1 | dsh MIT；wrapper 本仓 | dsh 11-04；回应未验证 | 集成 | **首选**。复用现有安装链，主 bot consumer 保留来源/版本约束、`enabled:false`；适配中。CONTRACT **#15 才是安装，#16 是 listBundles**。[D] |
| 原始全局插件模型工具 | `@deepseek-ai/dsh-plugin-manager/tools` 的 `plugin_manager` | 1 | MIT | 同上 | 集成 | 服务值得复用，**原 consumer 不启用**：任意 profile 变更/启停/兼容豁免超出受限管理员需求；P5 双层禁用继续保留。[E] |
| 上游现成市场模型浏览 | `@deepseek-ai/dsh-plugin-market/tools` 的 `plugin_market` | 1 | MIT | 同上 | 集成 | 只读索引/插件/版本工具可作为 consumer 参考；不负责安装，更不解除原 manager 的审批。当前 preset 也禁用了 market 工具，需显式接线验证。[F] |
| 可恢复 bot 删除 | `@deepseek-ai/dsh-workspace` archive/unarchive + workspace-controller | 1 | MIT | 同上；已装 alpha 中也核对到实现 | 集成 | **首选**。持久归档保留 session 日志/位置，支持停活动后归档；补主 bot 保护、列表投影与 restore 路由，不写第二套 archive 集合。[G] |
| bot 删除保留期 / 自动 purge | dsh session-persistence；本仓 M3；第三方 persona trash | 5 | MIT / 本仓 | 同上 | 自建 | **仅在确需到期清除时**。dsh 明示无 deletion/retention API；M3 无 deletedAt；第三方 trash 是 persona 文件而非 bot session。当前先无限期可恢复，不为尚未要求的物理清除新建调度器。[G][H][C] |
| 插件逻辑卸载及恢复 | `pluginManager.setBundleEnabled(false/true)`，保留依赖 | 1 | MIT | dsh 11-04；回应未验证 | 集成 | **可回退路径首选**。必须清点所有 bot 配方引用；profile 禁用不一定阻止 preset 层重新引用。不能把 disabled 回执说成已经物理删除。[I] |
| 插件更新失败恢复 | 已装 manager `updateBundle` + install snapshot/cancel | 1 | MIT | 已装 `0.2.2-alpha.2`；上游发布活跃 | 集成 | 复用有限补偿：更新失败重装精确旧版，安装失败还原部分 profile 文件；不是任意副作用回滚。[I] |
| SDK 插件热重载 | `@deepseek-ai/dsh-hmr` + manager reload | 1 | MIT | npm 2026-11-04；回应未验证 | 集成 | 优先热重组，按 `application/restartReason` 决定是否真重启；HMR 不保证替换失败恢复旧代码。[J] |
| 应用自重启 | 已装 `electron@44.7.0` 的 `app.relaunch`；dsh desktop recovery 实例 | 1 | Electron MIT；dsh MIT | npm electron latest 45.2.3，11-04；未另核 issue 回应 | 集成 | 最短原生能力，无需新 supervisor；复用 relaunch 顺序，**不搬人工 modal 恢复循环**。SDK 若独立进程，仍需其 owner 配合。[K] |
| SDK 进程自愈 / 有界重启 | npm `pm2@7.1.2`，`Unitech/pm2@lib/God.js` | 1 | AGPL-3.0（私用不作否决项） | commit/release 2026-11-03；owner 当日回应 issue #5030 | 集成 | **若要独立 SDK supervisor，首选活跃候选**。退避/限额/退出监控复用；需隔离 PM2_HOME、受控单进程、环境白名单、地址/token handoff 与恢复门控，适配中；不依赖全局 PM2 daemon。[L] |
| SDK 监督备选 | npm `forever-monitor@3.0.3`，`foreversd/forever-monitor@lib/forever-monitor/monitor.js` | 3 | MIT | commit 2020-11-21；npm modified 2024-05-31 | 改造 | **不选**。超过六个月；默认 env 合并、killTree/SIGKILL 策略需改，不比 PM2 或现有 spawn owner 更短。[M] |
| 重启请求持久化/完成回执/代际恢复门控 | 本仓 P6 SDK→main 请求通道、M3 restore、launcher/handoff | 5 | 本仓 | 当前项目持续修改 | 自建 | 只补本应用协议胶水。HMR 不管退出交接；Electron relaunch 不管 SDK；PM2 不懂 bots-meta/restore；forever 更不懂。不能把运行中的 tool promise 跨重启继续等待当作交付协议。[N] |

## 4. 长期 bot CRUD 的可复用边界

### [A] 本仓 main/M3 已经承担关键不变式

- `UI/main/m1-api/index.ts:12–29` 已允许 list/create/rename/selectModel 与市场读/安装，没有 archive/delete/removeBundle；`:35–44` 保留凭证、account、permission、configForms 禁区。
- `UI/main/index.ts:102–119` 把两类创建交给 main，而不是裸转发 `session/create`。`UI/main/m3-meta/orchestrate.ts:199–229` 拒自带 cwd/workspaceId、生成独立工作区；`:318–383` 的 createWorkerBot 把 createdBy 先写入并校验当前主 bot，rename 失败不诱导重复创建。
- `work/p3-contract/CONTRACT.md:77–84` 已有 SDK→main 请求流 + respond unary 先例：仅 main 能 respond、断流在途作废、unknown 不自动重试。可复用这个模式，不必为 admin 另引 MCP server；但 P6 create_worker 只接受受限字段，**不是**已有全配置长期 bot CRUD。
- `CONTRACT.md:86–108` bot 与 session 1:1；recipes 可能共用；`bots-meta.patch` 只改 mainBotId，不是通用配置编辑器。不能删除一个 bot 时顺带清除共享配方。
- `orchestrate.ts:266–299` roster 以 session list 派生；加归档需联动投影，不能仅把 bots.json 某条删掉就认为 session 已删除。

### [B] dsh 原生模型工具不是完整管理工具

- `DSH/packages/experimental/tool-session-query/src/index.ts:65–121` 实际只注册 session_search、session_event_search、session_trace、session_event_trace、session_event_read，均为历史查询。npm 最新包已移动到 session-query 分组，不能把本地实验路径当最新布局。
- `DSH/packages/subagent/tool-subagent/src/index.ts:208–255,268–277` 启动独立任务子代理，可选既有 preset；没有本仓 bots-meta/recipe/主 bot 身份规则。
- `DSH/packages/preset/agent-preset-registry/src/index.ts:350–381` 虽有 recompose 和 revision 基础，但 `select` 在 open turn 或 lastTurn>0 时返回 `agent-preset/locked`。**不能由此推导运行中任意 preset 变更已经可用**。
- `CONTRACT.md:147–152` 现行约定更明确：已有 session preset/连接器创建后固定，模型可改。p7 若改变此约定，需要专门行为与历史重构设计；不是调用现成 select 就行。

### [C] 搜到的第三方管理包：真实能力与不适配点

固定来源：[`ouli-1242/dsh-plugin-tool-management@fce66db624c9f50e1323ff2885447760526c9ca6`](https://github.com/ouli-1242/dsh-plugin-tool-management/tree/fce66db624c9f50e1323ff2885447760526c9ca6)。已读源码与 LICENSE，不只 README。

- [`src/tools/subagent.ts`](https://github.com/ouli-1242/dsh-plugin-tool-management/blob/fce66db624c9f50e1323ff2885447760526c9ca6/src/tools/subagent.ts) 有 persona list/run/switch/save；save 读现状后合并省略字段，再调 subagent-create/update；机器级 persona 文件不等于本仓 bot session。
- [`src/tools/remove.ts`](https://github.com/ouli-1242/dsh-plugin-tool-management/blob/fce66db624c9f50e1323ff2885447760526c9ca6/src/tools/remove.ts) 有 trash/restore/list，模型工具不 purge；面向 memory/skill/persona/preset/scene。**未深读其底层 trash 实现，不宣称已验证掉电原子性或保留期**。
- [`package.json`](https://github.com/ouli-1242/dsh-plugin-tool-management/blob/fce66db624c9f50e1323ff2885447760526c9ca6/package.json) 明确宿主范围 rc.1 起，和本仓 alpha 不相容；不建议用版本豁免硬装。要整仓集成会增加自己的场景/侧车/全局 persona 状态，与本仓 M3 双写，而非删除代码。
- 若未来改为 persona 管理产品，可重新评估直接依赖；当前不搬这些文件。若决定搬，来源格式就是上述 URL@SHA:path，不从 main README 摘代码。

## 5. 插件市场与 MCP：可用能力及逐条风险

### [D] 现有市场链能替代什么

- `CONTRACT.md:38–43`：#12 indexes、#13 search、#14 detail、#15 install、#16 inventory；`UI/main/m1-api/index.ts:85–95` 强制安装 options.enabled===false。
- `SDK/profile/patches/market.yml:20–29` 已接 plugin-market 与 p2temp；无需重写市场读取。`work/p2-sdk/reuse/market-backend.md` 已选 dsh market/manager/mcp-client，继续共用。
- `SDK/src/market/wrapper.mjs:118–165,185–205` 给**预置、精确版本相同、具有 bin 的裸 npm MCP 包**生成 dsh bundle，patch 既有 installBundle；其他 spec 透传，仍可能报 not-bundle。不是“市场里任何 MCP 一键可用”。
- wrapper 对大多数 server 零参数启动，必需参数仅少数包有表；`:69–85`、`:155–162` 说明局限。Python/uvx、远程服务授权、任意环境变量/密钥输入，本轮没有证据证明此路径已支持。
- browse/安装服务可复用，但现有 M1 **没有**卸载、启用或机器人管理权限。不要通过扩大 renderer 白名单绕过 main 的身份/审计，而应让 admin consumer 调受限 main 编排/既有服务。

### [E] tool-plugin-manager 的实际能力和风险

已同时核对参考源码 `DSH/packages/boot/plugin-manager/src/tools.ts:75–163` 与**已装制品** `SDK/node_modules/@deepseek-ai/dsh-plugin-manager/lib/types/tools.js:74–151`。两者的八个 action 一致：list_plugins、list_bundles、set_plugin、set_bundle、install_bundle、remove_bundle、list_version_exemptions、set_version_exemption。已装服务有 updateBundle，**该模型 consumer 没有 update action**。

1. **全 profile 影响所有 session**，非单 bot 插件列表；模型可能把停用某 bot 的连接器误作全局停用。
2. **任意可寻址插件 entry 启停**。保护 manager 自身不等于保护 p2sdk-shell-ask、fs guard、身份桥等本仓安全插件；不能只用上游 management-required 当安全清单。
3. **安装是宿主代码执行面**。工具的 escalation justification 明言安装代码在 workspace sandbox 外；`enabled:false` 不消除 pnpm 与已允许 build script 的副作用。
4. **安装默认 enabled=true**，与本仓“先安装、按 bot recipe 引用”约定不同；必须由执行器强制，不能只写 prompt。
5. **接受 npm/git/tarball/本地路径 spec，以及 registry 参数**，扩大供应链与路径入口。自主安装应只接受受信市场条目解析出来的精确坐标，模型不能自行选内部 URL、本地目录或任意 registry。
6. **approvedBuilds 是 profile 持久授权**；不是一次性批准。上游校验 pending builds 不等于已得到人类同意；模型传布尔/数组不能证明用户已批准。
7. **版本豁免**可绕过兼容性拒绝，acceptRisk 是模型参数；不应授予主 bot 直接更改运行时兼容豁免的能力。
8. **所有 action，包括 list，都先走 danger-full-access/单次审批**；且 nextStep 对部分错误要求问用户或人工重启。它的 consumer 交互与本需求“已获自主权限”不匹配，不能用全会话提权消除提示。
9. **卸载/禁用可能破坏共享 recipe**，并触发 stop-profile、bundle-in-use、overridden、restart-required；API resolve 不是成功，必须读取 application、changed、error、restartReason。

这些是源码可见的权限面，不是本轮运行复现的漏洞结论。

**为什么 P5-03 禁用**：`SDK/profile/patches/approval.yml:43–56` 解释 preset 内嵌行需要整 config 按 id 覆盖，三类 preset 均禁用；`SDK/src/policy/guard.mjs:32–38` 再用工具名 NEVER，防后置 patch 重新启用。`work/p5-parity/PLAN.md:77` 要求重启用后依然 deny、不出审批卡、profile/runtime patch 不变。因此 p7 应复用 manager **服务**而不恢复这个宽泛工具，主 bot executor 仍要在实际执行处校验身份、对象、动作和不可改组件。

### [F] 市场只读模型工具

`DSH/packages/boot/plugin-market/src/tools.ts:70–139` 的 plugin_market 只读 indexes/plugins/versions，返回精确安装 target；源码明确第三方标题/描述/作者不是指令。可复用读服务或该 consumer；不应让市场条目文本改变主 bot 权限，更不能把它当作带授权的安装命令。

## 6. 可回退护栏：已有机制与缺口

### [G] bot 软删除直接复用 archive

- `DSH/packages/workspace/workspace/src/index.ts:338–409`：archive 集合持久化、保持原 session accounting slot；默认拒绝活跃会话，stopActivity=true 时**先持久化归档再请求停止**；重复归档/恢复幂等。
- `DSH/packages/api/workspace-controller/src/index.ts:159–171` 提供 Remote archiveSession/unarchiveSession，commands.ts:162–194 委派 registry。
- 已装制品核对：`SDK/node_modules/.pnpm/@deepseek-ai+dsh-workspace@0.2.2-alpha.2_@deepseek-ai+cordis@4.0.6-alpha.1_@deepseek-ai_a673a7173f976b9bacbd9c44f0d39f3e/node_modules/@deepseek-ai/dsh-workspace/lib/index.js:526–560` 确实有同样归档/恢复逻辑，不只是最新源码才有。
- `DSH/packages/api/session-controller/src/archived-session-gate.ts:23–55` 拦 archived session 及其 subagent lineage 的 model step。stop provider 失败会记录而不回滚 archive（workspace/index.ts:102–108,480–490）；**归档持久化不等于所有子进程已退出**。
- 适配必须保护 authoritative mainBotId，核对已装 profile 的 gate/providers 确实激活，刷新 roster；不能删工作区或 history 来模拟归档。`workspace/delete` 是 workspace 登记删除、保留目录与日志（index.ts:302–311），不应混作 bot 硬删除。

### [H] 保留期没有现成 end-to-end 实现

`DSH/packages/session/session-persistence/README.md:150–155` 明写 **No deletion or retention API**，崩溃恢复是关闭中断 turn，不是继续半个 turn。workspace 持久 schema 只有 archive ids，无删除时间/TTL（workspace/src/spec.ts:48–62）。M3 v1 与 deriveBots 没有 retention 字段。先用无限期归档满足“可恢复删除”；只有用户明确需要到期回收磁盘时才补业务元数据/清理任务，且不得清主 bot、共享 recipe、仍被引用数据。

### [I] 插件卸载与回滚不能一概而论

- `DSH/packages/boot/plugin-manager/src/index.ts:850–855,1169–1189` 的 setBundleEnabled 只改选择状态，保留依赖，适合两阶段逻辑卸载/恢复。它是 profile 级开关；已有 preset 可能继续持有贡献，必须检查 recipe 与 runtime inventory。
- 参考源码 install `:873–1011` 保存文件快照并在安装失败恢复；approvedBuilds 在快照之前写，且 workspace 构建授权不回滚；下载文件可残留。cancelInstall `:1019–1038` 只在部分阶段可取消，applying 后 too-late；waitForInstall 返回 null 不是成功证明。
- 参考源码 remove `:1047–1078` 与 change `:1260–1313`：先停用/reload，再 pnpm remove；change 记录 failed/changed，**没有统一自动恢复旧选择/文件的事务**。
- 已装制品 `SDK/node_modules/@deepseek-ai/dsh-plugin-manager/lib/index.js:2459–2570` 另有 updateBundle：HMR 模式先 remove，再 install 新版；失败/取消后从原 registry 尝试重装精确旧版，并返回 restore 结果。旧 registry 状态有内存依赖；恢复安装本身也会失败。无 HMR 路径直接安装并报告重启。
- 已装 remove `:2885–2911` 仍不是任意卸载的逆操作快照；低层 runProfilePnpm `:612–675` 有 compatibility denial 的文件恢复，不保证脚本、外部文件、连接器远端状态回滚。
- **建议**：自主卸载先可恢复停用/隔离，保留精确包坐标、版本、registry 与选择/引用状态；物理 remove 前有可重装来源且确保无共享引用。网络重装是补偿，不是原子回滚。现成 installer/恢复继续复用，只补本应用持久操作记录和失败回执，不自写 pnpm。

## 7. 自重启与 restore

### [J] dsh 热重载已经存在，但不是 supervisor

`DSH/packages/boot/hmr/src/index.ts:915–979` reconcileProfile 在 runExclusive 中重组、替换插件并返回 pending/restartReason；注释明确 replacement 激活失败时旧代码可能已停止。plugin-manager/index.ts:1248–1257 将结果转为 restart-required。优先用该机制，不要每次安装都重启；运行时是否装载 host HMR 要实测，不能以 client-hmr 被禁用推断 Host HMR 也禁用。

### [K] Electron 现成 relaunch，不需要逆向

`DSH/apps/desktop/src/main.ts:101–113` 已有 `app.relaunch(); quitWithoutConfirmation()`。fatal-recovery.ts:69–123 是先 stop，再可选 disablePlugins，再 restart 的人工恢复循环。**可复用 Electron API/顺序，不整体搬带 modal 的恢复 UI**。本仓 `UI/package.json:28` 已装 Electron；npm latest 维护查询不是要求升级本仓。

### [L] PM2 与 [M] forever-monitor 的源码比较

- PM2 固定源码 [`7a7fb4e22e9a26ec79c870ce8daafd2f78b648d1:lib/God.js`](https://github.com/Unitech/pm2/blob/7a7fb4e22e9a26ec79c870ce8daafd2f78b648d1/lib/God.js)：handleExit 处理 autorestart/stop_exit_codes、旧进程退出身份、min_uptime/max_restarts、不稳定重启上限、指数退避（最大 15s）；wait_ready/listen_timeout **不是** bots-meta 恢复完成的证明。已有 [`Node API 用例`](https://github.com/Unitech/pm2/blob/7a7fb4e22e9a26ec79c870ce8daafd2f78b648d1/examples/misc-examples/start-args.js)。[release v7.1.2](https://github.com/Unitech/pm2/releases/tag/v7.1.2) 发布于 11-03，[owner 回应证据](https://github.com/Unitech/pm2/issues/5030#issuecomment-6604245834)。根 LICENSE 指向 [AGPL-3.0 正文](https://github.com/Unitech/pm2/blob/7a7fb4e22e9a26ec79c870ce8daafd2f78b648d1/GNU-AGPL-3.0.txt)。
- forever-monitor 固定源码 [`7e0f6b120bdebf582912f3f40ba33e2f7b549c59:lib/forever-monitor/monitor.js`](https://github.com/foreversd/forever-monitor/blob/7e0f6b120bdebf582912f3f40ba33e2f7b549c59/lib/forever-monitor/monitor.js)：Monitor 有 start/restart/stop、minUptime/spinSleepTime；默认 killTree=true、killSignal=SIGKILL，_getEnv 默认合并 process.env。即使接口轻巧，也需改环境与终止范围且维护过期。[MIT](https://github.com/foreversd/forever-monitor/blob/7e0f6b120bdebf582912f3f40ba33e2f7b549c59/LICENSE)。
- PM2 应只监督本应用拥有的 SDK launcher，隔离 home/日志/状态，不能调用全局服务、dump 全环境或模糊名字重启；凭证不进 ecosystem 文件/模型工具结果。**PM2 是有条件推荐，未做本机集成验证**；若 Electron main 本身能拥有 SDK child 且只要显式重启，先复用当前 spawn/exit，不为单次 relaunch 强加 PM2。

### [N] 本仓恢复可承接的部分，以及尚缺什么

| 链路 | 已有证据 | 判断 |
|---|---|---|
| SDK 启动/退出 owner | `SDK/src/start.ts:716–787,790–856` startRuntime spawn 一次、等 ready、守卫失败终止、最后返回 child exit；有 home lock 和 child PID | 可复用，不是自动 restart loop；不能绕过 launcher 直接另起 dsh，也不能旧 child 尚活就起新 child |
| main 连接 | `UI/main/index.ts:205–215` 启动时读 handoff；`UI/main/dsh/connect.ts:1–194` 固定 opts.baseUrl/token，断线指数退避 | 同端点/凭据的重连能用；新 generation 地址/token 变化时必须由 owner 安全重新交接，不给模型 |
| 配方恢复 | `UI/main/index.ts:156–173,274–289` 每次 connected 串行 ensure；`m3-meta/restore.ts:23–56` allSettled、逐配方超时、成功清 failed；`ensure.ts:33–48` 开闸 | 可直接复用，但失败配方允许降级，不能声称全连接器健康 |
| 恢复期间门控 | `UI/main/ready.ts:20–52` 只有 setReady/setRestoreSettled，没有 reset；`ensure.ts:57–64` waitRestore | 首代闸门开启后，后续 reconnect 的 ensure 尚未完成也不会重新拦 M1/M2。热重启要代际门控，不能只调用已有 wireRestoreOnReconnect |
| 已有旅程 | `work/p4-ui/BRIEF.md:49–53` D6 是 close 后重开；D10b 是创建中 renderer reload；D10c 是缺连接器后冷启动 | 可回归复用，但**不是主 bot 在途发起 SDK 重启的验收证据** |
| 重启请求回执 | CONTRACT P6 通道在 SDK 重启/断流时作废在途；持久 session 恢复会终结中断 turn | 请求需先落安全、幂等的操作状态/回执，再由 owner 重启；新代恢复后查询结果，不把断开的 tool promise 当成功 |

需要新增的只是“主 bot 权限 → 有界管理动作 → owner 执行 → 新代 restore → 可查询完成状态”的本应用胶水；不是另写 supervisor、HMR 或会话 persistence。应用重启只限本应用，绝不重启主机/注销桌面/重启外部代理或训练服务。

## 8. 检索范围、否定结论及未验证项

已完成本地 `repos/MANIFEST.tsv`、既有 market-backend 复用报告、p3 CONTRACT、p4 D6/D10 定义、p5-03 约束、main/M3/launcher/guard/market wrapper 与 dsh 对应源码调查；安装制品重点交叉核对 manager 与 workspace。

GitHub MCP 使用过：repository 精确检索 dsh/PM2/forever-monitor；代码检索 dsh archiveSession、preset defineTool、workspace retention、plugin-manager removeBundle+restore；另搜 `dsh plugin agent management`，找到并读取第三方 tool-management 的 package、许可证与实际 consumer 源码。npm 实查上述发布包，未执行 add/install。

“没有”的精确含义：

- **未找到可原样接管本仓长期 bot+主身份+recipe 的现成完整 consumer**，不是“没有 persona 管理插件”；第三方确实存在，只是语义/版本不适配。
- **未找到 dsh session 自动保留期 API**：源码/schema 检索无 TTL，persistence 文档显式排除；不是“没有软删除”，archive 已有。
- **未找到任意插件卸载的原子 rollback 保证**：remove/change 没有全事务恢复；不是“没有任何恢复”，install/update 有有限补偿。
- **未找到本仓主 bot 发起 SDK 重启并全程恢复回执的实现**：现有 launcher 一次性、main 静态 handoff、ready 无 reset；不是“dsh 没有 HMR/desktop restart”。

尚需实现任务自行验证：上游/安装制品的其余 API 差异、profile Host HMR 与 archive providers 实际激活、归档后 roster/通知/调度一致性、多个 bot 共用连接器时卸载、离线重装旧版本、PM2 嵌入与环境白名单、SDK 真重启后的身份握手和在途操作恢复。此报告是源码与包元数据调研，不是运行验收通过声明。
