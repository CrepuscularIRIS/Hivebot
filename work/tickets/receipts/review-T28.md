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
