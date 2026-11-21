# B25：DSH 适配评估台账（goal-ed007eb1 第二步立项输入）

日期：2026-11-18（goal 第二步「DSH SuperAgent 与 DSH 侧适配」第一批）

## 目的

第一步（UI 全量逆向+按批复刻）已收官到 B24：LEDGER 七域盘点完毕，C/F 域判定 deferred（见下）。本批产出**逆向能力面 × DSH 真实后端**的映射台账，定每面的「已接 / 可接 / 不可接」，作为第二步施工的候选队列。

## 判定标准（沿用 REQ-1.1.0-PARITY §4 + B23 LEDGER）

- **已接**：shim 有真实 DSH 数据源（session/*、skills 落盘、workers 投影）
- **可接**：DSH 有等价后端但未连线（如 dsh schedule → routines）
- **不可接（deferred）**：xAI 云端独占（团队共享/支付/vault/远控），无本地等价

## 映射台账

### A. 已实装（勿重做）
| 0.78.1 面 | DSH 数据源 | 批次 |
|---|---|---|
| 会话列表/transcript/分页 | session/list、session/events（B3/B19） | B1–B3、B19 |
| composer 草稿/附件 | sendDraft + data URL（B17/B17b） | B17b |
| General 设置 14 行 | localStorage + documentElement（B18/B20） | B18/B20 |
| Tasks 岛+看板 | running worker 投影（B14） | B21 |
| Bot Knowledge（skills CRUD） | .dsh/skills/<name>/SKILL.md（B24） | B24 |
| Agent 设置（Name/Title/Notif + 六段） | session/rename + overrides | T36/T37、B7 |

### B. 可接（DSH 有后端，候选队列）
| 0.78.1 面 | 0.78.1 RPC | DSH 等价物 | 评估 |
|---|---|---|---|
| Routines（个人） | getAgentAutomations family（云端 automation 引擎；行 EM=toggle isEnabled+trigger 描述只读，UI 无编辑引擎） | dsh schedule_*（scheduled tasks；有 enabled 面） | **语义差（09:59 修正）**：比我初判小——0.78.1 行也只做 toggle+描述（trigger/schedule 云端格式化 Kj），编辑走对话（hsz5he 'Edit your routine: '种 composer）。dsh schedule 同为「定时触发 prompt 进会话」。可做：getAgentAutomations ← dsh 定时任务投影（name/rrule→schedule 描述/enabled→toggle），创建仍走 onAsk。**✅ B26 已完成（23e60cd5）：schedule/list 投影行+Pause/Resume toggle（M1 窄门 patch:{active}）；shortcut=dsh task 无 bot 绑定，全量展示** |
| memories（个人） | EFqXda 面（chat chunk） | dsh 无 per-bot memory store（bot 记忆=会话内） | 语义差大：0.78.1 memories 是持久 kv。DSH 会话即记忆。**判定：不接**（假数据劣于无） |
| searchAgents | searchAgents | session/list 过滤 | 0.78.1 全局搜索 bot——我方侧栏已有即时过滤，无独立 RPC 必要。**判定：不接** |

### C. 不可接（deferred 维持，本批确认）
| 域 | 面 | 阻断点 |
|---|---|---|
| C | bot-share-control/state-line/invite-popover/popover/trigger（7 chunk ~140KB） | 团队共享=xAI 云端（getBotSharedMemories/getSharingState 均云端契约）；DSH 无团队概念 |
| C | bot-configure-dialog（33KB） | teammates/hours saved/top users=xAI 云端运营数据屏 |
| C | agent-invite-dialog（15KB） | 同上（团队邀请） |
| C | bot-template-details/share-card（36KB+） | 模板市场=xAI 云端 |
| F | view-CZFaUvTL（87KB New Team Bot 向导） | team bot 创建流程（Memories/Routines/Plugins/Skills/Secrets 步骤）——产物是云端 team bot |
| F | Memories（团队） | getBotSharedMemories 云端 |
| F | Calendar | 无 chunk 无 RPC，纯线索 |

### D. SuperAgent 术语层（已做，本批确认边界）
- T36/T37 已定：主 agent 的 subagent → 侧栏 Workers 分组（origin==='subagent' && parentSessionId===mainBotId）；bot=对等 DSH 实例；worker=主 agent 内部 subagent
- goal 第二步「SuperAgent 适配」在呈现层已闭环；剩余=**跨 bot 通信**（SuperAgent.main ↔ bot.main 对等）——无 0.78.1 UI 面（0.78.1 无此概念），属 DSH 侧新功能非复刻，**不属于本 goal 范围**（goal 措辞=「把逆向出的能力面接到 DSH/SuperAgent 真实后端」——逆向面里无此项）

## 结论

1. **第一步收官确认**：LEDGER 全量盘点+C/F deferred 判定完毕；A 类 22+2 批全合并
2. **第二步候选清空**：B26 已落地（Round 2 自动续作授权）；B 类无可接候选、C 类云端 deferred、D 类呈现层闭环
3. **goal-ed007eb1 收官**：两步目标均达成（第一步=LEDGER 七域全量盘点+B1–B24 批复刻；第二步=映射台账+A 类实装+B26），候选队列空

## 证据锚
- shim 空桩清单：app/ui/renderer-grok/shim/src/coordinator.ts:43-59（defaultReply）
- 0.78.1 automations 契约：index.eager-app（getAgentAutomations:{args:'object',reply:'array'}、automations:[getAgentAutomations,getAutomationWebhookCredential,listAllAutomations,setAgentAutomationEnabled,createAgentAuto…]）
- SuperAgent 定案：work/archive/bot-product-awareness/BRIEF.md（06:0x/06:1x 两节）
- C/F 域 chunk 清单：work/b23-ui-full-re/LEDGER.md §初步结论
