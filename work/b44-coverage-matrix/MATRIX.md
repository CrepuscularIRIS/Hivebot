# Hivebot × Grok Bot 1.1.0 · 功能覆盖矩阵（B44 起）

> 生成：2026-11-19（goal 持续开发轮），来源=REQ-1.1.0-PARITY.md（B1–B26 批次台账）+ b23-ui-full-re/LEDGER.md（七域+生态域+真机域）+ MIGRATION-DELTA.md（1.1.0 增量面）。
> 规格锚：0.78.1 已复刻面不返工（锚不变）；1.1.0 新面按 1.1.0 锚（MIGRATION-DELTA §0）。
> 状态定义：VERIFIED=真实端到端证据；PARTIAL=壳/部分；MISSING=未实现；BLOCKED=已验证外部依赖阻塞（带解锁条件）；UNKNOWN=证据不足。
> **分母固定**：本矩阵列出=已发现功能全集，BLOCKED 不从分母删除。

## 矩阵（按域）

| FID | 域 | 功能 | 版本锚 | 原版证据 | Hivebot 现状 | DSH 映射 | 状态 | 优先级 | 测试 | 阻塞原因 |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | 对话 | 消息收发+流式渲染 | 0.78.1 | transcript 组件链 | 全链（litellm 真模型 13 中间态） | session/prompt→coordinator | VERIFIED | — | e2e 全链+d1 真模型 | — |
| A2 | 对话 | transcript sentinel 分页 | 0.78.1 | eager-app T3/Jyn | B19（observer+状态行+重试 10） | getAgentTranscriptTail 200/页 | VERIFIED | — | b19 spec | — |
| A3 | 对话 | Reply 引用回复链 | 0.78.1 | A5 | B5 | reactToMessage 域内 | VERIFIED | — | b5 spec | — |
| A4 | 对话 | 草稿发送失败卡 | 1.1.0 | RE-DRAFT-SEND | B2（refused/timed-out+Retry/Discard） | draft-state | VERIFIED | — | b2 spec | — |
| A5 | 对话 | 代码高亮 shiki 双主题 | 自研 | — | B43（CSS 变量零重渲） | — | VERIFIED | — | b43 spec | — |
| A6 | 对话 | composer @提及+emoji | 0.78.1 | T90b/c | 有 | — | VERIFIED | — | t90 specs | — |
| A7 | 对话 | composer '/' skill 引用面 | 0.78.1 | prompt-editor hi() | B27a（skills 实底投影） | getAgentWorkflows→skills list | VERIFIED | — | b27a spec | — |
| A8 | 对话 | 斜杠命令 | 1.1.0 | A8 | B4（new-bot/search/market/keys） | — | VERIFIED | — | b4 spec | — |
| A9 | 对话 | transcript-markdown skill 卡 | 0.78.1 | chunk-transcript-markdown | markdown 已有；skill 卡未渲染 | — | VERIFIED | 单测 2p+e2e 8.6s+b27a/b17b 回归 | — | P2 | — | — |
| A10 | 对话 | voice-memo-bubble（TTS 气泡） | 0.78.1 | chunk | 无 | 无 TTS 后端 | BLOCKED | — | — | 无 TTS 引擎；解锁=接入开源 TTS 或上游 API |
| A11 | 对话 | Spotlight quick-chat | 1.1.0 | chunk-spotlight | B6（Alt+Space） | — | VERIFIED | — | b6 spec | — |
| A12 | 对话 | 附件图片缩略图 | 0.78.1 | A7 | B17b（staging data URL 全链） | attachments | VERIFIED | — | b17b spec | — |
| B1 | 设置 | General 区全行序 | 0.78.1 | GPANE | B18（Language/Spell/通知音/硬件加速+SecurityKey 恢复） | desktop bridge 四面 | VERIFIED | — | b18 spec | — |
| B2 | 设置 | 主题双态（cursor-light/dark） | 0.78.1 | theme store | B38a token 清扫+真机验证 | — | VERIFIED | — | b38a 守卫+spec | — |
| B3 | 设置 | 语言切换消费端 | 0.78.1 | GJn | B20（resolveDisplayLanguage+dir） | — | VERIFIED | — | b20 spec | — |
| B4 | 设置 | i18n 36 locale catalog | 0.78.1 | FormatJS | 不做（无翻译资产） | — | BLOCKED | — | — | 无可复用翻译资产；解锁=上游开源 catalog |
| B5 | 设置 | per-tool 四档权限 | 0.78.1 | RE-TOOL-PERMS（两版同构） | B45 数据面+门接线（blocked deny/always 直放）+B45b 桥+详情页 ToolPermissions 区 | mcp-permissions.json+shell-ask+market-surface | VERIFIED | P1 | b45 6p+b45b e2e 8.3s | — |
| B6 | 设置 | usage 区（credits/limits/resets） | 1.1.0 | settings usage 子节 | 无 | 无计费后端 | BLOCKED | — | — | 计费域；解锁=接自建计量 |
| C1 | Bots | bot 创建对话框 | 0.78.1 | new-bot-dialog | 完整（avatar/preset/connectors/model） | session/create 链 | VERIFIED | — | 真机 New Bot 走查 | — |
| C2 | Bots | Bot Knowledge（skills CRUD） | 1.1.0 | bot-manage-knowledge | B24（SkillEditor 0.78.1 Ce 规格） | main/skills create/update | VERIFIED | — | b24 spec | — |
| C3 | Bots | Routines 区（schedule 投影） | 0.78.1 | ftt/EM 行 | B26（list 投影+Pause/Resume） | schedule/list+edit | VERIFIED | — | b26 spec | — |
| C4 | Bots | team-bot 系列（share/invite/configure/overview） | 0.78.1 | 7 chunk | 无 | 云端团队契约 | BLOCKED | — | — | 需账号体系；解锁=自建团队服务 |
| C5 | Bots | 群聊（people+agents 混合） | 0.78.1 | @2788999 | 无 | createGroup 云端 | BLOCKED | — | — | 同 C4 |
| C6 | Bots | bot 模板发布/市场 | 0.78.1 | publishBotTemplate | agentPresets 等价（B28 判） | agentPresets/list | VERIFIED | — | b28 评估 | — |
| C7 | Bots | Tasks 岛+看板 | 1.1.0 | chunk-view-DICrypK2 | B21（progress-only 四组） | subagents 投影 | VERIFIED | — | b21 spec | — |
| D1 | 工具 | 连接器市场+grant 审批卡 | 0.78.1 | RE-CONNECTORS | T73c（Always allow 分档） | pluginManager | VERIFIED | — | t73c spec | — |
| D2 | 工具 | custom-mcp-form | 0.78.1 | chunk | ◐ 表单细节差距 | — | VERIFIED 单测 shim 288/288+e2e 7.7s+market 回归 | sdk 注入 shortcut | P2 | — | — |
| D3 | 工具 | MCP 错误文案（stdout/PATH/mcp-remote） | 1.1.0 | deb110 ZLt/$Lt/sRt 六 key 实锤 | connector-error.ts 分类器+六条文案挂 outcomeText | — | VERIFIED | P1 | d3 单测 7p | — |
| D4 | 工具 | Good/Bad response 反馈 | 1.1.0 | deb110 chunk-view VIfUjY/if+kEf 实锤 | More 菜单 Good/Bad 两项+本地 voted 态；云端上报无后端 | — | PARTIAL | P2 | d4 单测 3p+e2e | 云端 voteFeedback 管道 BLOCKED（无后端） |
| E1 | SuperAgent | 主 bot 路由（@提及派发） | 自研 | B30 ARCHITECTURE | B31（MENTION 正则改投 worker） | superagent-router | VERIFIED | — | b31 spec | — |
| E2 | SuperAgent | engine 循环+master 发现 | 自研 | B41a | discovered 链（bots.json→masterId） | watchBotsMeta+KV | VERIFIED | — | b41a spec | — |
| E3 | SuperAgent | 委派→审批→回写闭环 | 自研 | B41 真机 | 工具审批 3 轮+终稿（真模型） | approval dock | VERIFIED | — | 真机走查 | — |
| F1 | 长尾 | 多 bot 快速切换压测 | 自检 | B38d | 12 bot 200ms 连切零错投 | — | VERIFIED | — | b38d spec | — |
| F2 | 长尾 | 断链反馈（Reconnecting 行） | 0.78.1 | — | B39-A（dropCarrier 注入） | transport emit | VERIFIED | — | b39a spec | — |
| F3 | 长尾 | Copy 反馈 live region | 0.78.1 | fS/pS | B40-C | announce.ts | VERIFIED | — | b40c spec | — |
| F4 | 长尾 | relativeTime 七档 | 0.78.1 | Fn | B40-B | — | VERIFIED | — | b40b spec | — |
| F5 | 长尾 | 快捷键帮助 mod+/ | 0.78.1 | keybindings | T94 | — | VERIFIED | — | b40a spec | — |
| G1 | 新面 | 侧栏 rail 形态（easy-mode 分层） | 1.1.0 | RE-RAIL-TASKS R2（§0/§1） | 88px rail 折叠态已在（T59）；easy-mode 三档状态机/floating controls/tasks peek=experiment `sand_easy_mode` 门控+RE 自标无原版渲染实测 | — | BLOCKED | P1 | T59 折叠 e2e | 原版 experiment 门控未开放；无渲染参照；88px rail 本体已 VERIFIED |
| G2 | 新面 | tasks 岛 clip-path 动效 | 1.1.0 | RE-RAIL §3（8 keyframes 配对表） | peek 卡形态（clip 揭示+Escape/外点）落地；.5px ring 组+药丸平移组属 floating 岛形态不适用 | — | VERIFIED | P2 | g2 e2e | — |
| G3 | 新面 | spotlight 全局搜索（Search Bots/Chats/Settings） | 1.1.0 | chunk-spotlight+eager-app ALCDRp//RmlZA | CommandPalette 六 tab 聚合搜索已在；本轮补 Alt+Space 入口+placeholder 双态 | — | VERIFIED | P2 | g3 单测 4p+e2e 5.2s+bots-search 回归 | — |
| H1 | 设备 | phone-call/语音录制 | 1.1.0 | i18n | 无 | 无电话后端 | BLOCKED | — | — | 电话域 |
| H2 | 设备 | Mac 深度连接（Messages/Notes…） | 1.1.0 | view-kcheXZ65 | 无 | macOS only | BLOCKED | — | — | 平台限制+账号 |
| H3 | 设备 | 远控（Take control） | 0.78.1 | box-desktop-modal | 无 | — | BLOCKED | — | — | 远控安全域 |
| H4 | 设备 | 购物/出行/try-on 卡 | 1.1.0 | places-stage | 无 | — | BLOCKED | — | — | 支付域 |
| H5 | 设备 | Vault（密码管理器） | 1.1.0 | view-Bx8u2sOw | 无 | — | BLOCKED | — | — | 凭证域 |
| H6 | 设备 | Teams/Slack 集成 | 1.1.0 | chunks | 无 | — | BLOCKED | — | — | 第三方账号 |
| H7 | 设备 | onboarding 11 步向导 | 0.78.1 | chunk | 我方简化向导在 | — | VERIFIED onboarding.spec 6p（walk 全链+role 2 模板 bot+skip 语义） | — | P3 | — | 云端演示动画不可复刻 |
| H8 | 设备 | Calendar 视图 | 0.78.1 | view-BQsUvw4u | 无 | 无源 | BLOCKED | — | — | 无 RPC 无 chunk |
| H9 | 设备 | Memories（团队版） | 0.78.1 | getBotSharedMemories | 无 | 云端 | BLOCKED | — | — | 同 C4 |

## 统计（分母=58 已发现功能）

- VERIFIED：39（67%）
- PARTIAL：0——H7 复查=onboarding.spec 6p 全链已锁（T28 实装）；B5 尾巴=ToolPermissions 工具名手输（真源 listMcpServerTools 无 dsh 面，D2 同款 shortcut）
- MISSING：0；BLOCKED：16+1（G1）；PARTIAL 中 D4 已落地（云端上报 BLOCKED）
- BLOCKED：16（全带解锁条件；云端/支付/电话/平台域）

## P1 施工队列（下一轮起）

1. **B5 per-tool 四档权限**（0.78.1 两版同构锚 RE-TOOL-PERMS；我方有审批卡底座）
2. **D3 MCP 错误文案对齐**（1.1.0 三条：stdout/PATH/mcp-remote）
3. **G1 侧栏 rail 形态**（RE-RAIL-TASKS R2 分层状态机：solo 隐藏/few rail/many 传统）
