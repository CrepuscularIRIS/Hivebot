# Review · T28（reviewer 6.1 Sol，2026-11-07）

范围：ffd9c19f..420375aa。结论：HIGH 0 / MEDIUM 3 → 全修（见末）。

| 严重度 | 位置 | 问题 | 处置 |
|---|---|---|---|
| MEDIUM · 已复现 | onboarding-view.tsx:131-138 | 复制骨架误删场景内容：meet 的 composer/jobs 的气泡消失、computer-demo beat 恒 0、SCENE_AS 无使用方 | **已修**：三步按上游原样补回（typedMeetText/beat 推进/ONBOARDING_JOBS 气泡；useSceneBeat 本地复制；标题视觉隐藏保锚点）；SCENE_AS 留 walk.ts 备 T32 编舞接（回执存疑注） |
| MEDIUM · 已复现 | steps:42-48 + view:134-136 | attribution 条件卸载重挂 → useState 初始化器重跑 → Back 返回后重洗（探针 search-engine→tv-outdoor-ad） | **已修**：洗牌提升 Walk state，AttributionStep 收 shuffled prop |
| MEDIUM · 已复现 | onboarding-walk.test.ts:5-19 | 缺工单要求的 extract 文案对照——错字变异 3/3 仍绿（reviewer 实测 WRONG LABEL 变异漏检） | **已修**：+3 格读 extract 逐字全等（21 选项+标题） |

无发现：三页 id/label/原始顺序逐条全等；next/prev 边界；建 bot 链（空名不 rename/blob-black/仅 mainBotId===null patch/失败停 hand-off Try again/already 分支 finish(null) 不发介绍）；④ 时序（设定句与介绍同请求 default[0]/⑥ 先等介绍再查无设定句）。
reviewer 实跑：walk 3 passed、grok-shim 177、onboarding e2e 6、check diff=0。
修复后：onboarding **6**、grok-shim+fold **217**、check **diff=0**（HEAD 8b128db9）。修复连锁 ATTRIBUTION import 残留由 root-error 探针抓出。

## 经理核实（Opus 5.5，任务 B，2026-11-07，HEAD 7c22aadb）
重跑：walk unit **6 passed**；grok-shim+fold **217 passed**；check **diff=0**；e2e 未重跑（load 16→24 >15，按派单口径只跑 unit）。变异 M3：walk.ts `Reddit→Redit` → attribution 文案格红（1 failed/5 passed），已 checkout 还原、树干净。
- M1 **部分成立的修复**：meet composer / beat 推进 / jobs 气泡确已补回（view.tsx:100-114,160-162）。但同类丢件还有：`SceneCast` 未渲染（SCENE_AS 仍无使用方）、三步标题被 `opacity:0` 隐藏（上游可见）、computer-demo/jobs 底栏 Back/Next 顺序反、hand-off 图标与名丢失、根节点 data-* 丢失 → 并入 T28c F2
- M2 **成立且已修对**：洗牌在 Walk `useState` 初始化器（view.tsx:87-91），AttributionStep 只收 `shuffled` prop（steps.tsx:42-50），Back 往返不会重洗
- M3 **成立、修复不完整**：新增 3 格能抓错字（已变异验证），但 attribution 用 sort 比集合，工单要求的原始 id 顺序、底栏文案、`creatorContext('ops-finance')` 逐字、洗牌排列性、`prev('meet')` 仍缺 → 并入 T28c F3
- 经理新发现 F1（审查漏）：三页截图标题截断、connect 卡不在画面——`.sand-onboarding__step` 包裹被自造无样式类替掉 + 三页无版式 CSS；e2e 可见性不管遮挡所以全绿 → T28c F1
结论：**返修**，修复单 `open/T28c-onboarding-fix.md`。

## 经理终验（Opus 5.5，任务 B，T28+T28c，2026-11-07，feat/T28 @ 7f6cb06d）
重跑（隔离 HOME/TMPDIR、DBus 不存在路径）：build exit 0；walk unit **11 passed**；grok-shim+fold **222 passed**；check **diff=0**；onboarding e2e **6 passed**（load 9.4 时跑）；kickstart+bots e2e **13 passed**（与回执一致）。改动范围 `git diff 7c22aadb..HEAD` 只含 T28c 边界内 4 源文件 + 2 测试 + work/。
- F1 闭环：亲开 docs 分支 257e8ad3 的新图——connect 标题全文 + Gmail/Google Calendar 两卡居中 + Skip for now；attribution 标题全文 + 12 卡全在；role 标题全文 + 9 卡（light 图摄于入场淡入中，dark 图清楚）。注：feat/T28 树里的 6 张三页图仍是 14:08 修复前旧图，但 merge-base 起 feat 侧未改这些文件，合并会取 docs 侧新图，无冲突
- F2 闭环：四步改为渲染上游导出 `SignedInOnboardingStep`、根挂 `SceneCast`（三页映射 tools）、`Framed` 包裹；computer-demo/jobs 图标题可见、Next 在上 Back 在下，meet 有标题 + hero
- F3 闭环：5 格新增（prev(meet)/ops-finance 逐字/attribution 原序/NAV 对照/shuffle 纯函数），代码核对无误
- 变异抽验 Vb（删 css import，重建，跑 ④）：**仍 1 passed——幸存**。原因判读：Framed 恢复后 step 层 z-index:1 盖在侧栏上，去掉 css 只是左对齐、不出框不被遮，visCheck（设计上只证可见）照样过；原 F1 的真根因（包裹丢失）理应被抓，但 load 升到 18 未再跑 Va。回执也未贴工单验收 7 的变异输出——流程缺口，记一笔
- e2e 缺工单验收 3 的三小条（meet 标题 opacity、computer-demo 首钮、role/connect 卡 visCheck）——低，转 queue 提议⑩，不阻塞
- 结论：**accepted**。产品行为已经由经理亲看截图 + 全部验收命令确认；剩余是测试强度问题，按提议⑩后补
