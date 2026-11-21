# B19: transcript 分页细化（对齐 0.78.1）

日期：2026-11-18
需求来源：REQ-1.1.0-PARITY.md §5 候选序（transcript 分页细化）

## 0.78.1 行为规格（产物实锤，非猜测）

**触发器（chat+library 双视图同款）**：列表头部不可见 sentinel div（`class="sand-jm9jq1" aria-hidden`）+ IntersectionObserver。
- 可见且 olderHistory 状态 loadable 时 `loadOlder()`，重试环上限 10（`for(;t&&n<10;)`）
- 状态机 Jyn：loadable|loading → 可触发（loading 态也重入环，防 observer 常驻空转）；exhausted|failed → 不触发
- Jyn(e) 行状态机：hasOlder ? (isLoadingOlder?'loading' : isOlderPageFailed?'failed' : 'loadable') : 'exhausted'
- observer disconnect on unmount

**页大小**：openAgentTail 初始页 limit:500；getAgentTranscriptTail 前台 500、后台 background 200（n$n=200）
**RPC**：getAgentTranscriptTail/openAgentTail reply:'transcript-page'
**日分组（library 视图）**：today/week/older（i18n ecUA8p/yByRxz/fwE6J）
**fold 层 mayHoldOlderHistory**：e.hasOlder??!0（@2988941 Qmt）

## 我方现状与差距

| 维度 | 0.78.1 | 我方 | 差距 |
|---|---5 |---|---|
| 触发器 | IntersectionObserver sentinel | scroll scrollTop≤600 阈值 | 行为等价但实现不同；sentinel 更精确（用户滚到顶前预载） |
| loading 态 | 有（loading 行状态） | 无 | 滚到顶时无反馈 |
| failed 态 | 有（可重触发） | 无 | 加载失败静默 |
| 页大小（初始） | 500 | 40（HISTORY_PAGE） | 严重不足 |
| 页大小（翻页） | 200 | 40 | 不足 |
| 分页游标 | nextBeforeSeq | nextBeforeSeq | ✅ 同款 |
| 汇入主列表 | 按 id 合并 | mergeOlderTranscriptEntries 按 id 合并 | ✅入 |
| 日分组 | today/week/older | 无 | library 觞图无此面（P2 待 UI 面定） |
| hasOlder 初值 | e.hasOlder??!0 | unprobed→probe | ✅ 同思想 |

## 改动面（最小集）

1. **shim 页大小对齐**：HISTORY_PAGE 40→200（翻页/初始统一 200；500 初始页是 0.78.1 会话恢复的深度恢复窗口，dsh session/events 语义下 200 已是内存友好的等价，且我方 DEFAULT_PAGE_LIMIT=200 前端已对齐）
2. **chat transcript 顶部 sentinel + IntersectionObserver**：transcript.tsx scroll 触发改 sentinel 触发，保留 scroll 作为 fallback（happy-dom 单测环境无 IntersectionObserver，需 polyfill 或测试绕过）
3. **loading/failed 状态行**：chat transcript 顶部渲染状态行（loading 显示 spinner 文案 / failed 显示重试按钮）
4. **单测**：分页状态机（loadable/loading/failed/exhausted 转移）+ sentinel 挂载（component 挂载时 observer.observe 被调）
5. **e2e**：长会话（预置 250 条）→ openAgentTail 只见尾 200 → 滚顶触发 loadOlder → 前面 50 条补全 + 区序断言

## 不做（P2，记录在案）
- library 视图日分组 today/week/older（library 视图本身是 P2 面）
- limit:1 单条校验重读（updated 事件处理是 B20 候选）
- unreadBoundaryAt 联动 unread divider（unread 面已由 T48 覆盖）
