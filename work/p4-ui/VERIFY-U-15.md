# VERIFY-U-15 · 临时最小页面跑通 D1（W1 收官）

verdict: **PASS**
commit: 39f412e44d525151e01b44502a9d1a0534a45020（feat/U-15，3 commits：89ad613 → f88a0c5 → 39f412e，base 3b71577）
验收时间：2026-11-02 13:46–13:57（复跑两次结论一致）· 验收员：GLM verifier

## 验收项

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ④ 全量复跑（build + 单测 + e2e，HOME 隔离） | PASS | `evidence/U-15/full-rerun.out`：`pnpm build` ✓（426ms）；`vitest run` **153/153**（16 文件）；`playwright test` **19/19**（49s）。第一次手跑同绿（13:46–13:48）。HOME=/tmp/bot-u15-verify 与 /tmp/vfy-u15-mut 隔离。与 builder 最终申报（LOG 13.5x「153 单测+19 e2e」）一致；commit 信息里的 145/18 为 rebase 前旧数，不影响 |
| ① dev-min 临时页面 | PASS | 源码 4 文件（`renderer/dev-min/{app,carrier,mux,reduce}.tsx/ts`）：preset 下拉（`agentPresets/list` 重试兜底 + 默认项）、连接器勾选（仅 installed，经 #4）、`#composer` 输入 + 发送（#7 `session/prompt`）、流式气泡 `.bubble.streaming` / 定稿 `.bubble.assistant.final`。截图三张（真 Electron 页面，非全屏）：`evidence/U-15/d1-phase1-gated.png`（gate 挂起：灰底流式气泡「验收-第一段」，无定稿气泡，左栏 bot 行 p2-alpha·运行中）、`d1-phase2-growing.png`（增长至第三段）、`d1-phase3-final.png`（定稿气泡全文五段，流式消失）——三张均经视觉确认内容为 dev-min 界面本身 |
| ③ D1 端到端语义 | PASS | d1.spec.ts 断言逐条核对：gate 挂起期 `.bubble.assistant.final` count===0（:84）；放行后 growth≥4（初值+≥3 步，:148）；定稿替换 streaming===null 且全文相等（:151-153）；`agentPreset` 精确等值——`__pbotsDev.bots` preset 排序 `toEqual(['p2-alpha','p2-beta'])` + DOM `data-preset` 属性（:166-169）；B bot bFinal≥3（≥2 增量）+ chunkCount≥2 + turnEnded（:160-163）；③ 错 clientId → `pbots/forbidden`（message 含 clientId mismatch）且 boot 沉降取基线后 `__pbotsDsh.apiCount` 前后 ===（:213-227，真 runtime）。**亲跑**：全量 19/19 含 d1 三条；另用独立 detach worktree 跑自制同语义脚本（截图即其产物，断言 gate 期 finals===0、定稿文本逐字相等，输出 `VFY-D1-OK`） |
| ③ paceMs=0 变异红 | PASS | 独立 detach worktree（/tmp/vfy-U-15-mut，验收后已删）：`gatedCall paceMs 200→0` 后同测试红在正确断言上——`Expected: >=4, Received: 1`（d1.spec:148，无中间态可采）；`git checkout` 还原后同测试复绿（6.6s）。增长断言非空洞 |
| ② 三桥接线 + 共享 ledger | PASS | `main/index.ts:141-143`：M3 先建 → `wrapM1WithOrchestration(registerM1Api({dsh}), dsh, m3.store)`（#4 路由进 M3 编排、解 `{request}` 壳、非 #4 原样走基座，wrapM1WithOrchestration :85-102）→ `restoreGated(ready, m1)`（U-14 闸门保持，M2 同）→ `registerM2Mux({dsh, ledger: m1Ledger})`。共享台账：m1-api/index.ts:129 `export const m1Ledger`、:137 默认即此实例；wire.test.ts 断言 `m2.ledger === m1Ledger` 且错 clientId 拒绝时 dsh.apiCount===0（HANDOFF-MED 落实）。观测面 `globalThis.__pbotsDsh`（:168，无新 IPC 通道）。#4 编排 e2e（真 runtime）：installBundle(enabled:false) 预装 → 勾选建 bot → bots.json recipe `[{agentPreset:'standard',connectors:['@p2sdk-fixture/demo-mcp']}]` 且 header 冻结 p2temp-id 与 recipe key 同值（d1.spec:229-277） |
| 壳形态终裁（步骤 2） | **裁定：builder 正确，且与 U-14 verifier 原文无实质分歧** | 见下节「壳形态终裁」 |
| 裁定 ④a：dev-min 自写最小消费端 | **裁定：可** | 见下节「裁定 ④a」 |
| 裁定 ④b：debug-boot 删除 + main.tsx 回收 | PASS | `renderer/carrier/debug-boot.ts` 删除（−152）；`renderer/main.tsx` 不再 import `installCarrierDebug`（U-12 加的 3 行已回收），改渲染 `<DevMinApp/>`；m2-port.spec 观察面 `__pbotsCarrier → __pbotsDev` 六条语义不动。**U-16 断言翻转确认（语境已变）**：main 已先合 U-16（9dd0c5f），U-15 成为后合并者——合并时须：a) `m2-deadline.spec.ts`（U-16 新增，引用 `__pbotsCarrier` 5+ 处）翻成 `__pbotsDev`；b) `m2-port.spec.ts` U-15 分支 :307 `expect(pendingAfter).toBe(true)` 保留 main 侧 U-16 已翻转的 `false`+新注释；c) 合并后按 LEARNINGS 立即全量回归（U-16 main 常驻 $events 与 U-15 dev-min boot $events 共存） |
| ⑥ 区域：18 文件清单 | PASS | `git diff --stat 3b71577..39f412e` 恰 18 文件 +1068/−209，全部在 `app/ui/`：main/{index,m1-api/index,m3-meta/orchestrate,m3-meta/restore} · renderer/{carrier/debug-boot(删), dev-min/×4, main.tsx} · tests/{e2e/d1(新), e2e/m2-port, e2e/shell/cold-start, unit/devmin/reduce(新), unit/m1/api, unit/m3/orchestrate, unit/m3/restore, unit/shell/wire(新)}。无越区 |

## 壳形态终裁（步骤 2）

**规则：wire 壳的 key 不是全局常量，必须逐方法等于其 descriptor 声明的参数名。**

- 源码依据（两层）：① gateway `assertExactArguments`（dsh-api-gateway/lib/index.js:1773-1790）要求 args 键集合 === descriptor 参数 wire 名——多出 → `unexpected "…"`、缺失 → `missing "…"`；参数名来自各方法实现签名（`methodParameterNames` :1748-1774）。② `p2temp/session.createWithConnectors(request)`（app/sdk/src/p2temp/index.mjs:166）→ 壳 key=`request`；`session/list(_request…)`（dsh-api-session-controller typert.host.js:2145 参数名 `_request`，jsDoc「reserved empty list request」）→ 壳 key=`_request`；`installBundle(spec, options)`（dsh-plugin-manager typert.host.js:712-731）→ 命名参数 `{spec, options}`。上游 examples/lib/client.mjs:43 注释同款佐证。
- 亲跑探针（真 p2sdk runtime，`evidence/U-15/probe-shell.mjs` + `probe-shell.out`）：
  - `#4 裸对象` → `gateway/arguments-invalid`；`#4 {request:…}` → **通过绑定、进到业务层**（`p2temp/connector-unavailable`，业务错非壳错）；`#4 {_request:…}` → `gateway/arguments-invalid`。#21 preset.ensure 同构。
  - `session/list {}` → missing `_request`；`{_request:{}}` → **OK**；`{request:{}}` → 拒。
  - `installBundle {spec, options:{enabled:false}}` → **OK**（真装、applied）。
- **结论**：builder 实现正确（orchestrate.ts:105-112 `{request:…}`、m1-api installBundle 命名参数）。U-14 verifier 的 VERIFY-U-14.md:12 原文本就写明「session/list 与 p2temp/*（`request`）的 typert 壳名不同」、:17 FIX 修复=包 `{request:…}` 壳——与 builder 一致；派发所述「分歧」系转述失真（LEARNINGS 已有对应条）。builder「两路实测通过」属实。
- CONTRACT 记档候选（转修订账）：① CONTRACT:32（#4 行）入参描述补「typert wire 壳 `{request:…}`」；② CONTRACT:43/59（installBundle）「`(spec, {enabled:false})`」「`args[1]`」措辞按命名参数 `{spec, options}` 修订（位置数组真 wire 被拒，m1-api:66-75 数组分支仅兼容保留）；③ SPIKE §5.2 的壳注记范围扩至 p2temp 两方法 + installBundle 命名参数。

## 裁定 ④a：dev-min 自写最小消费端（vs PLAN 字面「dsh ui-chat + ui-session 原样挂 carrier」）

**可。** 理由：SPIKE §1 明确 ui-conversation 的 runtime deps 级拉 workspace-controller（ui-workspace 深度绑定），并把它定为「W1 组装（U-21）二选一」的决策点——PLAN 捷径字面执行需现在就解这个绑定，等于替 U-21 预支决策。builder 自写 4 文件 ~483 行最小消费端（纯归约 reduce.ts + 最小 mux 客户端 + boot/会话 carrier + 单页面），达成任务真实目标（三桥端到端跑 D1），dev-min 显式标注 U-22 删除，不污染产品侧决策空间。代码头注释（含演化来源：debug-boot → mux.ts、spike PortMux 骨架）齐全。PLAN 措辞与实现的偏差已由 commit 正文如实申报——不算偏离，算 PLAN 捷径在 SPIKE 事实下的正确落地。

## 新问题（每条一行，可直接成为修复任务）

- [FIX] 合并 U-15 进新 main（9dd0c5f）时 m2-deadline.spec 仍引用已删除的 `__pbotsCarrier` | 复现：`git show 9dd0c5f:app/ui/tests/e2e/m2-deadline.spec.ts | grep __pbotsCarrier`（5+ 处） | 疑似位置：app/ui/tests/e2e/m2-deadline.spec.ts | 严重度 MEDIUM（合并即红，属合并工序非 U-15 缺陷）
- [FIX]（承接 U-14，仍未修，非本任务范围）M3 patch 分支 session/list 无壳真 runtime 必拒 | 复现：m3-meta/index.ts:85 `dsh.rpc('session/list', { cursor: null })`；U-15 全量绿证明 D1 链路不踩它 | 疑似位置：app/ui/main/m3-meta/index.ts:85 | 严重度 MEDIUM（U-21 主 bot 置顶依赖 patch；正确壳 `{_request:{}}` 已由本验收探针再证）
- [NOTE] dev-min 重载页面后不恢复已建 bot 会话（state.bots 内存态，无 re-follow）——临时页已知边界，产品侧行为归 U-21 ①（#9 列表 + 冷启动分支），无需修复
- [NOTE] builder commit 39f412e 信息中「145/145 unit，18/18 e2e」为 rebase 前旧数（最终申报口径 153/19 正确）——记档提醒 commit 信息与申报不同步，无功能影响

## 证据清单（evidence/U-15/）

- `probe-shell.mjs` / `probe-shell.out`——壳形态真 runtime 探针（9 组调用）
- `d1-phase1-gated.png` / `d1-phase2-growing.png` / `d1-phase3-final.png`（+同名 .jpg）——D1 三阶段截图，已逐张视觉确认
- `full-rerun.out`——build + 153 单测 + 19 e2e 复跑全文尾部
- 变异周期（paceMs=0 红 → 还原绿）与亲跑 D1 在独立 detach worktree 执行，验收后已删除，断言原文引用见上表
