# REPORT · P5-50 0.18 移植树入仓

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-50 @ d7f2369（基 4f2101e），worktree /tmp/bot-wt/P5-50。

## 交付
①app/ui/renderer-grok/（frontend/+source/ 同构分层，相对 import 零改动）：332 文件（frontend/src 308 + 3 配置 + manifest + source/ import 闭包 20），每文件头 来源: @a9f633e:<path>（json/woff2 除外）；SOURCES.tsv 记 sha256；pnpm check 去头逐文件 diff=0 + 篡改反证 exit 1；**覆盖文件无**
②renderer-grok 独立 workspace 包：React 19.2.1、@tiptap/* 33 包直接钉 3.14.0、vite 8.2.1；旧 renderer React 18 未动
③资产 18 个入 assets/runtime/（sha256 与 0.18 manifest 18/18 一致，MANIFEST+SHA256SUMS 随迁；fonts/sounds/imagery 45 个 0.18 未引用留 evidence 供 0.78.1 对照）
④Electron 44.7 Xvfb 桩挂载亮暗两轮 PASS：侧栏 3 bot、persona data-grok-state 动画态、Thinking/Bash/Read/assistant+代码块/composer、boundary=0、MISSING=0、报错 0。截图 evidence/p5-50/mount-{light,dark}.{png,json}

## 不回归
主 ui frozen-lockfile ✓ build ✓ 245/245 ✓ e2e 61 ✓（hairline 为既有 test.fail）。旧 renderer/main 未碰。

## 坑（交 P5-51/54）
1. 包 type:module 使 stub 须 .cjs（sloppy 模式）
2. **S0 证据自相矛盾**：RE-s0 :14 称 boot 出审批卡，其 run-state2.json 却 hasPermCard:false、Electron 挂载同样不渲染——**P5-51 查 local-tool-permission entry 的渲染条件**（可能挂 composer/tray 或需 pendingAsk）
3. P5-54 切换时定 main 加载方式与 CSP 对齐
4. 上游 KaTeX 从 dev 路径加载，生产公式渲染会失败（上游行为；需支持则用 R9 fonts 加覆盖）

## 复测
cd /tmp/bot-wt/P5-50/app/ui && pnpm install --frozen-lockfile && cd renderer-grok && pnpm check && pnpm build && pnpm mount /tmp/bot-<任务>/ev
