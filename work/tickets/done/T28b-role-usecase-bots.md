# T28b：选了 role 后，hand-off 在主 bot 之后串行自动建该 role 的前 2 个模板 bot（42 模板数据入仓）

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：queue U8b；T28 探针（done/T28 :18/:24）；Q-033 第 2 点（默认「开」）；本单「探针结论」（经理 2026-11-07 重读 0.79.3 产物）
> 分支 / 作业目录：feat/T28b @ /tmp/bot-wt/T28b（从 docs/rebuild-p6-p5-plan 含本单的那个提交起）
> claimed：2026-11-07 main (GLM 5.3) @ feat/T28b（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：2026-11-07 manager (Opus 5.5) @ feat/T28b 11d205fd（核实记录见 receipts/T28b.md「经理验收」节；遗留一处潜伏的控制流回退，已开修复单 T28bb，不阻塞合并）

## 目标
引导里选了 role 的用户，走完 hand-off 后除了主 bot，还会多出该 role 的前 2 个模板 bot（名字是模板名，各自做自我介绍，介绍里带模板职责和 role 设定句），主 bot 不变。和 0.79.3 一致。

## 探针结论（经理已跑，施工不用重跑）
产物：`/tmp/grokbot-0.79.3/extracted/dist/renderer/assets/`。

**时序**（index.eager-app @4541941，`odr` 里的 `w`/`C`/`S`）：
```
w: provision 主 bot（createAgentFromTemplate）→ markOnboardingSeen() → kickstartAwaitingFirstMessage(主 bot)
   → await C(e)：roleUseCaseBots 非空且 isEnabled 时 → S：for 每个 bot { createAgent(n); kickstartAwaitingFirstMessage(新 id) }
```
- 严格串行：主 bot 先介绍，然后建第 1 个模板 bot、让它介绍，再建第 2 个、让它介绍。每一步都 await。
- 模板 bot 失败（任一步 reject）就结束循环，`ports.fail({stage:'role-use-case-bots'})`，不影响主 bot。进入主界面（`x(e)` → `enterShell`）不等模板 bot 建完，它们在后台建。
- 每一步之前都检查账号槽位有没有变。我们只有一个账号，不做这个检查。

**请求体**（chunk-onboarding-flow @18115 的 `Nt`；`Mt`=creatorContext；`Me` @5227）：
```js
Me(role.id, 2).map(t => ({ name: t.name, description: [t.description, creatorContext].filter(s => s !== '').join(' '),
  origin: 'user', isKickstartRequested: true, isAutomatic: true, templateId: t.id }))
function Me(e, n) { return je.filter(({ roles }) => roles.includes(e)).slice(0, n) }
```
- `origin:de`，de 解析为 index.eager-app 的 `Xu='user'`。**和主 bot 的 hand-off 走同一个 `origin:'user'` 通道，不需要新的 origin 分支**（queue U8b 原写的「新增 origin 分支」作废）。
- 走的是普通 `roster.createAgent`，**不是** createAgentFromTemplate。**不传 avatarShape 和 avatarColor**，形象用默认值。
- 只有选了 role 才建（`P && me != null`），没选 role 时 roleUseCaseBots 为 null。还受实验开关 `onboardingRoleUseCaseBotsEnabled`（lde @280848）控制，我们按 Q-033 默认「开」写死，不做开关。

**排序与 18 条**：`je` 里 42 条，每条的 `roles` 都只有一个元素（全文 42 个 `roles:[…]` 里没有一个带逗号）。「前 2」指 `je` 数组里的原始顺序，不另排序。extract 的 templates 和 je 逐条对过：id、nameId、descId、role、顺序 42/42 全等；name 和 description 与 i18n-en.json 也逐条全等。9 个 role 各取前 2 条，共 18 条：
| role | 第 1 条 | 第 2 条 |
|---|---|---|
| engineering | bug-reproduction「Bug Reproduction」 | product-performance「Product Performance」 |
| design | figma-bot「Figma Bot」 | motion-help「Motion Help」 |
| marketing | paid-media「Paid Media」 | competitive-intelligence「Competitive Intelligence Analyst」 |
| customer-support | account-health「Account Health」 | account-manager「Account Manager」 |
| product | beta-adoption-watcher「Beta Adoption Watcher」 | call-faq-miner「Call FAQ Miner」 |
| ops-finance | expense-manager「Expense Manager」 | contract-desk「Contract Desk」 |
| recruiting-people | talent-scout「Talent Scout」 | calendar-coordinator「Calendar Coordinator」 |
| sales | sales-outbound「Sales Outbound」 | account-research「Account Research Specialist」 |
| productivity | chief-of-staff-readout「Chief of Staff」 | daily-briefing-writer「Daily Briefing Writer」 |

**我们现状**（docs/rebuild-p6-p5-plan @c03b55b3）：
- shim `data.ts:530` 的 `origin==='user' && isKickstartRequested` 分支，模板 bot 的请求本来就会进这里。会出问题的有三处：
  1. **:548 `pendingKickstart` 只有一个槽**，后登记的会覆盖先登记的。另外 `finishKickstart()`（:687）不带 id，消费的是「最后一个」。
  2. **:544 只要 `mainBotId===null` 就把新建的 bot 设为主 bot**。正常流程里主 bot 先建、mainBotId 已经有值，不会出事；但主 bot 的 meta patch 失败时，第一个模板 bot 会被当成主 bot。
  3. **:548 介绍提示只带 setup，不带名字**，所以模板 bot 做介绍时不知道自己叫什么。
- `onboarding-view.tsx:50-70`：`devCall` 是 `void` 调用，不返回 promise；`finish()` 里 `reloadRoster()` 和 `finishKickstart()` 都是发出去就不管。**有竞态**：`doLoadRoster`（data.ts:337）拿 list 快照后会整体替换 `summaries`/`order`。如果模板 bot 的 `session/create` 在这份快照之后才完成，新 bot 会从侧栏消失。所以开始建模板 bot 之前必须先 await reloadRoster。
- isAutomatic 和 templateId 在我们这边没有任何地方用到。shim 只拿 templateId 做「不设为主 bot」的判定，**不持久化**，isAutomatic 直接忽略。

## 范围
1. **数据入仓**：新建 `overrides/modules/onboarding-templates-0793.ts`，`export const TEMPLATES` 共 42 条 `{ id, role, name, description }`，顺序和内容照 extract（nameId/descId 不要）。文件头写 `来源: grok-bot 0.79.3 chunk-onboarding-flow-D-TfK2Rr.js je@1392 + i18n-en.json（经 work/grok-0.79.3-re/onboarding-0793-extract.json）`
2. **纯函数**放进 `onboarding-walk.ts`：`roleUseCaseBots(roleId: string | null)`。roleId 为 null 时返回 `[]`；否则取 TEMPLATES 里 role 等于它的前 2 条，映射成 `{ origin:'user', isKickstartRequested:true, isAutomatic:true, templateId, name, description: [desc, creatorContext(roleId)].filter(nonEmpty).join(' ') }`
3. **shim `data.ts`**（只改 :530 分支和 finishKickstart）：
   - `pendingKickstart` 改成 `Map<sid, prompt>`。`finishKickstart(sid: string)` 只消费这个 sid 的提示，没有就什么也不做（相当于 0.79.3 的 `kickstartAwaitingFirstMessage(agentId)`）。DevSurface 类型签名跟着改
   - :544 的条件加一项：请求里带 `templateId`（字符串）时，不 patch mainBotId
   - :548 改为 `kickstartPrompt({ name: name !== '' ? name : undefined, setup })`。主 bot 的默认名是空串，提示文本不变
4. **onboarding-view 的完成链**：`devCall` 改为返回 promise、接收参数。Walk 调 `finish(agentId, roleId)`。`SignedInOnboarding.finish` 保持现在的先后顺序：先发起 `reloadRoster()` 并拿住它的 promise，再同步调 `onComplete`（进主界面不等模板 bot，0.79.3 的语义）。之后在后台串行：`await` 刚才那个 reloadRoster promise → `await finishKickstart(主 bot)` → 对 `roleUseCaseBots(roleId)` 的每一条：`await client.call('createAgent', req)`，取回 id，再 `await finishKickstart(id)`。任一步抛错就停止循环，`console.warn('[onboarding] role-use-case-bots', err)`。0.79.3 的 fail 在进入主界面后用户也看不到，这里加一条 `ponytail:` 注释说明。Skip（agentId 为 null）和没选 role 这两种情况行为不变
5. 不做：模板浏览 UI（0.79.3 没有）；isAutomatic/templateId 持久化；账号槽位检查；模板 bot 的形象（不传，用默认）；description 的持久化（主 bot 也没有存，同口径）

## 边界
1. 只动：`renderer-grok/overrides/modules/onboarding-templates-0793.ts`（新建）、`onboarding-walk.ts`、`onboarding-view.tsx`（只改 devCall、finish、Walk 里调 finish 的那两处）、`renderer-grok/shim/src/data.ts`（只改 :141 声明、:530-551 分支、:687 finishKickstart 和对应的类型行），以及测试文件。**不改** `frontend/src/recovered/**`（上游零改动）、`onboarding-steps-0793.*`、`new-bot-dialog.tsx`、`scene.ts` 和编舞
2. **不撞 T32**：T32 以后改的是覆盖层 view 里的 SceneCast、beat、编舞，本单只改 finish 链。T32 立项时从 T28b 合并之后起
3. 先红：
   - `tests/unit/grok-shim/onboarding-walk.test.ts` 新增 ⑦：import `roleUseCaseBots`、`TEMPLATES`。符号还不存在，会红
   - 新建 `tests/unit/grok-shim/kickstart-queue.test.ts`（照 p5-w3f1 的 `createShimData` 用法，假 api 记录调用）：先建 A、再建 B，然后 `finishKickstart(A)`，断言发出的 prompt 是 A 的。现在的单槽实现会发成 B 的，所以红
4. 测试走隔离 HOME/TMPDIR，DBus 指向不存在路径；**load>10 时不跑 e2e**，`run_in_background` 跑一次等通知；ui e2e 同一时刻只跑一套；不跑全量 e2e

## 验收（命令在 `app/ui` 下执行）
1. `pnpm --config.verify-deps-before-run=false vitest run tests/unit/grok-shim/onboarding-walk.test.ts tests/unit/grok-shim/kickstart-queue.test.ts` → 全 passed，其中：
   - **数据对照**：读 `../../work/grok-0.79.3-re/onboarding-0793-extract.json`，`TEMPLATES` 与 `templates` 映射成 `{id,role,name,description}` 后 **toEqual**（42 条，顺序一致）。不要手抄期望值
   - `roleUseCaseBots('engineering')` **toEqual** 两条完整请求体，第 1 条 description 逐字等于 `Repros the bug in staging and drops a pack with steps and screenshots The user primarily works in Engineering — tailor suggestions and work to that area.`
   - 9 个 role 各调一次：每个 role 返回 2 条，它们是 extract 里该 role 的前两条（按 extract 顺序算出来，不要手抄）；templateId 合起来 18 个、互不相同；`roleUseCaseBots(null)` toEqual `[]`
   - kickstart-queue：(a) A、B 都登记后，`finishKickstart(A)` 只发 A 的提示，`finishKickstart(B)` 只发 B 的，对同一个 sid 再调一次不发；(b) 带 `name:'Bug Reproduction'` 的请求，提示里含 `Your name is Bug Reproduction.`；name 为空串时不含 `Your name is`；(c) mainBotId 为 null 时，带 templateId 的请求**不发** meta patch，mainBotId 仍为 null；不带 templateId 的请求照旧 patch
2. `HOME=/tmp/bot-T28bh TMPDIR=/tmp/bot-T28bt DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/onboarding.spec.ts` → 全 passed，其中：
   - **④ 改断言**（流程不变，选 Engineering）：`.sand-agent-item` 由恰 1 改为恰 **3**；侧栏里能看到「Bug Reproduction」和「Product Performance」；`window.__pbotsDev.state` 里，`order` 的前三项依次是主 bot、bug-reproduction 对应的 bot、product-performance 对应的 bot，`meta.mainBotId` 等于主 bot（标题为空，不是两个模板名之一）；`requests.jsonl` 里 `bot_introduction_request` 出现 ≥3 次，并且含 `Your name is Bug Reproduction.`、`Your name is Product Performance.`、`Repros the bug in staging and drops a pack with steps and screenshots The user primarily works in Engineering`。T28 原有的断言（250ms 窗内没有介绍、不出现 tools/create、主 bot 带 creatorContext）全部保留
   - **⑥ 全 Skip**：仍然恰 1 个 bot，requests 不含 `Your name is`。这是本单的反向保护：没选 role 就不建模板 bot
   - ①②③⑤ 原断言不变（⑤ 不走到 hand-off，不受影响）
3. 回归：`vitest run tests/unit/grok-shim` 的 passed 数 = 施工前基线（回执贴出基线）+ 新增格数，全部 passed；`test:e2e tests/e2e/kickstart.spec.ts tests/e2e/bots.spec.ts` 的 passed 数与基线相同。这两份 spec 走的是 createBot / finishKickstart 相邻路径，用来防止新建 bot 对话框的介绍回归
4. `pnpm -C renderer-grok check` → upstream diff=0
5. **变异五刀**（回执贴红的原样输出，还原后复绿）：V1 `slice(0,2)` 改成 `slice(0,3)` → 单测 ⑦ 红，e2e ④ 红在 count；V2 模板 description 去掉 creatorContext → 单测 ⑦ 红；V3 删掉 templateId 的「不设主 bot」判定 → kickstart-queue (c) 红；V4 finishKickstart 忽略 sid、取最后一个 → kickstart-queue (a) 红；V5 :548 不传 name → kickstart-queue (b) 红，e2e ④ 红在 `Your name is Bug Reproduction.`
6. 截图：④ 走完后的主界面侧栏（亮色一张），存 `work/grok-0.79.3-re/ours/onboarding-usecase-bots.light.png`。施工本人用 Read 打开，确认画面里有 3 个 bot、两个模板名。0.79.3 没有对应参照图，回执标「未对照」，不阻塞
7. 覆盖：工具链没有 coverage 插件。回执里手工列出 roleUseCaseBots、:530 分支新增的两个条件、finishKickstart、finish 链分别由哪一格覆盖，要求 ≥80%
8. `git diff <起点>..HEAD --stat` 只含边界 1 列出的文件

## 为什么这样验收
- 真正要保住的是：选了 Engineering 的用户走完引导，看到的是「一个主 bot + Bug Reproduction + Product Performance」，三个都知道自己是谁、做什么，而且主 bot 没被抢。所以 ④ 要同时断言侧栏、mainBotId、requests 里的名字和职责句。只看到「3 个 bot」不够，名字和介绍错了照样能过
- 数据对照和「前 2 条」的期望值都从 extract 算出来，不手抄。手抄只能证明「代码等于我抄的」
- kickstart-queue 单测守的是两个只在顺序错乱或失败路径上才暴露的坑：单槽覆盖，以及主 bot patch 失败时模板 bot 被当成主 bot。e2e 的正常流程碰不到这两种情况，所以必须单测钉住
- ⑥ 防止「没选 role 也建模板 bot」

## 存疑预记
- reloadRoster 和模板 bot 的 session/create 之间的竞态（见探针「现状」）靠 await 的顺序解决，变异很难稳定打红。审查时请重点看 finish 链有没有先 await reloadRoster
- 模板 bot 的介绍和主 bot 的介绍都通过 `mode:'queue'` 发到各自的会话，requests.jsonl 里的先后顺序取决于模型调度，所以 e2e 只断言出现了，不断言顺序。串行性由 `state.order` 的创建顺序和代码审查保证
- 用户如果对 Q-033 第 2 点回复「T28b 关」，只需要让 finish 链跳过模板 bot 循环（一行），数据和 shim 的修正照样保留

## 产出
- `app/ui/renderer-grok/overrides/modules/onboarding-templates-0793.ts`（新）、`onboarding-walk.ts`（加 roleUseCaseBots）、`onboarding-view.tsx`（finish 链）
- `app/ui/renderer-grok/shim/src/data.ts`（pendingKickstart 改 Map，加 templateId 判定，介绍带名字）
- `app/ui/tests/unit/grok-shim/onboarding-walk.test.ts`（加 ⑦）、`kickstart-queue.test.ts`（新）、`app/ui/tests/e2e/onboarding.spec.ts`（改 ④⑥ 的断言）
- 截图 1 张；回执 `work/tickets/receipts/T28b.receipt.md`
