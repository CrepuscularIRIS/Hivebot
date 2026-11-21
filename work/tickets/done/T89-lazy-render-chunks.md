# T89：mermaid / KaTeX 懒加载块在产物里真能加载（「Couldn't render this diagram」红字根因）

> 开单：manager (Opus 5.5) | 日期：2026-11-14 | 施工：main (GLM 5.3)
> 来源：queue「mermaid 运行时渲染失败升优先」提议（2026-11-13）；T80b 证据 `work/persona-stop-gap/evidence/T80b/run3.light.png`
> 分支 / 作业目录：feat/T89 @ /tmp/bot-wt/T89
> claimed：779c0760 @ /tmp/bot-wt/T89（2026-11-14）
> accepted：2026-11-14 60bc9787（manager 任务 B：t89 1p×2 连 4.7s/4.5s；t68+t83 2p 11.4s；package.json/lockfile 零 ^）

## 目标
persona 会画图、写公式，图表和公式必须真的渲染出来，不能每次都露红字加原始代码。

## 经理已查清的根因（施工先复现确认，不成立就停下写回执）
0.18 重建树把这几个富渲染库当成「0.18 原产物里现成的 chunk 文件」去动态 import，我们的构建从来没产出过这些文件：
- `frontend/src/recovered/features/conversation/workspace/mermaid.tsx:8` → `"/upstream/assets/mermaid.core-CYC_FcEu.js"`
- `frontend/src/recovered/features/conversation/workspace/math.tsx:6` → `"/upstream/assets/katex-DHMw6HUq.js"`
- `assets/runtime/` 里没有这两个文件；`package.json` 的 build 只把 `assets/runtime/*`（图片）拷进产物；`/upstream/assets/` 只在 DEV 下由 vite 提供（`frontend/src/production/runtime-assets.ts:4` 注释）。产物里 import 必失败，mermaid 走失败分支出红字，KaTeX 同理（公式退回原文）。
- 同病的还有 `pdf-viewer.tsx:12`（pdf）和 `emoji-catalog.ts:20-40`（emoji，另开 T90）。**本单只做 mermaid + KaTeX**，pdf 记 queue 提议。

## 方案（搬运阶梯第 1 级：在维护的 npm 上游）
- 依赖 `mermaid`、`katex`（npm，均在维护：mermaid 最近发版 2026-11、katex 2026-10）。锁**精确版本**，取发布满 14 天的最新版。
- 用 Vite 正常的动态 `import('mermaid')` / `import('katex')`，让 Vite 产出自己的懒加载 chunk（同源 `'self'`，过现有 CSP：`app/ui/main/index.ts:46-53`、`frontend/index.html:8`）。不联网、不拷 0.18/0.78.1 文件。
- KaTeX 的 CSS 一并引入（`katex/dist/katex.min.css`），字体走打包（CSP `font-src 'self' data:` 已允许）。
- **上游零改动**：`frontend/src` 下文件受 `pnpm check`（`scripts/check-upstream.mjs`）锁定。改动走 `overrides/modules/` + `overrides/vite.config.ts` 的 `MODULE_OVERRIDES` 两行。优先「re-export 上游 + 只换加载函数」；如果加载函数是模块内部调用、包一层够不到，就整模块复制（先例 T24 `character.tsx`），文件头写 `来源: grok-bot-0.18-reconstructed@a9f633e:<path>`，只改 import 那一处。
- mermaid 主题跟随亮暗（看上游 mermaid.tsx 有没有传 theme；有就照上游，没有不新增）。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（合并后要 `pnpm build` 再回测；DPR2 截图口径）
2. 上面列的四个文件；`app/ui/tests/e2e/markdown.spec.ts`（`rt.writeScriptCalls` + `textCall` 造回复的写法照抄）
3. 证据图 `work/persona-stop-gap/evidence/T80b/run3.light.png`

## 边界
1. 只动：`app/ui/renderer-grok/package.json`（+ lockfile）、`overrides/vite.config.ts`（MODULE_OVERRIDES 加行）、`overrides/modules/` 下新建 mermaid / math 覆盖模块、新 e2e `app/ui/tests/e2e/t89-rich-render.spec.ts`。别的不碰。
2. **先写失败测试**：t89 spec 先在当前主线跑，① mermaid 格应红（出现 `.sand-mermaid-error`），② KaTeX 格应红（无 `.katex` 节点），贴原样输出进回执。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。只跑下面列的 spec，不跑全量 e2e。
4. 与 T90 同改 `MODULE_OVERRIDES` 和 `package.json` 相邻行：后合并的那张做三方合并，不得整文件覆盖。
5. 只在 feat/T89 提交；经理验收后才合并。

## 验收（写命令，不写感觉）
1. `cd app/ui/renderer-grok && pnpm check` → `upstream diff=0: N files`，exit 0
2. `cd app/ui/renderer-grok && pnpm build` 后，`ls .build/frontend-shell/assets | grep -iE 'mermaid|katex'` → 至少各一个 chunk 文件
3. `cd app/ui && npx playwright test tests/e2e/t89-rich-render.spec.ts` → 全部 passed，其中：
   - ① 回复含 ```` ```mermaid\ngraph TD; A-->B ```` → 气泡内 `.sand-mermaid svg` 存在，且 svg 内能找到文本 `A` 和 `B`；`.sand-mermaid-error` 数量 = 0
   - ② 回复含行内 `$E=mc^2$` 和块级 `$$\int_0^1 x\,dx$$`（按上游 math.tsx 实际支持的分隔符写，先读代码）→ `.katex` 节点 ≥2，`.katex-error` 数量 = 0
   - ③ 非法 mermaid（如 ```` ```mermaid\ngraph TD; A--> ````）→ 仍出上游的 `Couldn't render this diagram.`（证明失败分支没被拆掉，红字只在真非法时出现）
   - ④ 整个 spec 期间 `page.on('requestfailed')` 收集的失败请求里没有 mermaid/katex 字样
4. 亮暗各一张 DPR2 截图（mermaid 图 + 公式同屏）存 `work/persona-stop-gap/evidence/T89/`，回执写每张图应确认的点（图形有节点连线、暗色下文字可读、公式不是原文）
5. 回测 `npx playwright test tests/e2e/markdown.spec.ts` → passed（markdown 主路径不回退）

## 为什么这样验收
- 要保住的是「用户看到的是图和公式」，所以断言落在渲染出的 `svg` 文本和 `.katex` 节点上，不是「没报错」——没报错也可能是什么都没渲染。
- ③ 防止施工为了消红字把错误分支整个删掉；④ 防止「本机 DEV 能跑、产物 404」再次发生——spec 跑的是产物（launchProduct）。
- 第 2 条证明 chunk 是构建产出的，不是从某个本机目录偷偷读的。

## 产出
- `overrides/modules/mermaid.tsx`、`overrides/modules/math.tsx`（或等价命名）、`overrides/vite.config.ts` 两行、`package.json` 两个依赖
- `app/ui/tests/e2e/t89-rich-render.spec.ts`
- `work/tickets/receipts/T89.receipt.md`（含先红后绿原样输出、产物 chunk 列表、截图确认点）
