# VERIFY · P5-50 0.18 移植树入仓

verdict: PASS
commit: d7f2369f0857fdab3290a854680af235a0ef9f8d（基 4f2101e，验收期间 HEAD 未漂移）

验收人独立复跑于 worktree /tmp/bot-wt/P5-50，2026-11-03 13:05–13:20。上游参照 repos/grok-bot-0.18-reconstructed@a9f633e（亲验 SHA 一致，工作区干净）。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 安装：frozen-lockfile 干净复跑 | PASS | 删 renderer-grok/node_modules 后 `pnpm install --frozen-lockfile` exit 0（1.6s，store 硬链接）；workspace 只新增 `renderer-grok` 一行（pnpm-workspace.yaml diff 亲核） |
| 与上游逐文件 diff=0 | PASS | `pnpm check` → "upstream diff=0: 332 files"，exit 0；另抽 3 文件（frontend/src/main.tsx、source/shared/rpc/coordinator.ts、frontend/vite.config.ts）去头行人工 `diff` 全 IDENTICAL；assets sha256sum -c 通过 |
| 篡改反证（坏路径） | PASS | 向 main.tsx 追加 `// tampered` 后 `pnpm check` exit 1（"content differs from upstream"），git checkout 还原后复绿 |
| vite build | PASS | `pnpm build` exit 0（✓ built in 1.26s；仅 INEFFECTIVE_DYNAMIC_IMPORT 警告，上游代码结构固有） |
| Electron 44 桩挂载亮暗两轮 | PASS | 亲跑 `pnpm mount /tmp/bot-vfy-p550/ev` → PASS exit 0：agents=[Main Bot, Research Bot, Ops Bot]、persona states=[idle,thinking,working,idle]、boundary=0、MISSING=0、errors=0、luma light=252/dark=7；截图与 JSON 见 evidence/p5-50-verify/mount-{light,dark}.{png,json}。像素取证：1440x872 两帧均非空白（std 21/18），对话区 16/14 个内容块、composer 底带有墨、侧栏 ~4300 饱和像素（SVG 头像），亮暗均值 248/13 与页内探针 252/7 吻合 |
| 主 ui 不回归 | PASS | `pnpm build` ✓（1.16s）+ vitest **245/245** exit 0 + e2e visual-sidebar.spec.ts **2 passed**（xvfb + `pnpm exec playwright`；dist 已重建后跑） |
| 区域：332 文件 + 配置行 | PASS | renderer-grok 360 git 文件 = 移植 332（frontend/src 308 + frontend 根 4 含 manifest + source/ 20）+ assets/runtime 18 + harness/check 脚本等 10；renderer-grok 之外仅 pnpm-lock.yaml（+1147 行新依赖）；旧 renderer/main/preload/e2e/tests **零改动**（git diff 空）；覆盖文件无（diff=0 即全覆盖无覆盖） |
| 依赖钉版 | PASS | react/react-dom 19.2.1、vite 8.2.1、@tiptap/* 全 3.14.0（实测 32 包，申报写 33——口径差 1，实质「全钉 3.14.0」成立）；旧 renderer 仍 ^18.2.0 |
| 资产 18 个 | PASS | 磁盘 18 = 本地 MANIFEST 18 = 上游 0.18 manifest 18，逐个亲算 sha256 **三方一致 18/18**（python hashlib，脚本临时存 /tmp） |
| SOURCES.tsv 完整性 | PASS | 数据行 332（334 行 - 2 注释头）；抽 2 行（org-chart/workspace/graph.tsx 深路径 + renderer-runtime-assets.json）双向亲算：本地去头 sha256 = 记录值 = 上游 `git show a9f633e:<path>` sha256；header_lines 分布 330×1 + 2×0（json/woff2 例外，与申报一致） |

## 截图目视说明
本环境 Read 工具对图片只回传 CDN 签名链接、不内嵌像素；视觉 MCP 因 64 位签名 URL 转录失配（curl 复核为 SignatureDoesNotMatch）两次 400，未能机器目视。替代证据链：① 截图来自我亲跑的 playwright `page.screenshot`（截的是自己启动的 Electron 页面，DEMO-1 型「截错窗口」风险结构性不存在）；② 页内 DOM 断言全过（文本级：quarterly numbers/analyze.py/summary.md/Revenue is up 12%、composer ProseMirror）；③ 上表像素取证。若需绝对目视，GU 席可打开 evidence/p5-50-verify/mount-light.png。

新问题（每条一行，可直接成为修复任务）：
- [INFO] REPORT-P5-50 称「@tiptap/* 33 包」实为 32（package.json 实测，全部钉 3.14.0）| 复现：`python3 -c "import json;d={**json.load(open('/tmp/bot-wt/P5-50/app/ui/renderer-grok/package.json'))['dependencies']};print(sum('tiptap' in k for k in d))"` | 疑似位置：work/p5-parity/REPORT-P5-50.md 第 9 行 | 严重度：info（仅报告计数口径，不影响验收）
- [FIX] scripts/run-e2e.sh 裸调 `playwright` 被 PATH 里 miniconda 的 Python playwright 劫持（`error: unknown command 'test'`）| 复现：`cd app/ui && sh scripts/run-e2e.sh tests/e2e/visual-sidebar.spec.ts` | 疑似位置：app/ui/scripts/run-e2e.sh:10（应改 `pnpm exec playwright test` 或 `./node_modules/.bin/playwright`）| 严重度：low（环境级、非 P5-50 引入，但会坑后续自动化）
