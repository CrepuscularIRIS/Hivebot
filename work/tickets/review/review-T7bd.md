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

## T7bd 终验（manager Opus 5.5，2026-11-07 19:4x～20:0x，HEAD 050d9752）

**结论：通过。** 工单挪 `done/`，accepted 050d9752。审查 UNKNOWN 1 经理复现成立，但属 T30 起 `ui.ts` 兜底的既有缺陷，本单验收格因 `createBots` 的整页 reload 自愈 → 开 `open/T7be-wait-product-ready-race.md`，不挡本单。

### 经理复跑（集成分支主仓，隔离 HOME/TMPDIR/DBus，load≈4，无他人 Xvfb）
1. `git status --short app/ui` → 空；HEAD 050d9752（提交 19:39:08）
2. build exit 0；`index-C3Rta71B.js` 19:40:42 > 提交时间；文件名哈希与回执一致（同内容）
3. skills-picker + t7b-shot **连跑 3 轮 → 3/3/3 passed**（15.0s/12.0s/12.0s）；三轮 skills-added.light 截图中央 Welcome 区像素 min=252（无引导层）
4. settings + grok-dead-entries → 3 passed (1.4m)
5. renderer-grok check → `upstream diff=0: 332 files`
6. `grep -c SandIconButton skills-dialog.tsx` → 2；`style={{`/`#121212`/`#fff` grep → 空。产物字面 grep=0（minify 改名）——**接受**：本条判据是经理开单写错，对话框可渲染已由验收 3（`[data-skills-dialog]` 可见）直接证明
7. 四张 ref 图 Read 目检：pick.light 白底、Add 黑底白字；pick.dark 对话框底 #1f1f1f 非白、Add 浅底**深字**清晰；两张均勾选态、× 为圆形图标钮、行内 名/来源/描述 三段分开；added 亮暗 Pick / Remove 可读。✓
8. 改动面：`05ef7e3d`+`81e5aaa5` 只动 skills-dialog.tsx / t7b.css / t7b-shot.spec / skills-picker.spec / grok-dead-entries.spec / ref 四图 / LEARNINGS
9. 残留：本人 Xvfb/Electron 无残留，临时目录已删

### 逐条核实 Sol
1. **CONFIRMED 中（既有缺口）→ 不挡本单，转计划行 T7bf**。`t7b-shot.spec.ts:40` `not.toBe(bg)` 对 245/250 必绿，回执探针值可信（规则在态 rgb(18,18,18)、删除态 rgb(245,245,245) 均配 rgb(250,250,250)）。本单视觉证据以经理目检（验收 7）为准。T7bf：改 WCAG 对比度 ≥4.5（半透明底按最近不透明祖先合成），删暗色 Add 规则必红（预期 ≈1.04）。不急开：该规则是 ponytail 临时补丁，等全局色板修时一起收更省。
2. **CONFIRMED（弱）→ 不补回原三行**。被删的是就绪门而非业务断言；「恰 1 agent」「idle」与 Skills 段无关（`createBots` 走 API 并自己 reload + 等目标 bot 可见）。真正该守的是「引导层不在」，由 T7be 把 `.sand-onboarding` 计零哨兵放进 `waitProductReady` 统一补上。
3. **UNKNOWN → 经理复现 CONFIRMED（中，既有）**。临时探针（test-output/ 下，跑完已删）裸 `launchShell` → 立即 `waitProductReady`：**8 次中 3 次、再 4 次中 2 次**引导层留在 DOM 且可见（box 1280×820，截图见 Welcome to Grok Bot 盖住主区，侧栏仍见 New chat）；「先等引导开再调 helper」模式 3/3 必现，此时 `button[aria-label="View agent settings"]` 点击 5s 超时（not visible/stable）。根因如 Sol 所述：`ui.ts:79-84` 只写 storage + reloadRoster，`ProductionRenderer.tsx:2750-2753` 已用旧 seen 打开的引导只有 finish/skip 能关。本批三 spec 中：skills-picker / t7b-shot 在 `createBots`（`ui.ts:137` `page.reload()`）处自愈——这解释 9/9 绿；**grok-dead-entries 无 reload，暴露约 4 成概率**（今日 1/1 绿不足为证）；settings/market/d1 等其他 bare 调用方同理。缺陷在 T30 写的共享 helper，本批只是新增调用方 → T7be 在 helper 一处根修（复用 `launchProduct` 的置 seen + 整页 reload + 计零流程）。
4. REFUTED 三条抽查成立：`p5-55-palette.css:183/546` elevated 亮 #ffffff / 暗 #1f1f1f，`:719` 暗色 inverted #121212；菜单清单以 e2e 实跑相等为准（验收 4 绿）；diff 未动对比度断言，回执如实披露。

### 施工合规
- 先红②「不红」：施工没改断言、写进存疑、规则 var 化照做——**合规**（正是工单写的停手路径）。
- 越界：skills-picker.spec（工单明文禁改）、grok-dead-entries.spec、LEARNINGS——**接受**。前两者是 T26b 合并回归挡住验收 3/4，不修则验收不可达，改动只换就绪等待 + 补 T21 活入口；经理开单时未预见 T26b 回归面。LEARNINGS 条「根修=裸 spec 换 waitProductReady」不完整，经理已追一条更正。
