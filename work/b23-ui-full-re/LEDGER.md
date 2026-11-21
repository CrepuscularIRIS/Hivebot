# B23：0.78.1 前端 UI 全量逆向差距台账

日期：2026-11-18（自动化续作第一轮，goal-ed007eb1）
方法：chunkscan.py 全量扫描 626 chunk → 112 个带 UI 信号（i18n id≥5）→ chunkname.py 用 index.eager-common（en 母表，"id":["text"] 数组形状，1989 条）解析各 chunk i18n id 得功能身份。
产物：harness/out/chunkscan-0781.tsv（全量信号表）、harness/out/chunk-identity.txt（111 chunk 身份表）、harness/chunkscan.py+chunkname.py（工具）。

## 域分组与差距判定（已实现=✅ 部分实现=◐ 未实现=✗）

### A. 核心对话域（已基本复刻）
| 域 | 0.78.1 chunk | 我方状态 |
|---|---|---|
| transcript+sentinel 分页 | eager-app 内 transcript 组件 | ✅ B19 |
| composer/prompt-editor | chunk-prompt-editor-DpaS0rI9（Reference a skill/Nothing to reference yet） | ◐ 我们有 @ 引用但无 skill 引用面（DSH skills 面在别处） |
| 代码高亮/文件查看 | chunk-fullscreen-file-viewer-body（Source/Copied）、text-viewer | ✅ B16 + fullscreen viewer 已有 |
| transcript-markdown | chunk-transcript-markdown-DXf0_QSE（Open this skill in Settings/Cursor cloud agent） | ◐ markdown 已有；skill 卡片未渲染 |
| voice-memo-bubble | chunk-voice-memo-bubble | ✗ 无语音条 |
| box-desktop-modal（Take control） | chunk-box-desktop-modal | ✗ deferred（远控域） |

### B. 设置域（已复刻 General 主面）
| 域 | chunk | 状态 |
|---|---|---|
| general-pane | chunk-general-pane-YXy_8X5a | ✅ B18 |
| computer update 调度 | chunk-view-ODc_03uE（Update now/Reschedule） | ✗ deferred（无后端） |
| prompt-editing/webauthn 等 | eager-app 内 | ✅ 前批已覆盖 |

### C. Bots/团队域（0.78.1 大头，我方近乎全空）
| 域 | chunk | 状态 |
|---|---|---|
| team-bot-line-render | 639KB 渲染库 | ✗ |
| teams-flow-dialog | Microsoft Teams 集成 | ✗ deferred |
| slack-dialog | Slack 集成 | ✗ deferred |
| bot-manage-screen | 30/90 天保留 | ✗ |
| bot-manage-knowledge | New skill/Editing skill | ✗ |
| bot-configure/share/invite/template | 系列 | ✗ |
| team-bot-overview/details/context/plugins-dialog | 系列 | ✗ |
| service-accounts-dialog | secrets | ✗ |
| onboarding-flow（首启向导：11 步状态机 landing→attribution→meet→computer-demo→role→role-use-case-bots→tools→kickstart→create→before-shell→create-after-shell；Cursor account 登录+归因+云端 agent 演示动画+30 bot 原型目录 6 角色） | 107 id | ✗ 不接（云端账号体系向导；bot 目录=agentPresets 等价 B28 已判；一次性首启流程复刻价值低） |
| places-stage（门店/预订） | Out of stock/Preorder | ✗ |
| unrequested-meeting-approval | Allow/Submit | ✗ deferred |
| teach-recording-controls | 录屏教学 | ✗ deferred |

### D. 商业化域（全部 deferred）
| 域 | chunk | 状态 |
|---|---|---|
| virtual-card-checkout / order-checkout | 支付 | ✗ deferred |
| vault-card-dialog/editor、vault-login-dialogs | 1Password vault | ✗ deferred |
| D6kXWFjx（usage credits） | Additional usage credits/Enable/Edit | ✗ |

### E. 设备/连接域（大半 deferred）
| 域 | chunk | 状态 |
|---|---|---|
| connector-card-view/connector-card | Connect/Browse more/Authorize | ✗（T73c 已做 grant 面） |
| computer-screen-preview | Computer is asleep | ✗ deferred |
| phone-call | Show/Hide transcript | ✗ deferred |
| native-plugin-detail / plugin-detail-view / plugin-detail-sharepoint-write | 插件详情 | ✗（我方有 skills/plugins 面骨架） |
| agent-avatar-editor | Restart | ✗ |
| custom-mcp-form | Add plugin/Save | ◐（T73c MCP 面已有；表单细节差距待评） |
| inline-user-form | Continue/Cancel | ✗ |

### F. 记忆/例程域
| 域 | chunk | 状态 |
|---|---|---|
| view-CZFaUvTL（Memories/Routines） | 87KB 78 id | ✗（我方 Knowledge 面是别的实现；Memories/Routines 视图未复刻） |
| view-BQsUvw4u（Calendar） | 日历视图 | ✗ |
| view-kcheXZ65（texts/notes） | Read and reply to texts | ✗ deferred（iMessage 域） |

### G. 杂项视图
| 域 | chunk | 状态 |
|---|---|---|
| view-Bx8u2sOw（Vault：密码管理器——CSV 导入/logins/cards/contact info/支付方式，B29 勘误：非组织 bot 列表） | 79KB | ✗ D 域 deferred（凭证+支付） |
| new-chat-bar | Team Bots 选择 | ◐（我方 new chat 已有） |
| cloud-agent-card-elevated | Cursor cloud agent | ✗ |
| automation-detail-panel | 自动化详情 | ✗ |
| widget | Done | ✗ |
| agent-invite-dialog | 邀请 | ✗ |

## 初步结论

1. **缺口最大域**：C（team/bot 管理）与 F（Memories/Routines/Calendar）——0.78.1 在这两域投入最大（639KB 渲染库+多 dialog），我方近乎全空。
2. **deferred 合理保留**：D（支付/vault）、远控/phone/teams/slack/iMessage——后端不可达，维持 REQ-1.1.0-PARITY §4 判定。
3. **下一步（B24+ 候选）**：
   - B23 本身=台账工具链（已交付：chunkscan/chunkname/信号表/身份表）——已合并 36720fdb
   - C 域优先：~~bot-manage-knowledge（skills 管理）~~（✅ B24 已合并 5c7c4890：main create/update op+SkillEditor+Edit/Add custom skill）→ bot-manage-screen（保留期）→ bot share/configure——与 DSH bots/skills 后端有真实映射
   - F 域：view-CZFaUvTL=New Team Bot 向导（云端，deferred）；**个人 Routines 管理面在 eager-app 主包内联**（非独立 chunk）——区 ftt（空态 uUGtMZ 'Ask in chat to set a routine'+行 EM：toggle isEnabled+trigger/schedule 描述只读，编辑走对话 hsz5he），我方 B7.2 已同构落地；数据源 getAgentAutomations=云端。B26 映射评估见 work/b25-dsh-adaptation/BRIEF.md

## 八、bot 生态域（B27–B29，2026-11-18 补）

goal-a4177d4d（bot 生态深度调研+复刻+DSH 适配）产出：

| 批次 | 内容 | 状态 |
|---|---|---|
| B27 | bot 生态全规格挤出（创建链/群聊/子代理/模板市场/RPC 契约）+BRIEF | ✅ 6862977b |
| B27a | composer skill 引用面：getAgentWorkflows 空→skills 实底（'/' 菜单显 skill 行+subtitle） | ✅ bc00189f |
| B28 | bot 模板面评估：agentPresets↔bot-template 已等价实装（对话框 Preset radio+市场 newWith 双入口） | ✅ 7c3f33f0（无施工） |
| B29 | voice-memo（TTS 气泡）/team-bot-line-render/Calendar 三项评估：无 DSH 后端，不接 | ✅ 635bffa9（无施工） |

剩余生态面判定：群聊（无 multi-agent session 后端）不接；模板发布/分享（云端）deferred；reactToMessage/createThreadFromMessage（无消息级交互后端）不接。SuperAgent 映射已在 B25 BRIEF 定案（T36/T37 闭环）。

## 九、真机运行时域（B30，2026-11-18 补）

goal-82e36588（真机 0.78.1 运行时逆向+DSH/SuperAgent 适配）产出：

| 批次 | 内容 | 状态 |
|---|---|---|
| B30 | 真机 CDP 接入+网络面/磁盘面/桥面采集+真实 bot 生态样本+DSH+SuperAgent 主副 bot 架构方案 | ✅ 见 work/b30-live-re/ |

真机关键发现（详见 work/b30-live-re/evidence/EVIDENCE.md）：
- RPC 全走 main 进程 Node fetch（renderer 零网络流量）——契约面只能静态挤出（B23–B29 已完成）
- renderer 桥：sandPopout/__duneReliability/sandRenderTrace/__SENTRY__——无 pbots（与我方 shim 桥名不同）
- statsig 4414 gates 全 hash 名无产品语义
- 真实 bot 生态：ComputerUse(264 会话)/Design Atlas/Harness RSI/CUA/VLA——定时采集+inbox 落盘+GitHub 回写共同骨架
- 架构方案（ARCHITECTURE.md）：SuperAgent=主 bot、DSH 实例=副手；B31–B33 实施路径
