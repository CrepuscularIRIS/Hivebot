# RE-skills · 0.78.1 skill 生命周期语义（T3 / L4-a）

> reverse-engineer agent · 2026-11-06 · 静态只读分析，未运行任何目标程序，未读凭证目录。
> 样本：Grok Bot 0.78.1 deb 解包树 `/dev/shm/grok-re/0.78.1/`。
> 文件缩写（锚点均可用 `LC_ALL=C grep -a -c '<字面串>' <文件>` 复核，均为普通 grep 可命中的字面串）：
> - **LED** = `app/dist/local-exec-daemon/main.cjs`（box 内执行守护进程，含全部 GrokBotService proto 与 agent 运行时）
> - **NAC** = `app/dist/node-agent-coordinator/main.cjs`（宿主协调器，host 方法 schema）
> - **EM** = `app/dist/electron-main/main-app.cjs`
> - **DIA** = `app/dist/renderer/assets/chunk-team-setup-new-skill-dialog-DwGXKoR0.js`
> - **TEACH** = `app/dist/renderer/assets/chunk-teach-recording-controls-Cpb8XFNW.js`
> - **APP** = `app/dist/renderer/assets/index.eager-app-iGTgHP_Q.js`（renderer 主包，含 i18n 键值）
> - **COM** = `app/dist/renderer/assets/index.eager-common-DbK3Oi_r.js`（i18n 字典）
> - **CTX** = `app/dist/renderer/assets/chunk-team-bot-context-dialog-BhePh4Ev.js`
> - **VIEW** = `app/dist/renderer/assets/chunk-view-CZFaUvTL.js`
>
> 背景（影响解读）：local-exec-daemon 是 Cursor 系 agent 运行时（`aiserver.v1` proto、`.cursor` 目录约定、`deps/cursor-proclist`、`deps/web-tree-sitter`、`sand-*` 原生模块、noVNC 端口表）。bot 的"电脑"是云 box，daemon 跑在 box 里。

## Q1 账户级 skill 库在哪、何时同步

**结论：库分三层，都不在本地磁盘持久化（本地盘只有 box 内 builtin 镜像）。**

1. **服务端（权威）**：per-agent 与账户 skill 都是 `aiserver.v1.GrokBotService` 上的远端 RPC（LED 服务声明 `typeName:"aiserver.v1.GrokBotService"`；方法表 LED `publishGrokBotUserSkillsSnapshot:{name:"PublishGrokBotUserSkillsSnapshot"`）。客户端只发布指纹：LED `PublishGrokBotUserSkillsSnapshotRequest|1 fingerprint 9`，配套失效 RPC LED `invalidateGrokBotUserSkillsCache:{name:"InvalidateGrokBotUserSkillsCache"`。调用方（何时发布）不在任何 bundle → **未找到**。
2. **renderer 侧数据源**："你的 skills"= workflows 域。查询 store 名 agent-skills、id `mJ4z7P`（APP），订阅函数 APP `function O_(e){return El(w_,e,$().workflows)}`；可发布/重同步 APP `resyncPublishedSkill`、`syncPluginSkills`、`publishSkill`。插件包也能供 skill：LED `13 is_bot_skills 8`（GrokBotAgentPlugin 字段），APP 侧拆 librarySkills/fileSkills（函数 `dOt`，判定 `origin: upload`）。
3. **box 本地盘（builtin 镜像）**：LED 扫描目录表 `subdir:"skills-cursor",thirdParty:!1,builtin:!0`，user/project scope 表 LED `{configDir:".agents",subdir:"skills",thirdParty:!1,builtin:!1}`（同表还有 .cursor/.claude/.codex/.grok 的 skills 项）。builtin 目录由模板拼出：LED `/${VS.configDir}/${VS.subdir}/`（模板变量 xyr，展开即 .cursor/skills-cursor）；EM 侧锚点 `env-setup`（builtin skill 目录常量，路径 /.cursor/skills-cursor/env-setup/）。gitignore 管理块注释原文 LED `"# Built-in Cursor skills"` 与 LED `"# User's personal skills"`。
4. **同步节奏（仅常量，触发方未见）**：LED `var zYn=pt("skill-sync-manifest");var rZn=pt("builtin-skills-sync"),nZn=1440` 与 LED `sZn=4320`（完整式为 1440*60*1e3=24h、4320*60*1e3=72h，星号在 grep 里要转义）及 LED `pt("managed-skills-sync")`。使用这些变量的代码不在 bundle（tree-shaking 后仅存定义）→ **同步触发点标「推断」**：builtin 每 24h、managed 每 72h 刷一次，另有 manifest（skill-sync-manifest）做增量。

补充：`.agents/skills` 在原版扫描表里就是 user-scope 第三方目录之一，与 dsh `skill-filesystem` 的 agentsHome 同名约定互相印证。

## Q2 per-agent skill 字段与「启用=复制还是引用」

**结论：复制。启用把完整内容写进该 bot 的服务端定义，之后改库不联动。**

- 读写 RPC（LED，全部 Unary）：
  - `AddGrokBotAgentSkillRequest|1 agent_id 9|2 name 9?|3 description 9?|4 content 9`（name 可选——库导入时由内容 frontmatter 定名）
  - `UpdateGrokBotAgentSkillRequest|1 agent_id 9|2 name 9|3 description 9?|4 content 9`
  - `RemoveGrokBotAgentSkillRequest|1 agent_id 9|2 name 9`
  - `ListGrokBotAgentSkillsRequest|1 agent_id 9` → `GrokBotAgentSkill|1 id 9|2 name 9|3 description 9|4 body 9|5 source 9`
- 存储：agent 定义内嵌 skill 列表，LED `GrokBotAgentDefinition|1 sessions #0*`（后接 `7 recipe_skills #5*`），元素 `GrokBotAgentDefinitionSkill|1 id 9|2 description 9|3 content 9` —— **全量内容存在 bot 定义里**。
- renderer 桥（APP）：`addGrokBotAgentSkill:J().args({agentId:Ny(),name:Kt(dt()),description:Kt(dt()),content:My,files:Kt(sNe)})`，files 为附带文件数组（path+content，schema APP `sNe=mn(yn({path:My,content:dt()}))`）；proto Add 请求没有 files 字段——桥层有、wire 层未见的差异标「推断」：文件可能在 host 层合并进 content 或走后续上传。
- 「Pick from your skills」导入即拷贝：CTX `content:le(e)}`（完整式 r.addSkills 数组调用，含方括号，复核时用 `grep -a -F`）——导入瞬间取库内容快照。
- 内容格式即 SKILL.md：APP 合成模板 `name: ${JSON.stringify(e.name.trim())}`（函数 `nOt`，frontmatter 头部 ---/name/description）；文件导入还带溯源 frontmatter APP `origin: upload`（及 upload-extension:/upload-name:，用于区分 fileSkills）。
- `source` 取值（客户端可见五种，值文本带反引号，锚点用函数名）：workflow（APP 函数 `bOt` 过滤）、template（APP 函数 `Lzn` 构造）、automation（APP 函数 `nlt` 构造）、managed 与 template（APP 函数 `kjt` 并列判断）、plugin（APP `Ojt` 中 `e.source===` 后接 plugin 且 `publishedByCurrentUser`）；共 workflow/managed/template/automation/plugin 五种，是否还有 user **未找到**——手动新建的走哪条未观察到。完整客户端模型字段见 APP `sourceRef:null,pluginId:null,publishedByCurrentUser:!1`。
- 例外（会联动）：插件发布的 skill 有显式重同步——APP `resyncPublishedSkill`（NAC `resyncPublishedSkill:I().args({workflowId:y()})`）。用户库（workflow）没有对应机制 → **改库里那份，已启用 bot 不跟着变**（依据：Add 语义 + 导入快照 + 无 resync 路径）。

## Q3 ProposeSkills 工具与审阅链

**结论：模型工具名 `ProposeSkills`；变更走「团队审阅项」协议（PENDING→APPROVE/REJECT），聊天里另有交互式挑选卡；批准后落在 per-agent（推断）。**

- 工具名只在 capability 枚举出现：LED `ProposeSkills:"ProposeSkills"`（NAC 同）。**参数 schema 未在任何 bundle 找到**（服务端定义）→ 未找到。
- 审阅协议（LED）：
  - `GrokBotTeamReviewSkillChange|1 action #0|2 name 9|3 description 9|4 content 9`，动作枚举 LED `"GrokBotTeamReviewSkillAction"`，值 ADD/UPDATE/REMOVE
  - 变更容器 `GrokBotTeamReviewChange|1 memory #0 change|2 skill #1 change|3 folder_memory #2 change|4 method 9|5 summary 9`（oneof：记忆/skill/文件夹记忆）
  - 条目 `GrokBotTeamReviewItem|1 item_id 9|2 status #0|3 proposed_by_user_id 3`，状态枚举 `GrokBotTeamReviewItemStatus` = PENDING/APPROVED/REJECTED，裁决 `GrokBotTeamReviewDecision` = APPROVE/REJECT
  - RPC：`AddGrokBotTeamReviewItem`、`ListGrokBotTeamReviewItems`、LED `ResolveGrokBotTeamReviewItemRequest|1 agent_id 9|2 item_id 9|3 decision #0`
- 聊天内交互卡（与审阅项并存的轻量路径，**推断=ProposeSkills 的 UI**）：VIEW 渲染 entry kind 为 skills（VIEW `P=d(n.id,` 取 entry id）、VIEW `team-skills`（sandArea 值），折叠摘要 i18n APP `"Pick from your skills"`（键 76J7mZ）、计数键 `y0eCAK`（复数 "# / N suggested"）；候选=库里未上 bot 的项，勾选后走 addSkills，放弃发工具裁决 VIEW `dismissed`（resolution kind）。此卡与 ProposeSkills 的绑定关系在静态产物里没有字面证据，标「推断（强）」。
- 批准后落点：审阅项携带 agent_id，skill change 字段与 Add/Update/Remove per-agent RPC 完全同形；服务端行为不可见 → **「批准=写 per-agent 定义」标推断**；没有任何"批准进账户库"的字段（无 user/library 目标字段）。

## Q4 「Pick from your skills / Add new skill」对话框

**结论：入口=bot 设置（Overview/Context/Manage knowledge）+ bot 复制 + 建 bot 向导 + 聊天内挑选卡；文件类型 7 种纯文本、单文件 256,000 字符、每 bot 上限 250；名字=slug（小写字母数字+连字符）。**

- 入口（DIA chunk 的引用方，静态 import 关系）：`chunk-team-bot-overview-section`、CTX（bot Context 对话框，面板 i18n COM `"All skills"`（键 ggmjet）/ COM `"Added skills"`（键 IYyHwi）/ COM `"Files"`（键 sER+bs））、`chunk-bot-manage-knowledge`（编辑页 COM `"Edit skill"`（键 0NuXpZ））、`chunk-bot-slack-copy`；DIA 文件名即 team-setup（建 bot 向导）。
- 上限与类型（DIA 原文）：
  - `k=256e3`，校验 `t.content.length>256e3` → skip 原因 `too-large`；提示 i18n COM 键 `S4vwjA`（"# file was skipped because it is larger than {limit} characters"——按字符不按字节，显示值 256k）
  - 允许扩展名 DIA `.txt, .md, .csv, .json, .yaml`（accept 串 M；数组 j 共 7 项：txt/md/markdown/csv/json/yaml/yml）；非文本（前 8192 字节含 NUL 或非法 UTF-8，DIA `subarray(0,Math.min(e.length,8192))`）或后缀不符 → `unsupported`（COM 键 `CM+50r`）
  - 每 bot 上限：DIA `a=Math.max(0,250-i.onBot.size)`、DIA `MAX_BOT_SKILLS:250`（COM 键 `WnW32b`）；空文件 → `empty`
  - 输入方式：文件多选 + 文件夹（`webkitRelativePath`）+ 拖拽递归目录（DIA `webkitGetAsEntry` + `readEntries` 循环）
- 命名与去重（DIA）：
  - 名字优先级：YAML frontmatter name 优先 > 路径推导（SKILL.md 取父目录名，否则去扩展名）（函数 `W`/`U`；DIA `SKILL.md`）
  - slug 化 APP `.toLowerCase().replace(`（函数 lOt：小写、非字母数字串折成连字符、去首尾连字符；DIA 经压缩别名引用同名函数——映射关系标「推断」）；手填名校验 i18n COM `"Use at least one letter (a–z) or number"`（键 MEJR0H）
  - 冲突：skill 名加 -2/-3（函数 `H`），文件名加 " (2)"，标题加 -2；与已上 bot 的（含插件 skill，`t.readListing()` 返回 plugins 合并 onBot）判重（COM `" is already listed"`，键 YNjRIY）
- 手动新建（DIA `ke` 对话框）：标题 i18n APP `"Add new skill"`（键 C/t3EV），描述 COM 键 `4tgccm`（"Describe a repeatable way of working so this Bot completes the task consistently"）；字段 Name（必填，slug 预览）/ Description（可选）/ Instructions（必填，COM `"Instructions"`（键 NxHkkp））；提交调 addSkill。对话框状态机（读文件→staged→写入）见 DIA `we` hook 与 `Ce`（`t.addSkills(o.skills)`）。

## Q5 「Teach a task」录屏是否产出 skill、依赖链路

**结论：不直接产出 skill。录的是 bot 云电脑屏幕；保存后变成一条发给 bot 的用户消息（"The recording is finished. Learn the task from it."，initiator=TEACH_RECORDING），由模型自行学习（是否沉淀成 skill 走 Q3 审阅链）。依赖电脑/VNC 链路 → 随 L9。**

- 入口与文案：i18n APP `"Teach a task"`（键 yrMloC）；入口枚举 EM `"screen_hover","composer_menu","fullscreen_title_bar"`（变量 ZZe）；说明文案 COM `"zTyn2M"`（"Record yourself doing a task. {subjectLabel} learns the steps and can run them again on its own."）。
- host 方法（NAC）：`startTeachRecording:I().args({agentId:W(),entryPoint:bre})`、`stopTeachRecording:I().args({agentId:W(),save:Z()})`、`getTeachRecordingStatus:I().noArgs`；分类 person（需人在线）。时长上限 APP `maxDurationMs:6e5`（10 分钟）。
- 保存后的产物（APP）：消息判定为 clientNonce 前缀 APP `teach-recording:` 加固定文案（常量 `Tbt` 的 startsWith 比较）；气泡标签 i18n APP `"The recording is finished. Learn the task from it."`（键 /WKm9a）与 APP `"Learn from demonstration"`（常量 Ebt）；initiator 枚举 LED `,"TEACH_RECORDING"]`（GrokBotUserMessageInitiator 第 6 值），renderer 同值 APP `plugin_setup` 后接 `teach_recording`（数组 $_e）。
- 屏幕链路（TEACH chunk）：noVNC webview 进 box 桌面（TEACH `noVNC_connected`、TEACH `primaryNovncWebsockify:6080`）；"Recording {agent}'s computer"（COM `"3h2s4g"`）；停止=Stop and save（COM `"ITj4Ys"`）/Discard（COM `"joVvhG"`）。
- 另有一条**模型侧**录屏工具（非示教）：LED `RecordScreenArgs|1 mode #0|2 tool_call_id 9|3 save_as_filename 9?`，mode=START_RECORDING/SAVE_RECORDING/DISCARD_RECORDING（RecordingMode）——bot 自己录屏存文件用。

## Q6 运行时 skill 怎么到模型面前、与 dsh skill-filesystem 的等价性

**结论：投递方式未确定（推断）。wire 层 RequestContext 有 `agent_skills`（全文）与 `SkillOptions.skill_descriptors`（描述符）两种字段；客户端产物里没找到装配或发送它们的代码，哪一种在用、多频繁不可见。**

- wire 定义（只证字段存在；LED proto）：LED `RequestContext|2 rules #0*` 定义里含 `29 agent_skills #12`，元素 `AgentSkill|1 full_path 9|2 content 9`（后续字段 description/environments/disable_model_invocation/globs/scoped_to/argument_hint 等，开关位与 dsh frontmatter 键同名）；另有 `SkillOptions|1 skill_descriptors #0*`，元素 LED `SkillDescriptor|1 name 9|2 description 9|3 folder_path 9|4 enabled 8`。完整性旗标 LED `43 agent_skills_info_complete`。
- **反证（装配不可见）**：LED 内 `agentSkills:` 命中 **0** 次（没有任何 `new RequestContext({agentSkills: …})` 式装配）；`.agentSkills=` 命中 **1** 次且唯一是构造器初始化 `this.agentSkills=[]`。字段存在不等于客户端真的填充发送。
- 目录发现/合并（LED，box 内运行时）：span 名 LED `MergedAgentSkillsService.getAllAgentSkills` 合并多个 service → 按 key 去重排序（函数 `S8`）：agent-store 目录内同 key 优先（LED `inAgentStore:!0`）；key 生成 LED `::skills/` 模板（函数 `aD`）与 LED `V2e` 的路径归一（.cursor/.claude/.codex/.grok/.agents 段 → root 加双冒号前缀）。
- 停用过滤：LED `getDisabledManagedSkillPaths failed; failing closed by dropping all managed skills for this call`——查停用路径失败时**整类 managed skill 全部下线**（fail closed）；managed 目录判定 LED `byr(t)`（路径含 xyr 模板段，即 .cursor/skills-cursor）。停用清单存哪、谁提供 → **未找到**（wiring 不在 bundle）。
- 变更通知：LED `UL.CHANGE_COALESCE_MS=1500`（子 service 变更 1.5s 合并广播）+ `reload(e)`。
- 与 dsh `skill-filesystem`（`repos/deepseek-harness/packages/skill/skill-filesystem/README.md`）逐项对照：
  - 格式：等价。两边都是 SKILL.md 目录包 + YAML frontmatter（dsh 必填 name/description，kebab-case；原版同名约定 + origin/upload 扩展键）。原版另支持对话导入扁平 txt/md/csv/json/yaml 等多类型与 files 附件；dsh 支持扁平 name.md。
  - 发现：等价（多根扫描 + 去重）。dsh 用 rank（100–600），原版用 agent-store 优先 + key 去重；.agents/skills 两边都在扫描表里。
  - 投递：**无法判定（推断，原版装配不可见）**。dsh = catalog（frontmatter 摘要）+ 按需 load（每次 load 重读文件）；原版 wire 层具备全文与描述符两种承载字段，实际用哪种、频率如何未见证据。
  - 变更检测：等价目的。dsh = Chokidar watch + write/edit 直接触发失效；原版 = 子 service onChange 合并（1.5s）。
  - 停用：两边都有（dsh 的 disable-model-invocation / user-invocable frontmatter；原版 wire 层 disable_model_invocation 字段 + managed 路径停用清单），语义细节不可比（原版清单来源未见）。

## Q7 多 bot 启用状态存哪侧、停用语义

**结论：启用状态存 bot 侧（服务端 agent 定义里的 recipe_skills，不是账户库的标记）；对用户库 skill 的「移除」=从 bot 定义删除条目（无 disable 位）；对 builtin/managed 目录 skill 的停用=路径清单过滤，清单存服务端（推断）。**

- bot 侧存储：LED `GrokBotAgentDefinition|1 sessions #0*`（后接 `7 recipe_skills #5*`）；team bot 的共享态同样带 LED `GrokBotTeamAgentSharedState|1 participants #0*`（后接 `6 recipe_skills #5*`，团队共享 skill 与 bot 定义同构）。
- 账户侧没有"该 skill 对哪些 bot 启用"的反向表：List RPC 只按 agent 查（LED `ListGrokBotAgentSkillsRequest|1 agent_id 9`）；"已上 bot"在 UI 是把库列表与该 bot 列表求差（VIEW `!e.onBot&&q(e)` 过滤可加项、`e.onBot` 标记）。
- 停用/移除语义：
  - 用户库/插件 skill 下 bot：LED `RemoveGrokBotAgentSkillRequest|1 agent_id 9|2 name 9`——按名删除，响应 `RemoveGrokBotAgentSkillResponse|1 marketplace #0`（无 skill 回包）→ **删除副本**，无标记位。库里的原件不动（CTX `onRemove:r.removeBotSkill` 只作用于 bot 副本）。
  - managed/builtin 目录 skill：不删文件，靠停用路径过滤（Q6 的 getDisabledManagedSkillPaths + fail-closed）。清单存取不可见 → 推断存服务端 bot/用户设置。
  - managed 库条目可被同 id 覆盖合并：APP `G8`（源码 `e.source===` 后接 managed 时用 n.get(e.id) 覆盖）——bot 侧同 id 值优先于 managed 库值。

## 对 T6 / T7 的影响

1. **Q1**：账户库按"服务端 workflows 域 + 指纹发布"建模太重；T7 本地化实现可直接落在 `$PBOTS_DATA_DIR` 下的账户级存储 + 每 bot 引用表，指纹同步机制不必复刻（原版触发点未验证，不构成规格）。
2. **Q2**：**启用=复制内容**（Add 请求带 content、recipe_skills 存全文）→ T7 用「导入即拷贝快照」，不做实时引用；要不要给插件类来源补 resync 由需求定（原版只给 plugin 发布件配了 resync）。
3. **Q3**：审阅链按「PENDING→APPROVE/REJECT 条目 + agent_id + action/name/description/content」复刻即可；批准落 per-agent（推断，服务端行为未验证）。ProposeSkills 的参数 schema 原版在服务端，T6/T7 自行定义不违反「原版即规格」。
4. **Q4**：T7 对话框照抄硬数字：扩展名 txt/md/markdown/csv/json/yaml/yml、单文件 **256,000 字符**（非字节）、**每 bot 250 条**、空文件/非 UTF-8/超限分别报 skip；命名=frontmatter name 优先、slug 化、-2 去重；入口放 bot 设置 Context 面板 + 建 bot 向导。
5. **Q5**：示教≠skill 产出，产物是「附录屏的消息」，依赖电脑/VNC → **随 L9，本期不做**；T6/T7 文档里把它从 skill 链路摘出去。
6. **Q6**：T6 走 dsh `skill-filesystem`（catalog + 按需 load）；原版投递方式不可见（推断，见 Q6 反证），这不构成与原版的已知偏离。fail-closed（停用清单读不到就整类下线 managed）值得抄。`.agents` 收口（T6）不受影响：原版也把 .agents/skills 当扫描根，我们的问题只在 dsh 侧 agentsHome 默认真 HOME。
7. **Q7**：多 bot 启用存 **bot 定义侧**（每 bot 一份副本列表），账户库不存反向启用表；停用=删副本；T7 按此建 bot_skills（内容快照）+ 账户 skills（库）两张表，不做外键式引用。

**仍是推断 / 未验证的项**：Q1 同步触发点与 Publish 调用方（未找到）；Q2 files 参数在 wire 层的去向、手动新建 skill 的 source 取值（未找到）；Q3 ProposeSkills 参数 schema（未找到）与「聊天挑选卡=ProposeSkills UI」「批准落 per-agent」（推断）；Q4 DIA slug 函数与 APP lOt 的压缩别名映射（推断）；Q6 投递方式（全文内联 vs 描述符）（推断）、Q6 停用清单的存储与提供方（未找到）；Q7 managed 停用清单存服务端（推断）。另：本报告未运行目标、未抓包，所有结论仅基于 0.78.1 静态字面证据。
