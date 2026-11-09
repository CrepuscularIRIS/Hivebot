# T41：侧栏「Hide from sidebar」+「Hidden Bots」恢复（不删也能收起 bot）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：`work/exp-polish/AUDIT-0.79.3.md` S7 / 场景 2（queue E5）。BRIEF 2026-11-09 追加段「原版即规格」。
> 分支 / 作业目录：feat/T41 @ /tmp/bot-wt/T41（从集成分支起；与 T40 同碰 `coordinator.ts` 的 switch，相邻行，合并时三方合并）
> claimed：2026-11-09 main (GLM 5.3) @ feat/T41 // worktree /tmp/bot-wt/T41
> accepted：2026-11-09 dd93ac50（经理任务 B，见 receipts/T41d.acceptance.md）

## 目标
侧栏行菜单出现原版的「Hide from sidebar」。隐藏后行从侧栏消失（含 Workers / Done 组），侧栏底部出现「Hidden Bots N」按钮，点开对话框能看、能打开、能 Unhide；重启后隐藏状态还在。删除被 P6-24 卡着，这是现在唯一能把试验 bot / 用完的 worker 收起来的办法。

## 原版（规格）
- 0.79.3：roster 每项带 `isHiddenFromSidebar`，缺省 false（`/tmp/grokbot-0.79.3/extracted/dist/electron-main/main-app.cjs` @3282068 `isHiddenFromSidebar:o?.isHiddenFromSidebar??!1`）；i18n `JuesWZ`「Hidden Bots」。
- 0.18 树整套都在且已挂载：行菜单动作（`frontend/src/production/agent-row-actions-model.ts` 的 hide 项）、乐观更新控制器（`recovered/features/hidden-chats/overlay/mutation-controller.ts`，调 `setAgentHiddenFromSidebar({id, isHidden})`，失败回滚）、`model.ts:168` 读 `raw.isHiddenFromSidebar`、`ProductionRenderer.tsx:1404`（visibleAgents 过滤）/`:3321`（命令面板「Open Hidden Bots」）/`:3385`（全隐藏空态）/`:3452`（侧栏底按钮 + 计数）/`:3631`（对话框，Unhide / 打开）。

## 现状（经理探针）
1. `overrides/modules/agent-row-actions-model.ts` 把 hide 项滤掉（P5-52：当时没 handler、没恢复入口）。
2. `shim/src/coordinator.ts` 没有 `setAgentHiddenFromSidebar` → unknown-method（方法表 `source/shared/rpc/coordinator.ts:123` args object / reply void）。
3. `shim/src/agents.ts` 的 raw 不带 `isHiddenFromSidebar`。

## 定案（自定）
- 存储：localStorage `pbots.shim.hidden-agents`（JSON 字符串数组），读法照置顶 `desktop.ts:106-112`（坏值回 []，私有模式静默）。隐藏只是 UI 偏好，丢了不致命，不进 M3。
- 不加特例：主 bot、worker、helper 都能藏（上游无特例；0.79.3 未见主 bot 例外）。被藏的 bot 有新消息也不自动取消隐藏（上游行为）。回执记一条「主 bot 被藏时侧栏无入口，只能从 Hidden Bots / 命令面板回来」供用户实测看。
- Workers 合成段：被藏的 worker 不出现在任何组里（若上游 section 投影已按 visibleAgents 过滤就不用动 `workers.ts`；施工先查 `recovered/.../sidebar-section-projection.ts`，不过滤才在 `data.ts` sections 里剔，回执写明走哪条）。
- 对被删除的 id（roster 里已没有）：读出时忽略，不清理存储。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. 上面「原版」列的 0.18 文件（只读）；`shim/src/desktop.ts:103-112`；`shim/src/agents.ts`；`shim/src/data.ts` 里 `push.agents` / `sections()`；`tests/unit/grok-shim/main-helpers.test.ts:10-33`（rig）

## 边界
1. 只动：`app/ui/renderer-grok/overrides/modules/agent-row-actions-model.ts`（删掉过滤，可整文件删并从 `overrides/vite.config.ts` 的 MODULE_OVERRIDES 去掉那行——二选一，选改动小的）、`shim/src/{coordinator.ts,data.ts,agents.ts}`（需要时 `workers.ts`）；新测试 `app/ui/tests/unit/grok-shim/hidden-bots.test.ts`；`app/ui/tests/e2e/grok-dead-entries.spec.ts:155` 行菜单清单**按上游顺序补进「Hide from sidebar」**（本单授权改这一行断言，别的不动）。
2. 先写失败测试（rig 照 main-helpers，注入内存 localStorage 照 `desktop.test.ts:12`）：
   - ① **隐藏 → raw 带标记**：coordinator 收 `setAgentHiddenFromSidebar{id:B, isHidden:true}` → 回 ok；`listAgents()` 里 B 的 raw `isHiddenFromSidebar===true`，其余 bot 无此键或 false。**施工前必红**（unknown-method）。
   - ② **持久**：同一 localStorage 新建一个 shim data → B 仍 `isHiddenFromSidebar===true`。
   - ③ **Unhide**：`isHidden:false` → 标记消失，localStorage 里不再有 B。
   - ④ **隐藏的 worker 不进组**：rig 里 main M + worker W（createdBy M）→ 隐藏 W → 任何 section 的 agentIds 都不含 W（若走上游投影过滤，这格断渲染层的 `projectedSidebarSections` 等价物，施工按实际落点改断言对象，回执写明）。
   - ⑤ **坏值**：localStorage 预置 `'not json'` → 不抛，全员可见。
   - 先跑红 ①，贴原样输出。
3. 隔离 HOME / TMPDIR，DBus 指向不存在路径；只跑下面列的 e2e。
4. 只在 feat/T41 提交；纯 UI 偏好单，可与下一批攒着派 reviewer。

## 验收（写命令，不写感觉）
（`app/ui` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`）
1. `VR tests/unit/grok-shim/hidden-bots.test.ts --reporter=verbose` → 5 passed
2. 回归：`VR tests/unit/grok-shim` → 全绿，passed = 基线 + 5
3. 变异（贴红后 cp 还原）：V1 持久化写入删掉 → ② 红；V2 raw 不带标记 → ① 红
4. e2e：`pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/grok-dead-entries.spec.ts tests/e2e/p6-workers.spec.ts` → passed（dead-entries 的行菜单清单含 Hide；`coordinator.unhandled` 断言仍为空）
5. 新 e2e 段（加在 `grok-dead-entries.spec.ts` 末尾一个新 `test(...)`，或新文件 `grok-hidden-bots.spec.ts`，二选一）：右键某 bot → Hide from sidebar → 该行消失、出现 `[aria-label="1 hidden bots"]` 徽标 → 点开对话框 → Unhide → 行回来；中途 `page.reload()` 一次，隐藏仍在。截图 `work/exp-polish/evidence/T41/{hidden,dialog}.{light,dark}.png`（只截目标窗口，亲眼确认）
6. 改动行覆盖 ≥80%：`VR tests/unit/grok-shim/hidden-bots.test.ts --coverage --coverage.include='renderer-grok/shim/src/{coordinator,data,agents}.ts'`

## 为什么这样验收
- 用户要的是「收起来、重启还收着、想要能拿回来」——①②③ 各守一半，e2e 第 5 条在真页面上走完整一圈（含 reload）。
- ④ 守最容易漏的地方：Workers 是我们自己合成的分组，上游的隐藏过滤可能只管扁平列表，worker 藏了还挂在组里 = 没藏。
- dead-entries 的 `unhandled` 为空守「入口活了、背后真有 handler」（U4′ 零死入口口径）。

## 用户补充
（用户实测后补的写在这里。）

## 产出
- `overrides/modules/agent-row-actions-model.ts`（改或删）、`shim/src/{coordinator,data,agents}.ts`
- `tests/unit/grok-shim/hidden-bots.test.ts`（新）、`tests/e2e/grok-dead-entries.spec.ts`（:155 一行 + 可选新段）
- `work/tickets/receipts/T41.receipt.md`、`work/exp-polish/evidence/T41/*.png`
