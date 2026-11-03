# VERIFY-P5-11 · 侧栏 A2 搜索 + A13 折叠态

verdict: PASS
commit: ebd724ca047f430093d171b11db9e26b3ad806a5（worktree /tmp/bot-wt/P5-11，验收期间无漂移，status 干净）

独立复跑（HOME=/tmp/bot-vfy-p511，`pnpm -C app/{ui,sdk} setup` 后全新 build）：
- `pnpm build` ✓（electron-vite 1.16s）
- `pnpm test` → **224/224** ✓（v5.0.5，3.89s）
- `pnpm test:e2e`（Xvfb 1600x1000）→ **56 passed (5.8m)** 零 flaky，含 visual-sidebar（#54）——即 builder 自修后的折叠 overflow-x 断言（`.bot-list` offsetHeight===clientHeight）跑在**修复后 build** 上 ✓

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① 搜索：3 bot 异名→子串过滤剩 1 / 清空回 3 / 无匹配空态；大小写不敏感；Enter 选中首条保留查询 | PASS | `bots-search.spec.ts`（56/56 之内）：Set(names).size=3；键入 `ALPHA`（大写）→ items=1 且命中 alpha（大小写不敏感实证）；search-clear → 回 3；`zz` → `没有名字含「zz」的 Bot`（data-roster-state="no-match"，empty 态不并存）；Enter → 首条 aria-selected=true 且 input 值仍 `beta`。附带：可打印键带入首字符、Esc 关闭并焦点回 search 钮、IME/ctrl/meta/composer 不触发 |
| ② 搜索钮 computed | PASS（按定稿口径，注明偏离） | PLAN 原文（0.18 全宽按钮 宽=侧栏−24、margin 4 12）已被 R2+定稿取代：`P5-11-final.md` 分歧 4（头部原位替换、0.78.1 打开的是命令面板无输入框实测值）。`visual-sidebar.spec.ts` 断言 computed 24×24 / r6、头部 padding `12px 16px` / gap 8、三钮 x 坐标 [headX+16, +42, +68] 同组贴左——亮暗两套全过；截图 `evidence/P5-11/vfy-sidebar-expanded-{light,dark}.png` 头部右侧区（x240-275）纯背景 0% 着色，证无第四元素 |
| ③ 折叠（按定稿语义核验） | PASS（偏离均有定稿记录） | 定稿 `P5-11-final.md`：分歧 7（折叠只走钮、拖拽 240–400 夹紧、外拖越过 (78+240)/2=159 展开——PLAN「容器 ≤130px 触发/拉宽恢复」的取代语义，**已记录**）；两席收敛行（折叠宽 **78**=54+12×2 推导值，PLAN 原文 88，**已记录**）。实测：点钮→78；条目宽 54 / padding 9 / min-height 54 / bot-text+time 隐藏 / 头部 padding 4 / search 隐藏；容器查询 131px→padding 8px、130px→9px（CSS 断点独立于 JS）；drag(30)→保持 78、drag(200)→278（≥159 展开）；跨 reload 折叠保持、展开回原宽 |
| ④ ①③ 数值亮暗两套 | PASS | `visual-sidebar.spec.ts` 单测内 `for (mode of ['light','dark'])` 循环，①③ 全部 computed 断言两遍 |
| ⑤ U6：bots/visual 既有 e2e 全绿（含 bots.spec:52/82/92 new-bot 锚点） | PASS | 56/56；`bots.spec.ts:52/82/92` 均为 `[data-action="new-bot"]` 点击（锚点已从文字行迁到 + 钮，`visual.spec.ts:26/:100` 亦绿 |
| ⑥ 区域：diff 仅 Sidebar.tsx、sidebar.css（新）、Resizer.tsx、两个新 spec；App.tsx 不动 | PASS | `git diff --name-only f65b4df..ebd724c` = 恰好 5 文件，`--stat` 335+/18−，App.tsx 零改动 |

**坏路径探针**（worktree 内未跟踪临时 spec，跑完即删，git status 复核干净）：localStorage 污染 `width='NaN'`+`collapsed='garbage'` → reload 回 initial 280 不崩；`width='99999'`+`collapsed='1'` → 78（非法宽被忽略、折叠位生效）；`320`+`'1'` 跨 reload → 78、展开回 320；折叠态键盘 ArrowLeft 不动（78）、ArrowRight 回展开档 240（padding 复 8px、collapsed 写回 '0'）。全过。

**TS2688**：main（1643474）上 `tsc --noEmit` 报同一条 `TS2688: Cannot find type definition file for 'node'` —— **原有问题，非 P5-11 引入**，不影响 build。

**截图目检说明**：本会话 Read 图片仅回 CDN URL（外部取回 403）、MCP 内嵌截图通道超时，无法直接目视；改以像素取证代替并如实记录：5 张 `vfy-*.png` 均为 1280×820（= main/window.ts:17 应用窗口尺寸，非桌面截图）；亮暗两套背景亮度反转（侧栏列 light≈235/dark≈25）；折叠态 x22-56 头像带 15% 着色、x58-77 文字区 0% 着色（条目只剩头像）、x90-200 纯主区（侧栏确止于 78px）；搜索态列表着色 1% vs 展开 4%（过滤后仅 1 条）；builder 5 张截图同区域结构一致（非假证据）。

新问题（每条一行，可直接成为修复任务）：
- （无 FIX 级）
- [NOTE] collapse 图标为 layout-sidebar-right + scaleX(-1) 镜像 | 定稿分歧 12 已记录，P5-14 补码位 | 非本任务缺陷
- [NOTE] Resizer compact 档无单测，覆盖全在 e2e（visual-sidebar + 本次探针）| 复跑：`pnpm test` 224 内无 Resizer 用例 | 严重度：低，可不修

证据：`work/p5-parity/evidence/P5-11/`（builder 5 张 + 本次复跑 `vfy-sidebar-{expanded,collapsed,search}-*.png` 5 张）
