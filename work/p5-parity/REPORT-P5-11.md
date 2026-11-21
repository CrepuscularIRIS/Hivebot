# REPORT-P5-11 · 侧栏 A2 搜索 + A13 折叠态

> frontend-dev 回报，主会话代录（其写报告被拦截），2026-11-03

分支 feat/P5-11 @ ebd724c，worktree /tmp/bot-wt/P5-11。改动：Sidebar.tsx、新 sidebar.css、Resizer.tsx + 两个新 spec（visual-sidebar、bots-search）；App.tsx 未动。定稿文件 ui/P5-11-final.md（13 分歧点）；截图 evidence/P5-11/（展开/折叠×亮暗 + 搜索态亮）。

## 定稿取舍
1. 头部排布按 R2 实测三钮同组贴左（未采纳席 A「New Bot 贴右」审美推断）
2. 「新建 Bot」文字行删除，data-action="new-bot" 交 + 钮（Ctrl+N 入 tooltip）；bots.spec:52/82/92 全过
3. 折叠态主 Bot 星标采纳席 C：纯 CSS 头像右上角，DOM 仍单 .corner-main
4. 搜索框头部原位替换按钮组、列表不位移；Esc 一次清空并关闭；Enter 选中首条保留查询
5. 拖拽 240–400 夹紧不进折叠（折叠只走 collapse 钮；0.18 isCollapsed 布尔依据 + 保 bots.spec「拖 −200→240」断言）；折叠态外拖 >159px 展开
6. 持久化用 0.18 键：sand.sidebar.collapsed / sand.sidebar.width（只存展开宽）
7. collapse 图标：字体无 layout-sidebar-left，用 right 镜像（P5-14 补码位）

## 自验
- build ✓；vitest 224/224；全量 e2e **56 全过零 flaky**（NewBotDialog 族未出）
- 两个新 spec 先红后绿
- 自测修复：折叠后内容宽 53.5px < 54px 条目 → 横向滚动条；折叠态 overflow-x:hidden + 断言，修复后 10 个相关 spec 复跑全过（全量那次跑的是修复前 build）
- tsc --noEmit 报 TS2688（node 类型缺失），不影响 build，未核 main 是否原有

## 留给 P5-16
- 展开头部高 48 vs 主列 titlebar 38 底边不齐（R2 44/52 档归 P5-16）
- 展开条目 0.18 的 58 vs A4 54（归 P5-16）

## 复测
cd /tmp/bot-wt/P5-11/app/ui && pnpm setup && (cd ../sdk && pnpm setup) && pnpm build && pnpm test && pnpm test:e2e
