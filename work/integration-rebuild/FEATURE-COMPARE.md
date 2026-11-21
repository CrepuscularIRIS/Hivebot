# 功能对照表：Grok Bot 1.1.0 可观察功能 × DS-Bot / Tobs（步骤③）

日期：2026-11-20
输入：B44 矩阵（旧体系 58 项分母）+ DS-Bot 实跑+源读 + Tobs scout 报告（源码静态）
用途：基底定案决策

## 一、bot 生态核心面（用户主诉：打开先回复+多 bot+主 bot 编排）

| 功能 | Grok Bot 1.1.0 | DS-Bot | Tobs |
|---|---|---|---|
| 多 bot 管理 | 侧栏 agent 列表+createAgent | roster.js（26K 行包内）Chief 主 bot+member bots | PersonaBot 数组+orchestrator |
| **kickoff 主动开场** | kickstartAwaitingFirstMessage | ✅ roster.js:231-286 首条 greeting 硬编码 | ❌ 无（creation.ts 无此逻辑） |
| 主 bot 特权 | mainAgent 语义 | ✅ Chief：create_bot/stop_bot/post_to_group（prompt.js MAIN_RULES） | orchestrator/assignment 双角色 |
| 群聊 #team | createGroup | ✅ #team 频道+groups.js | channel 面 |
| bot 命名/人设 | name+description+behavior/never do | ✅ Add a member 表单五字段（实跑截图） | PersonaBot persona |
| 切 bot | sidebar 切换 | ✅ bot-views.mjs+侧栏 | web UI |

## 二、能力面

| 功能 | DS-Bot | Tobs | 备注 |
|---|---|---|---|
| 真模型对话 | ✅ 实跑验证（litellm glm-5.3-flash） | 源码有（custom provider） | DS-Bot 需 cordis.patch.yml 配 litellm（已攻克） |
| 文件/文件夹 | files.js/folders.js | ✅ | |
| 定时任务 | schedules.js | ✅ | 对应我们 B26 |
| skills | skills/ 目录 | ✅ | 对应 B24 |
| goals | goals.js+goal-skills.js | ✅ | 我们 B 系列无直接对应 |
| 浏览器 | browser.js+browser-plugins.js | ✅ | |
| computer use | computer/ 目录 | 有限 | |
| 秘密管理 | secrets.js+secrets-crypto.js | ✅ | |
| 电话/语音 | phone.js | ❌ | phone-call 域同我们 BLOCKED |
| 记忆 | memory-copy.js | SQLite+Git 记忆库 | Tobs 更体系化 |
| 审批 | approvals.js | ✅ | |
| 工具权限 | permissions.js | ✅ | 对应 B45 |
| 手递手 | handoffs.js | ❓ | |
| 远程 | remote.js | Tobs Connect | |

## 三、形态面（决定性维度）

| 维度 | DS-Bot | Tobs |
|---|---|---|
| 独立 app 形态 | ✅ AppImage（pinned DSH 0.2.2 自带） | ❌ 纯 DSH 插件 |
| 引擎 headless 驱动 | ✅ 已验证（e2e 可复用） | web 起不来（本环境） |
| 安装隔离 | ✅ /tmp 全链验证 | DSH_HOME 隔离装过 |
| SuperAgent 接缝 | local-agents ACP stdio 层 | engines 层（需实现 Agent 流协议） |
| 代码规模 | ~4 万行（115 文件） | ~34 万行（17 packages） |
| 许可证 | Apache-2.0 | MIT |
| 维护热度 | 4 天前 commit | 当天 commit |

## 四、基底定案建议

**建议基底=DS-Bot**，理由：
1. **可运行性硬门槛已验证**（本环境全链通：GUI+headless 引擎+真模型）；Tobs web 在此环境不可验
2. **独立 app 形态**满足用户「独立 deb/app、不装进当前 dsh」要求（m11733）
3. **bot 生态面完整度直接命中用户主诉**：kickoff 主动开场（用户 m11473 点名「打开先回复我」）+Chief 主 bot 编排+多 bot 群聊
4. SuperAgent 接缝（步骤④）：local-agents ACP stdio 层是现成的 agent 宿主位——未来主 bot 可换 DSH SuperAgent 而不动 UI/生态

**Tobs 的价值保留**：orchestrator/assignment 编排模式+SQLite 记忆库设计可作后续重构参考（用户倾向的「Tobs 可能好一些」主要在架构审美，但可运行性在本环境不成立）。

**风险与缓解**：
- DS-Bot pinned DSH 0.2.2（旧版）：模型绑定走 profile patch（已攻克）；后续升级需跟踪上游
- 4 万行第三方代码：按「搬运阶梯」第 3 级（复制改造）处理，逐步按需读改

## 五、步骤④：SuperAgent 接入位观察（Round 5 实读）

### local-agents 层结构（node_modules/ds-bot/src/host/local-agents/engines.js 全解）
- KINDS=['acp','codex','claude'] 三驱动；ROUTE_PREFIX='local-'；27 个内置 CLI 条目（claude-code/codex-cli/cursor-cli/gemini-cli/glm-cli 等，glm-cli=GLM Agent acp 协议现成）
- **custom ACP agent 面**：`local-acp-<id>` 前缀+validateCustom({name,command,args})——用户自填命令挂任意 ACP stdio agent
- 权限档位映射 MODES：read-only/workspace-write/danger-full-access → 各驱动 mode id

### SuperAgent 接入判定
**DSH SuperAgent（app/superagent/lib/index.js，stdio 可拉起）→ custom ACP agent 路线接入 DS-Bot**：
1. 零 fork：validateCustom({name:'DSH SuperAgent', command:'node', args:['<path>/app/superagent/lib/index.js']})
2. 走 ACP 协议（Agent Client Protocol over stdio）——SuperAgent 需实现 ACP 面（session/prompt/permission 流）；或
3. 备选：走 glm-cli 同款内置条目路线（改 engines.js 加一行）——fork 最小

**步骤④结论：接入位在且清晰（custom ACP 面或 engines.js 单行），按 goal「先不替换主 bot」——观察位已定，不动 Chief。**

## 六、验收三要素实证（Round 6，DS-Bot 基底）

| 验收项 | 证据 |
|---|---|
| 真模型对话 | smoke 会话 litellm glm-5.3-flash 干净问答回复 '4'（session-5c30165b） |
| 多 bot | state.json bots=[('Chief','Chief of Staff'),('Atlas','Researcher')]——Chief 经 create_bot 工具真建 member bot（revision 3→7） |
| 主 bot 编排可观察 | Chief 收自然语言指令→真模型决策调用 list_bots→create_bot 工具链真实执行（follow 流 tool/call 帧实锤） |

基底未拍板前 goal 保持 active：DS-Bot 建议+实证已齐，等用户确认后进步骤⑤产品化（UI 打磨/流程适配/SuperAgent ACP 接入）。
