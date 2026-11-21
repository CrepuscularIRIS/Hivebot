# T7bd 回执：视觉收口 + T26b 回归面（2026-11-07 19:3x）

提交：`05ef7e3d`（视觉+spec 修+截图归档）、`81e5aaa5`（dead-entries 修+注释清零）；提交① 导入修复 = `efa5c4ff`（前轮已落）。全程集成分支直接施工。

## 先红两处

### 先红①（导入修复）——前轮 efa5c4ff 已做，本轮未重复
工单现状 1 所述 `:96` 对话框 2 failed 由 efa5c4ff 修复；本轮验收 3 全绿佐证。

### 先红②（暗色 Add）——**不红，存疑项坐实（工单预判路径）**
```
删 t7b.css 暗色 Add 规则 → build exit=0 → t7b-shot：
  ✘（第一跑 Test timeout 60000ms——被 T26b 回归挡在 :23，非断言红）
  修环境后（waitProductReady）重跑：✓ 1 passed (5.4s)  ← 规则删除态仍绿 = 断言没咬住
探针（临时 console.log，跑完已删）：
  规则删除态：[data-action="skills-add"] color= rgb(245, 245, 245)  bg= rgb(250, 250, 250)
  规则在态  ：[data-action="skills-add"] color= rgb(18, 18, 18)     bg= rgb(250, 250, 250)
  skills-pick 两态：color= rgb(245, 245, 245)  bg= rgba(119, 119, 119, 0.173)
```
**结论**：规则生效（在态字色 rgb(18,18,18)）；断言 `expect(color).not.toBe(bg)` 守不住——删除态浅底浅字（245 vs 250）视觉不可读但两值不等 → 恒绿。断言取的元素没错、规则也生效，是**断言形式弱**。按工单指令停手不改断言（边界「对比度断言不动」），留给经理拍板（建议改亮度/对比度阈值断言，可让删除态必红）。

## 施工中撞出的 T26b 回归（边界外，已修 3 个）
T26b 改 gate（未 seen+空 roster 不建 main）后，裸 `launchShell` 的 spec 首启必进 onboarding、`.sand-agent-item` 恒 0（60s timeout，123×resolved 0）。修法统一：手写三行等待换 `waitProductReady`（ui.ts:75 既有兜底——置 seen+reloadRoster+等 agent，正是为裸 shell spec 写的）。
- skills-picker.spec.ts 两处（验收 3 要求绿，不修不可能过）
- t7b-shot.spec.ts 一处（先红②的前置）
- grok-dead-entries.spec.ts:110 一处（验收 4 撞出）
**未扫（留给经理开清扫单）**：grok-persona / grok-shim / ws-write / questions-answer / m2-deadline / m2-port / restore / skills-enable / shell/{cold-start,single-instance,load-abort,origin-gate}（后四件可能只测启动不等 roster，未逐个验证）。
另：U4′ 行菜单期望清单补 `'Show full conversation'`（T21 加的活入口，清单过时非死入口）。

## 验收 1–9 原样输出
```
1  git status --short app/ui → 空；HEAD=05ef7e3d（19:29:27，后追加收尾提交见文末）
2  pnpm build → exit 0；产物 index-C3Rta71B.js 19:29:37 > HEAD 提交 19:29:27 ✓
3  run-e2e.sh skills-picker.spec.ts t7b-shot.spec.ts → 3 passed (12.8s)
   （收尾提交后终跑复验：build exit=0 → 3 passed (12.1s)，四张截图重归档）
4  run-e2e.sh settings.spec.ts grok-dead-entries.spec.ts → 3 passed (1.4m)
   （首跑 dead-entries 红两处：①T26b 裸 shell 回归 ②U4′ 清单缺 T21 项——均已修见上）
5  renderer-grok pnpm check → upstream diff=0: 332 files
6  grep -c SandIconButton skills-dialog.tsx → 2；style={{ /#121212/#fff grep → 空（注释字面已改写）；
   产物 grep SandIconButton → 0（minify 改名；功能存在由验收 3 证实——比字面 grep 强，如实记）
7  四张 ref/skills-{added,pick}.{light,dark}.png 重归档自最终 HEAD 构建
8  改动面（9d9ce518/efa5c4ff 基准已隔 276 提交含 blob 剥离，按单提交口径）：
   05ef7e3d：skills-dialog.tsx / t7b.css / skills-picker.spec / t7b-shot.spec / ref 四图（8 files, +9 -26）
   收尾提交：grok-dead-entries.spec / t7b.css 注释 / LEARNINGS
9  pgrep bot-T7bd → 空；$T/tmp 非 cache 残留 → 0
```

## 视觉项落点
- 内联 style 挪 `t7b.css` `.pb-skills-dialog > div`（`var(--sand-bg-elevated)` 无白色兜底、radius 12、shadow 同原值）
- 暗色 Add `#121212` → `var(--sand-text-inverted)`（探针证 rgb(18,18,18) 同值）
- `[data-action="skills-pick"] { color: inherit !important; }` 删（工单字面判据：删除断言仍绿——探针显示删陮 color 不变 rgb(245,245,245)，规则本就无效果）
- t7b-shot 死代码删（shot 函数 / void shot / readFileSync+existsSync 导入）

## 截图逐张（ref/，最终 HEAD 构建）
- skills-pick.light：对话框白底、t7b-flow 行（名/来源 T7b-A/描述分开）、Add 可读深字、× 图标钮
- skills-pick.dark：暗色底非白、Add 深字可读（rgb(18,18,18)）、勾选态
- skills-added.light：Add 后 pane 行 t7b-flow 出现、Pick/Remove 可读
- skills-added.dark：同上暗色
（经理可 Read 目检四张）

## 存疑（经理拍板）
1. 对比度断言 `not.toBe` 恒绿（见先红②）——建议换亮度阈值断言；改它超出本单边界，未动
2. 产物 grep SandIconButton=0（minify 改名）——验收 6 第三条按字面不满足，功能证据以 e2e 为准
3. 裸 launchShell spec 清扫单（12 个待扫清单见上）——建议开 T7be 或并入 T8 e2e 收口
