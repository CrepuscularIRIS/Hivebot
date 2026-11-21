# REPORT · P6-15 + P6-16
2026-11-04 · frontend-dev（Opus 5.5）· `feat/P6-15` @ 49603f0 · 基点 main@92cb6af · 定稿 `ui/P6-15-16-FINAL.md`

> 代录，未经改写。frontend-dev 写报告文件被运行环境拦下，正文由主会话落盘。

## 交付
- **侧栏**：shim 按 M3 `bots[id].createdBy` 推导分组：主 bot 一组（不显示组标题）→ `Workers` → `Done`（默认折叠），普通 bot 在最后一组。
  - **排序**：按决策 21：卡住 > 运行中 > 出错/停止未读 > 未读，同档按最近活动降序，再按 id。
  - **主 bot 行汇总**：worker 卡住时显示 `Waiting for you: ‹worker›: ‹原因›`，多个时为 `n workers need you`；主 bot 的未读只来自 worker；打开主 bot 不清除。
  - **窄轨**：收起侧栏后不显示 worker。
  - **不可编辑**：有 worker 时去掉分组的改名、删除、拖入拖出入口。
  - **实时更新**：成员或状态变化时，shim 推 `host-settings{fields:['sidebarSections']}`，侧栏才会重拉；出现不认识的会话在跑时，重拉 bot 列表。
  - 改动：`shim/src/{workers,data,desktop,index,agents,bots}.ts`、`overrides/modules/{sidebar,chat-header}.tsx`、`overrides/p6-15.css`。
- **主 bot transcript**：`create_bot` / `send_to_bot` 显示为 `Messaging ‹name›` 行，与工具行同形，整行可点打开 worker；失败行显示红色原因，不可点。
  - **回报卡**：走 assistant 泳道，每项带 worker 头像和名字；正文纯文本；单项最多 3 行，可 Show more / Open worker；多项合成一张卡。
  - **ask 项**：状态 `Needs you` → `Answered`；主 bot 侧没有审批按钮，点击后跳到 worker 并把焦点给原审批卡容器（不是 Allow 按钮）。
  - **worker 侧任务卡**：`From ‹主 bot›` + `· Task`，accent 左边线，正文逐字全文。
  - 改动：`overrides/modules/notice-view.tsx`（新）+ `vite.config.ts` 一行映射、`shim/src/entries.ts`。
- **reduce / fold**：`pbots-worker` → report item，`pbots-main` → task item，其余非 user 来源照旧丢弃；fold 把这两种当作与用户消息同级的回合起点（决策 6 闭合）。
- **main**：M3 store 和 get 透传可选 `bots`，没有 worker 时不写这个键（CONTRACT v1.5 §3.1）。

## 验证
- `renderer-grok pnpm check`：upstream diff=0（332 个文件），assets sha256 OK。
- 单测：439/439（+34：workers 22、reduce 3、fold 4、entries 2、desktop 2、m3 3）。
- 全量 e2e：70/70，9.6 分钟；p6-fold 断言未改，因为 notice 化只针对两个编排工具名，新卡片用 `role=article`，不计入 notice。
- 已覆盖：席 A 的 E1–E21 全部（E4 的红点改为文字前缀），席 C 的 ①–⑥、⑧，以及 ⑦ 的单测部分。

## 未落地 / 降级
- 出错的 worker 行用文字前缀 `Failed:` / `Stopped` 加 Unread 点，不画红点（红点要 fork 上游行组件）；出错/停止未读这一档只在单测覆盖。
- 真实 create/send/回报链路等 P6-10/11/12 合并；e2e 用测试插件代做（骨架来自 P6-09 probe），P6-17 需真链路复测。
- 离线时不清空列表：沿用上游行为，没有单独写 e2e。

## 给后续任务
- **P6-10**：在本分支 store 透传的基础上加写入方法和 #20 防提升，合并时三方对照。
- **P6-10 / 11**：Messaging 行从 create_bot 结果读 `{sessionId}`（读不到时按 uuid 匹配）；从 send_to_bot 实参读 `botId|bot|workerId|sessionId|id`，从 `prompt|message|text` 取预览；错误码 `pbots/busy|forbidden|capacity|invalid-args|main-unavailable` 都有对应文案。
- **P6-12**：ask 项的 eventId 用 `approval/asked.id` 或 `$events` 的 eventId 都行（两者不同源，UI 两种都认）；建议用 `approval/asked.id`，SDK 侧拿得到。
- **待办（不在本任务范围）**：
  - 普通 bot 卡住时原因仍显示 `local-tool-permission`。
  - 普通 bot 的侧栏未读从不随「打开」清除（上游只在 Mark as read 时调 `setAgentUnread`）；worker 已修。

## 证据
`evidence/P6-15/`，每组亮暗各一张：
- `sidebar-workers-4states`：Workers 内卡住 / 运行中 / 未读三态 + 主 bot 汇总 + Done 1
- `sidebar-workers-folded`：Workers 收起后主 bot 的 Needs attention 仍在
- `sidebar-rail`：窄轨只剩主 bot 和普通 bot
- `main-report-batch`：Messaging 行（成功 / 失败）+ 合批回报 + 转述气泡
- `main-report-single`：单项 Failed 回报，已展开
- `worker-dock-focused`：从 ask 项跳到 worker，原审批卡获得焦点
- `worker-task`：任务卡在 worker 回答之前

核心旅程由 `p6-workers.spec.ts` 在真实 Electron 里走完。没另用 playwright-cli：产品依赖 preload 桥，普通浏览器页起不来。

待 verifier 验收 + GU 评审（品味项见 FINAL §6）。
