# VERIFY · P5-11.f1（GU 裁决小修，轻量抽验）

verdict: PASS
commit: 61bf31dc1c3918dfacd9a811475937a8d3bf7f89（feat/P5-11f1 @ /tmp/bot-wt/P5-11f1，验收时 HEAD 一致、工作区干净）
验收时间：2026-11-03 03:03–03:13（date 实测）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 1. 独立复跑新 e2e 全绿（市场钮定位 + 不变量断言） | PASS | `cd /tmp/bot-wt/P5-11f1/app/ui && pnpm test:e2e tests/e2e/visual-sidebar.spec.ts`（run-e2e.sh 自动 xvfb-run 包裹）→ `2 passed (7.9s)`：:23 A1 用例（含 collapse 钮中心 y 两态差 ≤1px 亮暗各一、折叠条目宽 54 + offCenterX ≤1px、padding 9px 保留；已无 padding 4px / min-height 54 字面断言）；:117 市场钮用例（getByRole name '市场' exact、data-action=market、title=市场、span 隐藏、.icon aria-hidden、点击后 aria-current=page） |
| 2. 红基线：摘可达名 → 市场钮用例红，恢复绿 | PASS | 摘 `aria-label="市场" title="市场"`（Sidebar.tsx:206）+ `pnpm build` 重建 → 复跑 `1 failed / 1 passed`，:125 `getByRole('button',{name:'市场'})` not visible；恢复 + 重建 → `2 passed`，`git status` 干净。**注意红基线必须重建**：launchShell 加载 `out/main/index.js` 产物，run-e2e.sh 不触发 build——只改源码不重建会跑旧 dist 得假绿（本验收第一次摘属性未重建即为假绿，重建后才真红）。另实测：只摘 aria-label 留 title 时仍绿——title 是 accname 规范的合法可达名回退源，且用例同时锁 title 属性，属正确 a11y 行为非用例空转（两名源全摘才红） |
| 2b. 附加：CSS 红基线（佐证 padding-inline 修正行必要性） | PASS | sidebar.css 折叠规则退回 `padding: 4px` + 重建 → A1 用例红：`:56 Expected: <= 1 / Received: 5`（与报告申报「改前红：中心 y 差 5px」精确一致）；恢复 + 重建 → `2 passed (7.8s)` |
| 3. 区域：diff 恰 3 文件；padding-inline 修正有据 | PASS | `git show --stat 61bf31d`：恰 Sidebar.tsx（+1/-1）、sidebar.css（+2/-1）、visual-sidebar.spec.ts（+34/-4... 实为 40/-6 含上下文），无第 4 文件；diff 含 `.sidebar .sidebar-head { padding-inline: 4px; ... }` 及注释行；报告第 12 行「CSS 说明」段明确记录该修正及理由（横向保 R2 的 4、纵向 12 与展开一致） |
| 4. vitest 230 | PASS | `pnpm -C /tmp/bot-wt/P5-11f1/app/ui test` → `Test Files 27 passed (27) / Tests 230 passed (230)`，3.86s |

坏路径（第 3 条要求）：即验收项 2/2b 的三条红基线（可达名摘除、CSS 回退），另有 stale-dist 假绿发现（见下）。

截图：e2e spec 自产（Xvfb 真实 Chromium），亮暗 4 张 + search 1 张在 worktree `app/ui/test-output/P5-11/`（gitignored）；两张已拷主仓 `work/p5-parity/evidence/P5-11f1/`（sidebar-collapsed-light.png / sidebar-expanded-light.png，21154/25368 字节）。本环境 Read 图片仅回 CDN 链接无法目视，以 spec 内真实浏览器几何断言（宽 78、条目 54、中心距 ≤1px）为操作性证据。

新问题（每条一行，可直接成为修复任务）：
- [FIX] e2e 红基线易得假绿：改源码不 `pnpm build` 时 run-e2e.sh 跑旧 dist，摘掉 aria-label 仍全绿 | 复现：sed 摘 Sidebar.tsx 属性 → 直接 `pnpm test:e2e`（不 build）→ 2 passed | 疑似位置：app/ui/scripts/run-e2e.sh（可在脚本头部检测 out/ 与 src 新旧或加 --no-cache 提示） | 严重度：低（红基线/回归流程坑，不影响产品）

结论：GU-P5-11 两条必须回应均已落实且断言真实锁住行为（红绿翻转验证过），区域干净，230 单测 + 2 e2e 全绿。P5-11.f1 可合并。
