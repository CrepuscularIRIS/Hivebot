# RE-DRAFT-SEND-1.1.0 — 草稿发送失败卡 / 修订高亮摸底（骨架级）

> 来源：deb110 asar dist（1.1.0），三 chunk 静态分析 + 主 chunk（view 系列）调用面。
> 状态：骨架级（状态机+组件结构已确凿；文案层待 i18n 补）。

## 三件套 chunk（renderer/assets/）

| chunk | 大小 | 内容 |
|---|---|---|
| chunk-draft-send-error-DjK9UMvM.js | 35KB | 失败卡 + retry 组件 + 修订 diff 编辑器 |
| chunk-elevated-draft-fields-C12W3LS0.js | 9.5KB | 提升字段（email-draft 等） |
| chunk-use-draft-revision-highlight-CEDVl3cM.js | 9.5KB | 修订高亮 hook |

## 状态机（确凿，draft-send-error chunk）

- `entry.draftSendState`：`sending` | `unconfirmed` | undefined
- `entry.draftSendRetry`：retry 上下文对象（sending 态下有值 → 渲染 retry 组件）
- `entry.draftSendInFlightUntilMs`：unconfirmed 态的超时锚（now > until → 转失败/确认）
- `entry.draftSendRefused: true`：拒发（审批拒等）→ 失败卡（与 state 并列的分支）
- retry 组件 `Yt` 两 placement：`under-card`（消息卡下方）/ `actions`（操作行内）
- `draft-send-retry-tick` 信号（reactive 订阅）：`intervalMs: 1000`——每秒 tick 驱动 unconfirmed 超时判定
- `unconfirmed` + `InFlightUntilMs !== void 0` 分支存在（jt 组件 :579）——「已发但未确认」态
- 状态角色：muted → `role:"status"`、否则 `role:"alert"`（$ 组件 :578）；`level:"body2"`、`dir:"auto"`、`as:"p"`

## 修订 diff（确凿，同 chunk）

- diff 三态 `added` / `removed` / `same`；email-draft 特判（platform 分支 G(t.draft, draftRouteVerified)）
- diff 操作 `[{op,text}]`；removed/added 拆行
- 白名单 flatten 标签：span/strong/table/tbody；img 只放行 `data:image/` 与 `https://` src
- contentEditable 编辑器 + onCompositionEnd/onInput；`aria-multiline`、`dir` 支持
- 高亮样式类（retry 态命名空间）：anchored / muted / retryInActions（sand-* 原子类）

## 失败卡在 workspace 的挂点（chunk-view-DA0s2tO9.js 等 view 系列）

- Composer 侧 props 面：`{batch, failureNote, isDiscarding, isSendable, isSending, onDiscard, sendLabel, sendWait}`——失败通知经 `failureNote` 传入（文案在更上层/i18n）
- `sendWait: 'reconnecting'`——重连态下 send 按钮文案切换（`$ ? 'reconnecting' : void 0`）
- elevated 字段：`{isMuted, isAnchored, children}` 的 Note 容器（muted=role status / 否则 alert）

## 与 HiveBot 现状差距（对照 app/ui/renderer-grok）

- 我们的 composer 覆盖层（composer.tsx，15 行）只有连接器失效禁用；上游 0.18 底座无草稿失败语义
- shim 无 sendDraft/discardDraft coordinator 方法（RE-FULL §3 A1 行「部分」）
- 缺：发送失败卡（refused/unconfirmed/sending 三态 + retry 两 placement + 1s tick）、修订 diff 编辑器、elevated 字段

## 文案层（已补，index.eager-app-DNSDeodN.js 英文基准）

失败/未确认键组（键→句）：
- `lDjxmT` "Failed to send"（标题）
- `cCCVzA` "Didn't go through"
- `qq3pY2` "Not delivered yet"
- `s2j1h7` "Unconfirmed"
- `01Zgfk` "Timed out"
- `by/FZp` "Your answer didn't go through. Try again."
- `sSMHtl` "Your answer didn't go through. Check your connection and try again."
- `byFgiD` "Grok Bot on your Mac needs an update, so nothing was sent. Update it, then try again."（更新态）
- `lDo7f5` "Something went wrong on your Mac, so nothing was sent. Try again."
- `lMU49F` "Not accepted by Link"
- `rTjXfq` "Discarded"（丢弃确认）
- `rRtbxf` "Send this message?"（重发确认）
- `+zYUxF` "Discard"（按钮）
- `zUIxpw` 类附件满："This Bot is out of space for attachments. Your message wasn't sent."（Fnasbh，common chunk）
- offline Messages：`eoabq8` "Your Mac seems to be offline… Check Messages on your Mac before sending it again."（iMessage 专属，HiveBot 不搬）
- `sendWait: 'reconnecting'`——重连态 send 钮文案（chunk-view-DA0s2tO9.js）
- 修订高亮："Changed in this revision"（`J1S2Nq`）；Draft 相关："Draft: {draftPreview}"（`eGHpIg`）、"Draft:"（`dFX5dn`）、"Draft: only you can see it until you publish"（`FPRVdY`，团队发布域不搬）、"Turns off drafts for this Bot"（`5sY5X4`，bot 设置）
- iMessage/macOS 专属句（byFgiD/lDo7f5/eoabq8 类）在 HiveBot 映射为通用离线/本地故障句

## 状态→文案映射（骨架推断，施工时以组件分支实测为准）

| 状态 | 主句 | 动作 |
|---|---|---|
| refused（审批拒/拒发） | Didn't go through + 原因 | Edit / Discard |
| sending + retry 上下文 | Failed to send | Retry（under-card）/ actions 内 Retry |
| unconfirmed 超时（tick 1s 判定） | Unconfirmed / Not delivered yet | Resend / Discard |
| 重连中 | sendWait: 'reconnecting' | send 钮文案切换 |

## 施工切法（定稿）

1. **数据层先行**：shim coordinator sendDraft/discardDraft + entry 上 draftSendState{sending,unconfirmed,refused}/draftSendRetry/draftSendInFlightUntilMs/draftSendRefused 状态机（含 1s retry-tick 语义）
2. **失败卡 UI**：refused + unconfirmed 超时两分支（文案上表）；retry 两 placement（under-card/actions）
3. **修订 diff 编辑器**：独立后置（added/removed/same 三态 + 白名单 flatten）
4. e2e：发送失败注入（rebindFailAt 同款 rig 思路）→ 断言卡与 Retry/Discard 行为
