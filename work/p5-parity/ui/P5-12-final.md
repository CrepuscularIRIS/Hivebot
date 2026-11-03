# P5-12 定稿 · 会话流 B7 thinking 行 + B14 时间分隔 / 未读线（frontend-dev，Opus 5.5）

输入：`P5-12-A.md`（席 A）、`P5-12-C.md`（席 C）、PLAN P5-12 行 ①–⑥ + 派发修订（验收 ② 三条）、`RE-visual-078-values.md` B6（thinking = thinking-medium accent、preview 13px 非 mono）、0.18 重建仓 `view.css:194-196,249-264`、`transcript.tsx:600-614,701-702`（只参照）。wire 字段在 `repos/deepseek-harness` 与已装 `dsh-llm-pi-ai/lib/index.js:1576-1600` 核对：`block-start{blockType:'reasoning'}` → `reasoning-delta{text}` → `block-end{block:{type:'reasoning',text}}`；事件信封 `event.time: number`（session-format `types.ts:32`）。

## 两席已收敛（照做）
真 reasoning 非空才出行、不画空壳 · 默认收起 · 整行原生 `<button aria-expanded aria-controls>`，Enter/Space · 顺序 图标 /「思考」/ 单行省略预览 / 箭头 · 展开原位 pre-wrap、max-height 220 内滚 · 不进气泡、不 live announce · 未读线按 bot 隔离、恰 1 条、停留期不动、无基线不出线、不持久化 · 时间文字 tertiary、未读 accent · 不引新依赖。

## 分歧取舍（一行一条）
| # | 分歧 | 定稿 | 理由 |
|---|---|---|---|
| 1 | 阈值：A 取 0.78.1 `emt=9e5` + 跨日、`>=`；C 说未查到、拟 `> T` | **A**（派发修订已追认）：`Δ >= 900000ms` 或跨本地自然日；首条恒出 1 条 | E78@1734517 / @1739705 实证；C 明说是未确认的拟定规则 |
| 2 | 外壳：A 复用 `.tool-card/.tool-line`；C 透明裸行 | **A** | 派发要点明定「复用现有 tool 行外壳」；P5-16 把 B6 整体切 0.78.1 时 thinking 行自动跟随 |
| 3 | 未读线与时间分隔同位时的顺序：A 未读→时间→item；C 时间→未读→item | **A** | E78 `Emt` 先 push divider 再 splice timestamp（实证）；C 无出处 |
| 4 | 分隔行 margin：C 照 0.18 `0 0 22px` / 未读 `22px 0`；A margin 0 靠 gap | **A**：两行 margin 0 | 派发修订 ③：`.chat-col` 已 `gap:22px`，照抄会叠成 44；验收按几何 22±1 断言 |
| 5 | 展开正文字号：C 0.18 10px；A 12/16 正文字体 | **A**：复用 `.tool-detail`（12/16、padding 0 10 10 25、max-h 220），只把字体改回正文（非 code） | 与本仓 tool 行一致（tool-detail 已是 12/16）；推理是散文不是代码；0.18 的 10px 由 P5-16 统一换 0.78.1 值时一并处理 |
| 6 | 预览字号：C 0.18 10px；A 继承 tool-summary 13px、非 mono | **A** | R2 B6：0.78.1 preview 13px ellipsis 非 mono |
| 7 | 推理阶段：A 改出 live「思考中」行、修空流式气泡；C 只说没 reasoning 时沿用三点 | **A + C 合并**：有 reasoning 无正文 → live 行（图标 breathe，reduced-motion 关）；既无 reasoning 也无正文 → 三点（含 `start` 帧后、首个 text-delta 前，原来这里是一个空气泡）；正文一到，流式气泡出现 | 派发要点；空气泡是现有 bug（`start` 帧置 `{text:''}`） |
| 8 | 展开态保存：C 按稳定 id 跨 chunk 保存；A 组件内 useState | **A**（同 ToolRow） | 定稿行 id 稳定（`t{turn}-s{step}-r`），chunk 不会重置；live→定稿换一次节点（live 时拿不到 turn/step），默认收起，可见变化只有标签「思考中→思考」 |
| 9 | 未读边界的写入点：A 写在 `select()` 换走时；C 未指定 | **自定**：Conversation 卸载时（`useEffect` cleanup）调 `markRead(id)` | 比 `select()` 多覆盖「去市场页再回来」（Conversation 同样卸载/重挂），否则回来会把已读内容再标一次；store 只加 `readMark` 字段 + `markRead` 一个动作 |
| 10 | 未读起点：A 第一个 `at > readMark` 且非 user 的 item；C「首条新增消息」，自发消息/thinking/工具状态不计 | **A** | 自发消息已排除；thinking/工具行是对方产出的新内容，线落在它前面正是「从这读起」；工具状态更新不改 `at`，不会制造未读 |
| 11 | 无基线：两席都是不出线 | 照做；但**已加载且为空**的 bot 基线记 0（离开时一条都没有，回来后全部算新） | 否则「新 bot 发完就走」的第一条回复永远不出线 |
| 12 | 进入时滚动：A 线以下内容超一屏 → 线滚到视口顶下 28px；C 不强制跳底 | **A** | 派发要点「超一屏滚到线」 |
| 13 | 文案：A「新消息」；0.18 `N new messages` | **A**，aria-label「以下为新消息」 | 0.78.1 可见文案只有 New（E78 `isRobC`），会话区全中文 |
| 14 | 时间文案 | **A**：今天 `今天 14:05` / 昨天 `昨天 14:05` / 同年 `11月3日周二 14:05` / 跨年 `2025年11月3日 14:05`；手写格式（不走 Intl，避开 ICU 差异），`now` 注入 | E78 `UR` zh-CN 形；单测可注入 |
| 15 | 分隔行作用对象：C「thinking/tool 子行不制造重复分隔」；A 全部带 `at` 的行都参与 | **A** | 照 0.78.1 `vmt`；thinking 与气泡同一事件同一 `at`，Δ=0 不会重复；长工具 >15 分钟出一条是有用信息 |

## 否掉
- C「store.ts 不在区域、需报告」：派发已追认 `readMark` 最小字段，按追认做，改动行列进报告。
- 未读线「滚过淡出」、reasoning 默认展开、气泡内引用块：两席都反对，照不做。
- 未读持久化：重启后要后端已读游标，本任务不做。

## 测试锚点
`.thinking-row[data-kind="thinking"]`（live 加 `data-live`）· 其 `button.tool-line[aria-expanded]` · `[data-thinking-detail]` · `[data-time-sep][role=separator]` · `[data-unread-line][role=separator]`。阈值 / 跨日 / 缺时 / 文案 → 单测 `tests/unit/session/markers.test.ts`；e2e `tests/e2e/visual-session.spec.ts`。
