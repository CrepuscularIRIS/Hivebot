# B19: transcript 分页细化（0.78.1 对齐）

- Goal: chat transcript 分页体验对齐 0.78.1——sentinel+IntersectionObserver 触发、loading/failed 状态行、shim 页大小 40→200
- Constraints: 不动 dsh session/events 语义（maxMessages 上限受 dsh 侧约束时以 dsh 为准记录）；happy-dom 无 IntersectionObserver 需桩；回归 b17b/b17 附件链不受影响
- Steps:
  1. shim HISTORY_PAGE 40→200（data.ts:89）+ follow maxMessages 同步
  2. transcript.tsx scroll 触发改 sentinel+observer（保留 scroll fallback）
  3. 状态行组件（loading/failed）插入 transcript 顶部
  4. 单测：状态机 + sentinel 挂载
  5. e2e：250 条长会话 → 滚顶补全
  6. 回归 + 合并 + 回测
- Review Focus: sentinel 在 happy-dom 下不炸；failed 重试路径;250 条 e2e 的内存合理
