# VERIFY · P6-15 + P6-16（worker 可见性 + 回报呈现，UI）

verdict: **PASS**
commit: `49603f0dceaded17a411e814954509ca41b191dd`（feat/P6-15 @ /tmp/bot-wt/P6-15，验收期间 HEAD 未漂移、工作区无产品改动）
验收人：verifier（GLM 5.3）· 2026-11-04 06:14–06:35 · 全部命令由验收人在干净 worktree 实跑

## 验收项

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 上游零改动 | **PASS** | `cd app/ui/renderer-grok && pnpm check` 实跑：`upstream diff=0: 332 files`（含 assets sha256 -c 通过）。`git diff 92cb6af..49603f0 --name-only`（26 文件）全落在 main/m3-meta、renderer-grok/overrides+shim、renderer/session+fold（PLAN P6-16 指定位置）、tests——与 FINAL §4 声明面一致，无 renderer-grok/frontend（上游树）改动 |
| 2 | 测试复跑（防旧产物假绿） | **PASS** | 先 `pnpm build`（06:20），确认产物含本分支改动（out/main/index.js grep 到 botsOf/createdBy×4；out/renderer/ 含 override-p6-15.css + shim.iife.js）再跑。单测 `pnpm test`：**439/439 passed**（37 文件，4.0s，≥405，自报 439 吻合）。全量 e2e `pnpm test:e2e`：**70 passed (10.7m)**，exit 0，`test-results/.last-run.json` = `{"status":"passed","failedTests":[]}`（≥68，自报 70 吻合，新增 p6-workers 2 条；p6-fold.spec.ts 零改动、断言未动） |
| 3① | worker 进 Workers 分组、不进普通列表、无 reload | **PASS** | e2e 实跑通过 + spec 断言核对（p6-workers.spec.ts:110-119 `__agents__` 只有普通 bot、worker 行 count=0；:199-205 Late worker 建会话+投 Assignment 后出现，`__p615NoReload` window 标记终检为 true——reload 会清 window 属性，证明全程未导航）。真实 Electron（launchShell + fake runtime + 真 main） |
| 3② | 排序 blocked→running→unread | **PASS** | spec :131 `['Doc writer','Test fixer','Researcher']`（blocked/running/unread）、:168 作答后重排；5 态全档（含 failed/stopped 未读 rank 2）在单测 workers.test.ts:24-29 覆盖（本次 439 内实跑绿）；shim workers.ts `rankOf` 0-4 与决策 21 一致 |
| 3③ | Done 默认折叠 | **PASS** | spec :115-118（aria-expanded=false + 计数 4 + 折叠即不渲染行）；:194-196 展开；:218-222 reload 后仍展开（取反持久化，sidebar.tsx `isDoneSection ? !isCollapsed`） |
| 3④ | 主 bot 无审批按钮；ask 项跳 worker 聚焦原卡 | **PASS** | spec :291-292 主 bot transcript 内 `Allow\|Deny` 按钮数=0、permissionDock=0；:303-309 点 ask 项 → activeElement 在 dock（aria-label="Local tool permissions"）内**且 tagName !== BUTTON**（聚焦容器不聚焦 Allow，防误按）；:313-315 作答只发 worker 原 eventId 1 条 |
| 3⑤ | 回报卡 assistant 泳道署 worker 名 | **PASS** | spec :279-286 `closest('[data-role="user"]')===null` + 左列泳道几何断言 + `[data-pbots-worker-name]`=['Test fixer','Doc writer']；notice-view.tsx 用 React 文本节点（无 dangerouslySetInnerHTML），:288-289 无 a/strong/img 且 markdown 原文按字面显示（E14 纯文本） |
| 3⑥ | 窄轨不泄漏 worker | **PASS** | spec :207-213 Ctrl+B 后 rail 全部行 = ['Main Bot','Notes']；sidebar.tsx 覆盖层 `railed && isWorkerSection` 过滤 |
| 4 | 降级项诚实性（REPORT 三条） | **PASS** | a. 文字前缀不画红点：workers.ts `previewOf` 出 `Failed:`/`Stopped` 前缀，sidebar.tsx 未 fork AgentSidebarItem（无红点实现），failed/stopped 未读档确无 e2e（只单测）——与 REPORT 一致；b. 测试插件代做：p6-peer-plugin.mjs 仅在 tests/support/，产品代码 grep p615 零引用，spec 用 op:stub+deliver——一致；c. 离线不清空：data.ts diff（120 新增行）grep offline/disconnected 零命中，无单独 e2e——一致 |
| 5 | 契约：无 worker 时 bots.json 字节不变；createdBy 只读 | **PASS** | store.ts 仅 putRecipe/patchMainBotId 两个既有写方法（无 bots 写入 API），index.ts get 只读透传可选 bots；写路径 flush 用 read()（含 bots）不互抹。单测（本次实跑绿）：`bots 全是坏项 → 视同没有`，写盘后键集合恰为 `['mainBotId','recipes','version']`（不写空键）；`patchMainBotId 写盘不抹掉 createdBy`；与 CONTRACT v1.5 §3.1（决策 31）逐条吻合 |
| 6 | 14 张截图齐全（7 组亮暗） | **PASS** | 主仓 evidence/P6-15/ 14 文件齐（7 名×light/dark）。内容验证（三层，见下方「截图核验方法」）：像素统计全为 1280×820 产品视口、亮/暗主题均值差 216-227、无空白/假图；**独立复跑同 spec 重新生成 14 张，与交付 dHash 感知哈希 Hamming 距离全部 ≤7/256（结构逐项一致）**；交付图与 builder worktree 原始产物字节一致 14/14（拷贝无损）。复跑件+对比脚本+结果存 `evidence/P6-15-vfy/` |

## 截图核验方法（本环境限制，如实记录）

本验收环境 Read 图片只回 CDN URL、`mcp__4_5v__analyze_image` 对全部 URL 报 1210 解析错误（CDN 与本地 http 均拒），验收人无视觉通道。按截图规则的精神（防「拍到别的界面」）改用三层程序化验证——定位为**结构与复现一致性证据**（可从该 HEAD 复现、结构逐张一致），不证内容正确（内容由 DOM 断言旁证，见第 3 条）：
1. **像素统计**：14 张全为 1280×820（产品视口）、亮色均值 (246-251)、暗色均值 (23-31)、亮暗差 216-227（主题真实生效）、非全白/全黑；
2. **独立复现对比**（关键）：验收人自己 build + 全量 e2e 重跑，p6-workers 两条 spec 在真实 Electron 里重新生成同 14 张截图，与交付图 dHash 对比全部 ≤7/256（阈值 30）——交付截图可从该 HEAD 完整复现，结构（分组布局、卡片、泳道）逐张一致；字节差异仅来自光标/动画帧等动态内容；
3. **同步 DOM 断言**：每张截图的 bothThemes 调用点前后紧邻本轮新增的 DOM 断言（分组、排序、署名、泳道、token computed 值），e2e 全绿即截图内容的直接证明。

**该方法的未覆盖项（如实）**：① 失败 / 停止未读行（rank 2）无浏览器截图，只有单测（REPORT 降级 a）；② 离线沿用上游行为，无浏览器覆盖（REPORT 降级 c）；③ dHash 结构一致检不出主题过渡帧这类「整帧色偏」——事后证实：GU-P6-15-r1 席 A 发现交付的 7 张暗色图恰是过渡帧（dHash 与复现件仍 ≤7，因为复现件同样在过渡帧截取），P6-15.f1 已改 bothThemes 等过渡稳定（600ms）并加 Deny 对比度断言后全部重拍（现 evidence/P6-15/ 14 张 + contrast-deny.tsv）。

## 额外坏路径（各一条，均通过）

- **悬空 createdBy**（bots.json 有 worker 条目但会话不存在）：data.ts `isWorker/workersOf` 都要求 `summaries[id] !== undefined`，e2e 的 Late worker 建会话前正处此态（不出现，建会话+Assignment 后才出现）——契约 §3.1「崩溃留下的空 createdBy，list 会过滤掉」被真实走通。
- **坏 bots.json**：store 单测（本次实跑）覆盖坏 JSON（init 不抛、read 抛错不静默重置——不丢数据）与 bots 坏项剥离；e2e 另走通失败 create_bot（Ghost → `Couldn't message Ghost`、不可点、无按钮）。
- **重启后恢复**：spec 尾部 page.reload 后 Done 展开态保持、回报/Messaging 行不重复不丢失（:218-222、:363-368）。

## 观察与建议（不阻塞）

- creator 会话被删而 worker 仍在时，`creators()` 会为不存在者建 main 组（data.ts:169-172）——当前不可达（P6-10 未落地、主 bot 不可删），建议 P6-10 实现删除路径时补防御或断言。
- REPORT「给后续任务」三条（P6-10 写入方法+#20 防提升、P6-10/11 Messaging 行实参键、P6-12 eventId 选型）已在报告内明确交接，无需 verifier 追加。
- 普通 bot 两条待办（卡住原因仍显 local-tool-permission、未读不随打开清除）是 D11⑤ 范围外、REPORT 已如实列为待办——非本任务回归。

## 结论

6 项验收全 PASS，无 `[FIX]` 项。单测 439/439、全量 e2e 70/70 均为验收人从干净 worktree 独立复跑（先 build 后 e2e，产物含分支改动），截图内容以独立复现对比确证。可进 GU 评审。
