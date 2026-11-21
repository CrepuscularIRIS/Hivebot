# T73d：已装连接器对全部 bot 生效 + 删「建 bot 时挑连接器」（Connect 末单）——**安全单**

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：Q-055-3（用户 2026-11-12 = A）；queue「Q-055 落实」节 G6；T73a 结论 = **P1 路**（profile 级 `enabled:true`，`receipts/T73a.receipt.md` 结论表）
> 原版锚：`work/grok-0.79.3-re/RE-CONNECTOR-GRANT-0.78.1.md` §1.2（per-bot 无用户挑选）、§3（个人 bot 无「装上等挑选」中间态，建 bot 只有名字 + 形状）、§5-1。1.1.0 复核：MIGRATION-DELTA §2 连接器 / grant 行（`always_this_bot` 默认逐字同，锚有效）
> 分支 / 作业目录：feat/T73d @ /tmp/bot-wt/T73d
> claimed：
> accepted：

## 目标
Connect（装上）一个连接器 = 所有 bot（新的、已有的）下一轮都能用它的工具，准入交给 T73b/T73c 的用时审批卡；建 bot 对话框和市场里再没有「挑连接器给 bot」这一步。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（:191 T73b 那条：e2e 必设 PBOTS_DATA_DIR；`$events` 应答用 `connect({interactions:'answer'})`）
2. `receipts/T73a.receipt.md`（P1 四格 + P3 坏包半径 0 + P4 `pluginManager/setBundleEnabled{name,enabled}` 热撤；探针脚本 `work/ui-borders-connect/evidence/T73a/`）
3. `done/T73c-approval-card-ui.md` 与 `tests/e2e/t73c-connector-grant.spec.ts`（本单 e2e 照它的起法，只把建 bot 路径换掉）

## 改动面（经理 2026-11-16 @251ebf1d 核过行号）
1. **M1 守卫翻转**：`ui/main/m1-api/index.ts:185-194` installBundle 现强制 `enabled === false` → 改为强制 `enabled === true`（仍是唯一合法形，别的值 / 缺 options 一律 invalid；报错文案随改）。`:293` m1Installs 注释同改。**不新增白名单方法**（setBundleEnabled 不进 M1，迁移在 main 侧直调 dsh）。
2. **renderer 发 true**：`overrides/modules/market-store.ts:6`、`:171` 注释、`:179` `enabled: false` → `true`。
3. **老安装迁移**（main 侧，一次一处）：`ui/main/index.ts:166`「dsh connected … running preset restore」处，每次 dsh 连上后跑一个幂等函数：`pluginManager/listBundles` → 对每个 `enabled === false` 的 bundle 调 `pluginManager/setBundleEnabled {name, enabled:true}`。listBundles 失败 / 单个 set 失败：记日志、继续别的、**不阻塞 restore**。函数放一个新小文件（如 `main/m3-meta/enable-installed.ts`），可单测。
   - 理由：我们从没有过「用户关掉」的入口（只有 Remove），现存 `enabled:false` 全是旧策略产物。`ponytail:` 注释写明：将来做账号级关闭开关（原版 `setGrokConnectorEnabled`，queue 提议）时，这个迁移要改成只跑一次（加标记），否则会把用户关掉的重新打开。
   - 安全面：装上即在 dsh 激活（MCP 进程起），工具调用仍一律走 T73b 门 → 出卡（无 standing grant 不放行）。本单**不得**改 `sdk/src/policy/shell-ask.mjs` 与 standing-grants 任何逻辑。
4. **删建 bot 连接器栏**：`overrides/modules/new-bot-dialog.tsx` 删 `checked` state（:87）、`missing`/`effective`/`toggle`（:124-127）、Connectors fieldset（:190-225）、`data-missing-note`、`init.connectors` 对 `<details open>` 的影响（:177）；`createBot` 的 `connectors` 恒传 `[]`（shim `data.ts:861` 空数组走 `session/create`，即 T73a P1(c) 的「无勾选新 bot」路径）。`loadBundles`/`bundles` 若只为这一栏服务就一起删（submit 里 `bundles === null` 的门随删）。init 类型里的 `connectors` 字段删。
5. **删市场「New bot with this app」**：`overrides/modules/market-surface.tsx` Detail 的 `onNewWith` 参数与 `:123` 按钮、`:129` 那句「…until you pick it when creating one.」整句删、`:224-226` `newWith`、`:255` Installed 行尾「New bot」钮；`:254` subtitle 兜底 `'Pick it when you create a bot'` → 无描述就不给 subtitle。
6. **bot 设置连接器行**：`overrides/modules/agent-settings.tsx:116-119`（`data-pane-connectors`）——P1 后新 bot 的 recipe connectors 恒空，这行会显示「None」而实际全部可用（说谎）。原版无 per-bot 连接器视图（RE §1.2）→ **删行**；`:20 connectors: config.connectors` 若无别的消费者随删。
7. **老 bot 不迁移**：bots.json 里已有 p2temp recipe 的 bot 照旧恢复（T73a P1(d)：与 profile 级并存无重复行）。不碰 `m3-meta/orchestrate.ts` / `restore.ts` / `sdk/src/p2temp/`。

## 边界
1. 只动：上面 1-6 列出的文件 + 新迁移小文件 + 测试（`tests/unit/m1/api.test.ts`、迁移单测、下列 e2e 的断言改写、新 spec）。超出就停，写回执存疑项。
2. 先写失败测试（都要先跑红贴输出）：
   - `tests/unit/m1/api.test.ts`：`enabled:true` 放行、`enabled:false` / 缺 options / `enabled:'true'` 拒——现状下第一格红。
   - 迁移单测（fake dsh）：[a:false, b:true] → set 只调 a 一次；listBundles 失败 → 不抛、零 set；a 的 set 失败 → 仍对 c 调 set。
   - 新 e2e `tests/e2e/t73d-connector-global.spec.ts`（见验收 3），先在未改代码上跑红。
3. 现有断言 `enabled === false` 的测试（经理 grep：`tests/unit/m1/api.test.ts`、`tests/unit/admin/operations.test.ts`、`tests/e2e/{market,d1,settings,restore}.spec.ts`、`tests/e2e/journeys/{d4-d5-d6-journey,d10b-d7}.spec.ts`）：**逐个看语义**再改——断言「main 收到 enabled===false」的改 true；断言「建 bot 勾连接器」的流程改成「装上 → 无勾选建 bot → 工具可用」；admin/operations 若是 admin 面独立路径与本单无关就别动并在回执说明。**不许删格凑绿**；删格要在回执逐条写理由。
4. 测试隔离 HOME / TMPDIR，`DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent`，e2e 带 `PBOTS_DATA_DIR`。改了 main/renderer 先 `pnpm build` 再跑 e2e（LEARNINGS:59）。
5. 凭证不进代码、文档、日志。

## 验收（写命令，不写感觉）
1. `cd app/ui && pnpm exec vitest run tests/unit/m1/api.test.ts <迁移单测路径> --config.verify-deps-before-run=false` → 全 passed；回执贴改前红输出。
2. `grep -rn "pick it when\|Pick it when\|New bot with this app\|data-connectors\|data-pane-connectors\|newWith" app/ui/renderer-grok/overrides app/ui/main` → 无命中（注释也不留）。
3. `pnpm -C app/ui build && pnpm -C app/ui test:e2e tests/e2e/t73d-connector-global.spec.ts` → 全 passed，无 skip。spec 至少三格（真 Electron + 真 SDK runtime，fake 模型脚本**一次 writeScriptCalls 灌完整段**，每轮用本轮唯一标记——LEARNINGS:65/:212）：
   - ① 经 UI 市场 Connect 一个预置包 → `__pbotsM1.installs` 末条 `enabled === true`；建 bot 对话框里 `[data-connectors]` 计数 0。
   - ② **对话框建一个无勾选新 bot**，fake 脚本发该连接器的 `mcp__<server>__*` 调用 → **出 T73c 连接器审批卡**；点 Always allow → `<PBOTS_DATA_DIR>/standing-grants.json` 有这个 bot×server；下一轮同调用不出卡。
   - ③ **Connect 之前就建好的 bot**（先建 bot、再 Connect）下一轮同调用也出卡（= 热生效；T73a P1(a)）。
4. 迁移真链路：`app/ui/tests/e2e/restore.spec.ts`（或新 spec 一格）——预先以 `enabled:false` 装一个包（直打 dsh，仿旧版），启动 app → 无勾选 bot 能拿到它的工具（出卡即算）。
5. 回归：`pnpm -C app/ui test:e2e tests/e2e/t73c-connector-grant.spec.ts tests/e2e/market.spec.ts tests/e2e/journeys/d4-d5-d6-journey.spec.ts tests/e2e/restore.spec.ts` → 与 main 同口径（回执贴两边结果，基线已红的格写明）。
6. 截图（亮 / 暗各一）：建 bot 对话框展开 More options（只剩 Preset + Model）、市场连接器详情页（无 New bot 钮）、Installed 列表；对照 0.78.1 建 bot 对话框只有名字 + 形状（RE §3）。存 `work/ui-borders-connect/evidence/T73d/`。
7. 改动行覆盖 ≥80%（迁移函数 + M1 守卫）：`pnpm exec vitest run --coverage <两测试> --config.verify-deps-before-run=false`，回执贴两文件行覆盖。

## 为什么这样验收
- 要保住两件事：**装上就全局可用**（②③：无勾选的新 bot 和装之前就有的 bot 都拿得到），**放开之后准入一点没松**（② 必须出卡、Always allow 才落盘；本单不碰 shell-ask / grants）。只看「按钮没了」会漏掉「其实 bot 拿不到工具」或「拿到了但没出卡」这两种真失败。
- 迁移格防「升级后老用户装过的连接器全部失灵」——旧安装都是 enabled:false，不迁移就是静默回退。
- 守卫仍是「唯一合法形」，不是放宽成任意值：防 renderer 漂回 false 却没人发现（D5 那条 tap 断言本来就为这个）。

## 审查点名（派 reviewer 时带上，本单单独一批）
授权能否无卡产生（装上后首调用是否一定出卡）；迁移是否会在 restore 闸门前 / 期间阻塞或改变 restore 结果；M1 守卫是否还有别的值能过；删栏后 shim createBot 是否在任何路径仍走 createWithConnectors 空数组（会被 orchestrate 拒）。

## 产出
- 改：`ui/main/m1-api/index.ts`、`ui/main/index.ts`（一处调用）、`overrides/modules/{market-store.ts,market-surface.tsx,new-bot-dialog.tsx,agent-settings.tsx}`
- 新：`ui/main/m3-meta/enable-installed.ts`（名可改）+ 单测、`tests/e2e/t73d-connector-global.spec.ts`、evidence 截图
- `receipts/T73d.receipt.md`
