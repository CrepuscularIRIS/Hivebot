# T74：会话气泡宽度塌陷（短回复竖排成一列字）

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：work/ui-borders-connect/BRIEF.md 2026-11-12「UI 系统性修复」；立项取证 work/ui-quality/PLAN.md 主题 L
> 分支 / 作业目录：feat/T74 @ /tmp/bot-wt/T74
> claimed：2026-11-12 main (GLM 5.3) @ feat/T74=ade7a347
> accepted：2026-11-12 manager (Opus 5.5) 终验 @ feat/T74=e45d0e5d

## 目标
agent / user 气泡按「内容宽，封顶 min(80%, 560px, 100% − 82px)」排版；修掉 agent 短回复「done」被压成 24px 宽、一字一行竖排的缺陷。

## 根因（经理取证，`work/ui-quality/evidence/tour/probe2.json` bubbleChain）
父链实测：`.sand-message-action-anchor` w=55（`recovered/.../workspace/view.css:128` `width: fit-content`）→ 气泡 div w=24、`max-width: min(80%, 560px, 100% - 82px)`（`overrides/p5-55-layout.css:189`，T68 加的）→ prose w=0。
百分比 max-width 落在一个 fit-content 的父上 = 循环依赖，Chromium 按父的初始收缩宽解，内容越短越窄。长回复因 max-content 大才「看起来对」（T68b 的 555~561 只测了长回复）。user 侧同病（800 宽窗下「Hello, give me a sample reply」折成 5 行，`info-pane.light.png`）。
修法方向：封顶放在**宽度确定的那一层**（anchor 或 row；参照 `p5-55-layout.css:212` user 侧已把 max-width 放 anchor 的写法），气泡本身 `max-width:100%`；不要再在 fit-content 父里用百分比。一处定根，agent / user 共用。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（T48 toBeVisible / T58「比字不只比框」两条）
2. `overrides/p5-55-layout.css:168-215`、`recovered/features/conversation/workspace/view.css:128-131`（hover 动作钮依赖 anchor 的 position:relative，别弄丢）
3. 规格锚：`work/grok-0.79.3-re/RE-BORDERS-0.78.1.md` §5 气泡几何；参照图 `work/grok-0.79.3-re/ref/conv-done.light.png`（短回复一行、气泡贴内容宽）
4. 现有 `app/ui/tests/e2e/t68-message-tokens.spec.ts`（长回复气泡宽断言，必须仍绿）

## 边界
1. 只动：`app/ui/renderer-grok/overrides/p5-55-layout.css`（气泡 / anchor 那几行）；必要时 `recovered/.../workspace/view.css:128` 一行。新增 `app/ui/tests/e2e/t74-bubble-width.spec.ts`。别的不碰。
2. 先写失败测试：t74 spec 的「短回复单行」格先在当前主线跑红（经理实测当前 w=24）。
3. 测试走隔离 HOME / TMPDIR，DBus 死总线（run-e2e.sh 已带）；不跑全量 e2e。
4. 只在 feat/T74 提交。

## 验收（写命令，不写感觉）
1. `cd app/ui && pnpm build && sh scripts/run-e2e.sh tests/e2e/t74-bubble-width.spec.ts` → passed。spec 至少四格（DPR=2、亮暗各一次）：
   - agent 回复 `done`：气泡高 ≤ 行高 + 上下 padding + 2（=单行），气泡宽 ≥ 文本 range 宽 + 左右 padding − 1；
   - user 消息 `Hello, give me a sample reply`、窗口 800 宽开 info pane（经理复现条件）：单行；
   - agent 长回复（复用 t68 的 LONG_REPLY）：气泡宽 = min(80% 容器, 560, 容器 − 82) ±2；
   - hover agent 气泡：「More message actions」钮可见（anchor 的 relative 定位没丢）。
2. `sh scripts/run-e2e.sh tests/e2e/t68-message-tokens.spec.ts tests/e2e/t67-composer-frame.spec.ts` → 全 passed（回归）。
3. 截图落 `work/ui-quality/evidence/T74/{short,user-narrow,long}.{light,dark}.png`，回执写每张该确认什么；经理任务 B 亲看。

## 为什么这样验收
要保住的是「用户看到的气泡跟原版一样贴着内容」，不是某个 CSS 值。经理复现的两个条件（短回复、窄聊天列）都要进 spec，否则又会出现 T68b 那种只测长回复、短回复照坏的假绿。hover 钮格防「修宽度把动作钮定位修没了」。

## 产出
- `overrides/p5-55-layout.css`（及至多一行 view.css）
- `app/ui/tests/e2e/t74-bubble-width.spec.ts`
- `work/ui-quality/evidence/T74/*.png`、`work/tickets/receipts/T74.receipt.md`

## 经理验收（任务 B，2026-11-12）：返修
- 亲跑：`run-e2e.sh tests/e2e/t74-bubble-width.spec.ts` → **1 passed (6.3s)**；抽查回归 t68 → **1 passed (6.6s)**。改动范围 d8669f67..b59cf0dd 三文件（p5-55-layout.css / t74 spec / t68 探针一处），符合边界。
- 核实 user 侧根因与修法：一致。b59cf0dd 给 user anchor `width:100%`（定宽断循环），气泡自持 `min(80%,560px)`。截图 user-narrow.light/dark：「Hello, give me a sample reply」两行完整无碎断；short.light：done 单行不塌。user 侧通过。
- **不通过的点（证据）**：`work/ui-quality/evidence/T74/user-narrow.dark.png` 里窄窗 agent 长回复「The border system uses four translu-cent hairline…」被压成约 70px 宽、一词一行——正是本单要修的塌陷。agent 侧仍是回执自己判定为循环的结构（anchor 不定宽、只有 max-width；气泡 `max-width:100%`），user 侧修了、agent 侧没跟。spec 的窄窗长回复格只断言上界 `width ≤ colW+2`，塌成 1px 也绿，是空转。
- 返修项：
  1. agent 侧同法断循环（anchor 定宽或等效），保留 agent 封顶 min(80%,560,calc(100%−82))。
  2. spec 窄窗长回复格补下界：等流式结束（Stop 消失）后断言气泡宽 ≈ 封顶值 ±2；暗色同断言。
  3. 补拍 user-narrow.dark.png（含长回复定稿态），亲检无一词一行。
  4. 说明 user 侧去掉 −82 是对 RE-BORDERS §5「user 侧同值」的有意偏离（窄窗 hover 钮是否压气泡）——回执写一行取舍，宽屏下 560 封顶生效、−82 不起作用。
- 旁见（不在本单）：窄窗下「回复失败…」错误行折行居中且与时间戳「9:24 PM」重叠——提议进 T79 巡检清单；spec 的 fake 脚本游标没对齐（no scripted call #1）也顺手修，免得截图里出错误行。

## 终验（manager Opus 5.5，2026-11-12）——通过
- 提交链：ade7a347 → b59cf0dd → e4b22686（agent 侧同 user 法+撤 −82）→ e45d0e5d（Sol 复审中①：assistant 气泡 width:fit-content）；工作区干净。改动只 p5-55-layout.css 三处 + t74 spec + t68 探针，范围内。
- 亲跑：`t74-bubble-width.spec.ts` → **1 passed (6.5s)**；回归 `t67-composer-frame + t68-message-tokens` → **2 passed (18.3s)**。截图为本次亲跑重生成（21:42）。
- 亲检：user-narrow.dark——窄窗长回复 ~122px 宽（≈row 80%），每行 2～3 词正常换行，上轮 70px 一词一行已消失；short.light——「done」单行、气泡贴内容（~55px），无空宽大泡；user-narrow.light——user「Hello, give me a sample reply」两行、贴右，不碎。宽屏 long.light 气泡 ≈518（80% 列宽），封顶生效。
- 可见副作用（接受）：hover「…」钮从行最右移到气泡右下沿（anchor 现 80% 定宽），t68 探针已随之改；与原版消息动作挂气泡的形态一致，不返修。
- 遗留（不挡本单，交 T79 / 施工顺手）：①spec 第②格 `writeScriptCalls` 只给 1 条，游标漂移仍出「no scripted call #1」错误行（返修时只铺满了第③格）；②第③格 `hasText:'hairline'.last()` 在「long please」渲染前就命中上一条窄窗长回复——量的是旧气泡在宽屏下的封顶，几何仍有效，但截图里没有「long please」那轮；③错误行与时间戳重叠（已登记 T79，修前 HEAD 截图同样存在，非本单引入）。
