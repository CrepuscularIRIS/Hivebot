# T78 · 原生控件泄漏 + 滚动条（ui-quality U5）

- claimed: 2026-11-15 主 agent（GLM 5.3）· 分支 feat/T78
- accepted: 2026-11-15 manager 任务 B @ feat/T78 5c361180（验收命令经理重跑 8/8 绿；Sol MEDIUM 返修到位；验收口径更正：「宽差 0（overlay 不占位）」→「溢出后占位恰 8px」——0.78.1 无 overlay 开关，见主仓 done/ 同名单）
- 来源: work/ui-quality/PLAN.md U5 行（经理 2026-11-12 立项拆单）
- 1.1.0 基线核查: 滚动跟随判定逐字同（MIGRATION-DELTA §2）；onboarding footer 按钮 kit 结构在 0.78.1 取证（本单锚），1.1.0 未改动此面——锚有效。

## 范围

1. **onboarding 裸按钮 → kit SandButton**（6 处）：
   - `onboarding-view.tsx` Landing：Get started（primary）/ Skip（secondary）
   - `onboarding-steps-0793.tsx` Foot：主钮（已选=primary Continue/Next；未选=secondary Skip）/ Back（secondary）
   - `onboarding-steps-0793.tsx` ConnectStep：卡片内 disabled Connect（secondary md——顺手，同 kit 语义）
   - 选择卡（role/attribution 的 radio 卡）不动——已有完整卡片样式段。
2. **全局 overlay thin 滚动条**：新 css 段（0.78.1 ui 面原子类合并）；建 bot 对话框滚动条顶出圆角随 overlay 化消失（验收截图确认）。

## 锚（0.78.1 deb0781/asar，chunk-onboarding-flow-CX7HFdkW.js + index-Dh7EWA8t.css）

- footer Z 组件：`F`(kit Button) `variant:primary`（默认）+ `style:[b.body1, Nt.button]`；Back `variant:secondary`；i18n `hXzOVo`=Next `iH8pgl`=Back
- footer 容器类 `sand-78zum5/dt5ytf/6s0dn4/1v2ro7d` = flex column center **gap:12px**（我方 css 现为 8px——改 12）
- Back span `sand-bu5dzu/c9qbxq` = **width:288px height:36px**（Back 钮在 span 内全宽）
- 滚动条原子类（index-Dh7EWA8t.css）：`ui-12o6m6d`(scrollbar w/h 8px) `ui-1uowca5/122zoth`(bg/track 透明) `ui-1nz211u`(thumb `color-mix(text-quaternary 45%,transparent)`) `ui-h4bufa`(hover 70%) `ui-9xsh1y`(radius full) `ui-1ftd4sf`(clip padding-box) + 四边 2px 透明 border（12 个类）

## 验收

- e2e `t78-native.spec.ts`：Landing/Walk 按钮断言 data-variant + kit 类；真实滚动容器 offsetWidth−clientWidth===0（overlay 不占位）；样式表存在 ::-webkit-scrollbar 规则
- 截图 DPR2 亮暗：onboarding landing+role 页、市场/建 bot 对话框滚动条——`work/ui-quality/evidence/T78/`（经理验收亲看）

## 非目标

- 按区域 scrollbar none（原版 ui-fk6m8 系）——无泄漏投诉，YAGNI
- sand 面 6px 滚动条皮肤（sand-y2251v 系）——未配对消费区域，不做
# T78 · 原生控件泄漏 + 滚动条（ui-quality U5）· 验收记录（主仓副本）

- 工单正文: feat/T78 `work/tickets/done/T78-native-controls-scrollbar.md`（随分支走，合并后与本副本合一）
- accepted: 2026-11-15 manager 任务 B @ feat/T78 5c361180（基 da746ec0；主仓 HEAD f970b821）
- 结论: **通过，待合并**

## 重跑验收命令

`cd /tmp/bot-wt/T78/app/ui && sh scripts/run-e2e.sh t78-native.spec.ts onboarding.spec.ts` → **8 passed (38.4s)**（onboarding ①-⑥ + t78 两测），与回执一致。

## 改动范围

`git diff da746ec0..5c361180`：onboarding-view.tsx / onboarding-steps-0793.{tsx,css} / 新 scrollbar-t78.css / 新 t78-native.spec.ts / 工单。未碰 frontend/ 上游、未删改既有测试。符合工单边界。

## 核实点

1. **Sol MEDIUM（滚动条断言假阳性）→ 返修到位**。新 spec 先注入溢出、断言 `overflow===true`，再断言宽差 `===8`；规则校验收紧为「::-webkit-scrollbar 含 8px」或「thumb 含 45%」。审查探针 `/tmp/bot-t78-review-1dzvecl5/scrollbar-probe.log`：带 T78 样式溢出宽差 8，禁用后经典条 15。删掉 T78 样式时，新断言会因宽差 15≠8 变红，所以能抓住回退。
2. **「占位 8px = 原版同款」成立**。`work/grok-1.1.0-re/deb0781/asar/dist/electron-main/*.cjs` 只有两个 appendSwitch（disable-gpu、DocumentPolicyIncludeJSCallStacksInCrashReports），没有任何 overlay-scrollbar 开关。main-app.cjs 唯一的 scrollbar 相关串是 `html{scrollbar-gutter:auto!important}`。index-Dh7EWA8t.css 有 `.ui-12o6m6d::-webkit-scrollbar{width:8px}`。Chromium 下自绘 ::-webkit-scrollbar 一律按经典条占位，原版同样占 8px。工单验收原文「offsetWidth−clientWidth===0（overlay 不占位）」的前提错了，以本条更正为准。
   - 已知差异（不阻塞）：原版只在挂了 ui-12o6m6d 的容器上用细条，我方 `*` 全局挂。工单 ponytail 已声明，截图未见副作用。
3. **theme-dual ① 挂 `[data-market-empty]`：测试过时，不是市场回归**。T69（73e1295d，2026-11-12）给市场内置了「Hivebot picks」目录，开箱不再是空态；theme-dual.spec.ts 最后改于 08641d66（11-07），仍在等空态出现。经理截图探针 `market-empty 0 / market 1`，目录正常渲染。不开修复单，queue 记测试修正提议（只改 spec 等目录行出现，审计换现存文本对）。

## 截图亲检（DPR2，`work/ui-quality/evidence/T78/`）

- `landing.{light,dark}.png`：Get started / Skip 是 kit 药丸钮，没有原生灰框。
- `role.{light,dark}.png`：footer Skip 为 secondary 288 宽。800×600 窗口下 Back 落在屏底外，这是既有 footer 定位（50%+240px），不是本单引入，留给 T79 巡检。
- `new-bot.{light,dark}.png`：滚动条细、透明轨道、不越圆角。对比 T84 worktree 同一面（未含 T78）的经典带箭头条顶出圆角，问题已消除。
- `market.{light,dark}.png`：列表细条在卡内。
