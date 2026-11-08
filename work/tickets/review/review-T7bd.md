# T7bd Sol 审查代录（2026-11-07 19:4x，主会话机械代录——reviewer 席不落盘）

范围：05ef7e3d、81e5aaa5、136d1a7c；仅静态阅读，未改文件、未跑构建或 e2e。

## CONFIRMED
- **中｜既有验收缺口，非本批新引入**：t7b-shot.spec.ts:36-40 只断言颜色字符串不等，不能证明可读；245 灰字配 250 灰底仍会通过。回执 T7bd.md:16-20 已主动披露此反例；应另获授权改为对比度阈值并重做删除规则变异，不能把当前绿灯当视觉验收证据。"恒绿"仅适用于记录的变异，不是该断言永远不能失败。
- **等待语义确实减弱，但未证实造成业务漏测**：skills-picker.spec.ts:18,71 替换后不再要求恰好一个 agent、编辑器可见及 idle；ui.ts:84 只检查首行可见。不过技能复制字节、移除双清、250 上限的业务断言仍保留。

## REFUTED
- CSS 变量缺失/暗色反色错误：p5-55-palette.css:183,546 亮暗 elevated 都有、:719 暗色 inverted=#121212；t7b.css:7,28-29 迁移与原值相符。
- 菜单补项顺序错误：AgentRowActions.tsx:75-86 确认 Edit Profile → Show full conversation → Move 顺序；grok-dead-entries.spec.ts:155 补项正确。未找到另一份同类旧完整清单。
- 隐瞒失败/擅改对比度断言：本批 diff 未改该断言；回执明确记录删除规则仍绿及产物 grep=0。

## UNKNOWN
- **中风险待经理复现：兜底仍可能留下 onboarding 遮罩**。grok-dead-entries.spec.ts:111 依赖 ui.ts:79-84（直接改 storage、reloadRoster、仅等 agent）；ProductionRenderer.tsx:2750-2753,2122-2136 可先取得旧 seen=false、count=0，之后独立打开引导，storage 写入和 roster 更新并不会关闭它。ui.ts:100-108（launchProduct）用整页 reload＋引导计零规避此竞态；建议裸壳调用复用同等同步流程。
- 运行证据与授权：未重跑，无法核实 computed color 前后值、截图构建来源、通过次数；越界修改（skills-picker/dead-entries）有验收前置与 T21 清单更新理由，但工单边界明确禁止——是否允许扩面、先红②不红后继续施工，须经理确认。

## 总评
高 0；已确认中 1（既有断言缺口）；中风险 UNKNOWN 1。未发现本批产品 CSS 的确定性回归；暂不能凭现有绿灯认定验收闭环，重点核实裸壳兜底竞态并处置已披露的对比度验收缺口。
