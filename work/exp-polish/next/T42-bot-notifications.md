# T42：每 bot「Notifications」开关 + bot 回完 / 等你时弹系统通知，点了跳回它

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> **草稿**：T40 回执后由主 agent 挪到 `work/tickets/open/`（三张都改 `shim/src/data.ts`，串行做省合并）。
> 来源：`work/exp-polish/AUDIT-0.79.3.md` B5 / 场景 3（queue E6）
> 分支 / 作业目录：feat/T42 @ /tmp/bot-wt/T42
> claimed：
> accepted：

## 目标
用户切去别的窗口时，他自己的 bot（主 bot、手建的 bot）回完一轮或停下来等他（审批 / 提问），系统弹一条通知；点通知 → 窗口回到前台并打开那个 bot。每个 bot 的 info pane 里有原版的「Notifications」开关，默认开，可关，重启记住。worker 的规则不变（只发「需要你处理」，P6-18）。

## 原版（规格）
- 0.18 树：info pane 开关 `recovered/features/agent-info/settings/view.tsx:63-67`（文案「Notifications」/「Get notified when this agent finishes or needs input」，`role=switch`），控制器调 `setAgentNotifyOnUpdates({id, isEnabled})`（`settings/model.ts:26,168`），初值读 `raw.notifyOnUpdatesEnabled === true`（`production/ProductionRenderer.tsx:1288`）。
- 0.79.3：同一开关（index.eager-app @1596551 `aN`，label `iDNBZe`「Notifications」，失败 `QqKsGg`「Couldn't save. Try again.」）；**默认开**——main-app.cjs @2697464 `DNn={notificationsEnabled:!0,notifyOnUpdatesEnabled:!0}`、roster @3282068 `notifyEnabled:o?.notifyOnUpdatesEnabled??!0`。

## 现状（经理探针）
1. 开关被 `overrides/dead-entries.css:43` `.sand-agent-settings__card` 藏；coordinator 无 `setAgentNotifyOnUpdates`。
2. main 只有 worker 挂起通知 `main/notify/worker-notify.ts`（只认 `bots.json` 里有 `createdBy` 的 id，`:124`；完成不发——P6 设计「OS 通知只用于需要你处理」，`work/p6-orchestration/design/main-orchestration-opus.md:19`）。
3. **顺带发现的现存 bug**：worker 通知点击后 main 发 `webContents.send('pbots:open-worker', botId)`（`main/index.ts:276`），但 preload / renderer **没有任何地方监听这个通道**（全仓 grep 只有发送端和 `p6-notify.spec.ts:9` 注释）——点 worker 通知只会把窗口拉到前台，不会打开那个 worker。本单一并接上。
4. 回合结束点：`shim/src/data.ts:456` `finished = prev.running && !value`；等你点：`onEventsItem` 的 `approval/request`（`:425`）与 T40 加的 `user-questions/request`。

## 定案（自定）
- 开关存 localStorage `pbots.shim.notify-off`（被**关掉**的 bot id 数组；不在里面 = 开，对齐 0.79.3 默认开）。raw 带 `notifyOnUpdatesEnabled`。
- worker（`createdBy` 有值）：info pane 不显示这张卡（开关对 worker 没作用，显示就是骗人）；worker 的通知照旧走 P6-18。helper（subagent）同 worker 处理。
- 谁发：**统一在 main 发**（复用 worker-notify 的 Electron Notification + 点击聚焦 + `failed` 降级记账），不在 renderer 用 HTML5 Notification——一处实现、一套点击语义。新加 preload 方法 `pbots.notify({botId, kind:'finished'|'input', title, body})` → `ipcRenderer.send('pbots:notify', …)`；main 端校验：`botId` 非空 ≤200 字符、`kind` 枚举、`title` ≤80、`body` 截到 120 字符，非法丢弃并计数；窗口有焦点时不发（与 worker-notify 同口径）。
- 何时发（renderer 判，只对非 worker、开关开）：① 回合结束且（窗口没焦点 或 该 bot 不是当前打开的）→ `kind:'finished'`，title = bot 名，body = 终答前 120 字（没有终答文本就「Finished」）；② 该 bot 出现新的审批 / 提问 → `kind:'input'`，body = 「Needs your input」。同一 eventId / 同一回合只发一次。
- 点击：main 发 `pbots:open-worker`（沿用通道名，语义扩成「打开这个 bot」）；preload 新增 `pbots.onOpenBot(cb)` 监听它；shim 收到 → `ui.focus(id)`（P5-57 已有的打开入口）。
- 声音（「Play Sound for Notifications」）、按 bot 头像做通知图标：不做，queue 提议。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/ui/main/notify/worker-notify.ts` 全文、`main/index.ts:270-280`、`preload/index.ts`（只暴露窄函数的规矩，文件头）
3. `app/ui/tests/unit/notify/worker-notify.test.ts`（fake Notification / fake window 的写法，照抄）、`tests/e2e/p6-notify.spec.ts`（`globalThis.__pbotsNotify` stats 观测面）
4. 上面「原版」列 0.18 文件（只读）

## 边界
1. 只动：`app/ui/preload/index.ts`（加 `notify` / `onOpenBot` 两个窄函数）、`app/ui/main/notify/`（新函数或新文件 `bot-notify.ts`，复用 worker-notify 的 show/click）、`app/ui/main/index.ts`（接线一两行）、`renderer-grok/shim/src/{data.ts,coordinator.ts,agents.ts}`、`renderer-grok/overrides/dead-entries.css`（删 `.sand-agent-settings__card` 那半句，`Edit agent avatar` 保留）、`renderer-grok/overrides/modules/agent-settings.tsx`（worker 不显示卡）；`tests/e2e/grok-dead-entries.spec.ts:186` 改断言为「非 worker 可见、worker 不可见」（本单授权只改这一处）；新测试 `tests/unit/notify/bot-notify.test.ts`、`tests/unit/grok-shim/notify-switch.test.ts`。
2. 先写失败测试：
   - ① **开关**：coordinator `setAgentNotifyOnUpdates{id:B, isEnabled:false}` → ok，B 的 raw `notifyOnUpdatesEnabled===false`，重建 shim 后仍 false；未设过的 bot 为 true。**施工前必红**。
   - ② **回完发**：rig 里 B 跑 → 结束，窗口 hasFocus=false（注入）→ `pbots.notify` 恰被调 1 次，`{botId:B, kind:'finished'}`、body ≤120。**施工前必红**。
   - ③ **不发的三种**：B 开关关 / B 是 worker / 窗口有焦点且 B 正打开 → 0 次。
   - ④ **等你发、只发一次**：同一 eventId 的 approval waterfall 重放两次 → 恰 1 次 `kind:'input'`。
   - ⑤ **main 校验**（`bot-notify.test.ts`，fake Notification）：合法载荷 → show 1 次；`botId:''`、`kind:'x'`、body 500 字 → 前两个丢弃计数、第三个截到 120；`isFocused()=true` → 不 show。
   - ⑥ **点击打开**：fake 通知触发 click → fake window `focus` 被调、`webContents.send('pbots:open-worker', B)` 被调；shim 侧 `onOpenBot` 回调里调 `ui.focus(B)`（单测断 focus 被调）。**施工前必红**（无监听）。
   - 先跑红 ①②⑥，贴原样输出。
3. 隔离 HOME / TMPDIR，DBus 指向不存在路径；只跑下面列的 e2e。
4. 只在 feat/T42 提交；**动 preload / main IPC → 施工完单独派 reviewer**。

## 验收（写命令，不写感觉）
（`app/ui` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`）
1. `VR tests/unit/notify/bot-notify.test.ts tests/unit/grok-shim/notify-switch.test.ts --reporter=verbose` → 全 passed（①–⑥ 每格至少 1 个 it）
2. 回归：`VR tests/unit/notify tests/unit/grok-shim` → 全绿，passed = 基线 + 新增
3. 变异（贴红后 cp 还原）：V1 删掉「窗口有焦点不发」→ ③ 或 ⑤ 红；V2 删掉 eventId 去重 → ④ 红；V3 preload 不注册 `pbots:open-worker` 监听 → ⑥ 红
4. e2e：`pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/p6-notify.spec.ts tests/e2e/grok-dead-entries.spec.ts` → passed；p6-notify 的 worker 通知计数与施工前一致（基线贴回执）
5. 改动行覆盖 ≥80%：`VR … --coverage --coverage.include='main/notify/**' --coverage.include='renderer-grok/shim/src/{data,coordinator}.ts'`
6. **生产旁证（合并重启后，主 agent 做）**：给主 bot 发一句要跑十几秒的话，立刻切到别的窗口 → 弹通知（截系统通知区或 `notify-send` 日志）→ 点通知 → 窗口回来且停在主 bot；再在 info pane 关掉开关重复一次 → 不弹。再让一个 worker 挂审批 → 点它的通知 → 打开的是那个 worker（验第 3 条现存 bug 修好）。记 LOG。

## 为什么这样验收
- 用户要的是「不用盯着，回完会叫我，点了就到」。②⑥ 是这句话的两半；⑥ 同时证明 P6-18 那条一直没人接的点击通道接上了。
- ③ 守不扰民：worker 不发完成通知是 P6 的既有决策，窗口在前台不发是 worker-notify 已有口径——新通知要跟老通知同一个脾气。
- ⑤ 守 IPC 边界：renderer 发来的东西进 main 先校验（新开口子的硬要求）。

## 用户补充

## 产出
- `preload/index.ts`、`main/notify/*`、`main/index.ts`、`shim/src/{data,coordinator,agents}.ts`、`overrides/dead-entries.css`、`overrides/modules/agent-settings.tsx`
- `tests/unit/notify/bot-notify.test.ts`、`tests/unit/grok-shim/notify-switch.test.ts`（新）、`tests/e2e/grok-dead-entries.spec.ts:186`
- `work/tickets/receipts/T42.receipt.md`
