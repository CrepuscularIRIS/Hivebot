# T79a：行时间戳浮层脱锚（P0-1）

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：`work/ui-quality/T79-TOUR.md` P0-1；queue 2026-11-14 节第 18 行拆单
> 分支 / 作业目录：feat/T79a @ /tmp/bot-wt/T79a（起点＝集成分支 docs/rebuild-p6-p5-plan 当前 HEAD）
> 并行：与 T79b 文件不相交，可同时施工
> claimed：2026-11-16 主 agent（GLM 5.3）feat/T79a
> accepted：2026-11-16 feat/T79a @ a6724322（经理任务 B）

## 目标
notice / timeline-event 行上的 `<time class="sand-row-timestamp">` 不再停在视口固定位置、不再叠在别的消息正文上；默认不可见、贴在自己那一行，和 0.78.1 一样。

## 现象（证据，原样引用 T79-TOUR）
- `work/ui-quality/evidence/T79-tour/more-menu-userLast.light.png`：「2:56 AM」孤零零停在 css 约 (306,270)，靠左，不属于任何一行。
- `work/ui-quality/evidence/T79-tour/jump.dark.png`：同一视口位置 (306,270)，两条时间戳叠成「2:56/2:57 AM」重影，压在长回复正文上。滚动位置不同、落点相同 → 定位基准不是行。
- 原版锚：`work/grok-0.79.3-re/ref/conv-done.light.png` 只有居中日期分隔，行上看不到时间戳。

## 经理已查到的嫌疑面（施工方先逐条核实，写进回执）
1. **元素来源**：不是 hover 条，是 `frontend/src/recovered/features/conversation/cards/timeline-event.tsx:8-15` 的 `TranscriptCardTimestamp`，被 `cards/notice/view.tsx:13`、`timeline-event-automation.tsx`、`timeline-event.tsx` 自身三处用。截图里那两条来自 stop / supersede 的 notice 行（「Bot 已停止手头的事。」，T81a/T81b 带来的）——所以是 T81 系第一次让 notice 行在日常会话里大量出现，问题才露出来，不是 T83/T85 改坏的（施工方用 `git log -S` 确认一下 T83/T85 有没有碰 `.sand-transcript-row` 的 position，回执写结论）。
2. **类名里的原子规则在我们 css 里缺了一半**：0.18 树 `features/computer/shell/view.css` 只有 `sand-10l6tqk`(absolute) / `13vifvy`(top:0) / `1ey2m1c`(bottom:0) / `1lqa7cf`(padding-left:10) 等；**缺** `sand-3m8u43{right:0}`、`sand-v4fu3i{opacity:var(--sand-ts-progress,0)}`、`sand-o5v014{line-height:1}`、`sand-ss6m8b{tabular-nums}`，`sand-5ss5yg` 我们两边都没查到值（施工方去 `work/grok-1.1.0-re/deb0781/asar/dist/renderer/assets/*.css` 和 `index.eager-app-iGTgHP_Q.js` 再找一次，查不到写明）。缺 `opacity` → 永远可见；缺 `right:0` → 落到左边。
3. **定位基准**：`top:0;bottom:0` + `align-items:center` 后落在 transcript 视口竖直中线附近（y≈270），说明最近的定位祖先是 transcript 容器而不是行 → `.sand-transcript-row`（notice/view.tsx:11 那个 div 只有裸类名）没有 `position:relative`。0.78.1 由 Lpt 行边界给行加原子（0.18 证据注释 `index-UbX-y3il.js#byteOffset=5249131`）。施工方核：虚拟列表行外层（transform 定位）是否也该是基准、0.78.1 的 relative 落在哪一层。
4. 原版揭示方式：0.78.1 `index.eager-app-iGTgHP_Q.js` @2686164 附近 `--sand-ts-progress` / `--sand-ts-peek` / `data-peeking`——横向「拨开」手势时才逐渐显出。**本单不做拨开手势**（见边界 4）。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（L134 overrides 不做类型检查、L188 改完先 build 再跑 e2e）
2. 上面 4 条嫌疑面的文件与锚点；`work/ui-quality/harness/t79c.spec.ts` L34-45（怎么造出两条 notice 行）

## 边界
1. 只动：`app/ui/renderer-grok/overrides/p5-55-layout.css`（末尾追加 `/* T79a · 行时间戳 */` 段：补缺的原子值 + 行 `position:relative`，按 0.78.1 原值，注释写锚）；新建 `app/ui/tests/e2e/t79a-row-timestamp.spec.ts`。不碰 recovered 树、不碰 transcript.tsx（T79c 要碰）、不碰 agent-avatar（T79b）。修法只在共享层（css 选择器打 `.sand-row-timestamp` / `.sand-transcript-row`），不按调用方逐个补。
2. 先写失败测试（在当前 HEAD 上跑红，贴输出）：
   - ① 造 ≥2 条 notice 行（照 t79c 的 supersede 流程，或任一能稳定产出 notice 的 fake 脚本），**鼠标移到 transcript 上**；对每个 `.sand-row-timestamp`：`getComputedStyle(el).opacity === '0'`（静止不可见，原版口径）。
   - ② 每个 `.sand-row-timestamp` 的 rect 竖直范围落在它 `closest('.sand-transcript-row')` 的 rect 内（容差 1px）；且 `el.offsetParent === el.closest('.sand-transcript-row')`（或回执里核实后的那一层，写明）。
   - ③ 任意两条时间戳 rect 不相交。
   - ④ 防空过：①-③ 循环前 `expect(count).toBeGreaterThanOrEqual(2)`；滚动 transcript 300px 后 ② 再断一次（证明跟着行走，不跟视口）。
   - 截图：亮暗各一张 hover transcript 的会话（`work/ui-quality/evidence/T79a/`），与 `jump.dark.png` / `more-menu-userLast.light.png` 同场景，亲眼确认看不到浮着的时间戳。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。
4. **不做**拨开手势（--sand-ts-progress 驱动）。时间戳在原版是手势揭示的；我们只修到「不脱锚、静止不可见」。手势记 queue 提议。
5. 凭证不进代码、文档和日志；只在 feat/T79a 提交。

## 验收（写命令，不写感觉）
1. `cd app/ui && pnpm build && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh t79a-row-timestamp.spec.ts` 两连 → 各 `1 passed`（或单内格数全过）
2. 红证：回执贴修前 HEAD 上同 spec 的失败输出（至少 ① 或 ② 失败，报出 opacity 1 / rect 越界的实测值）
3. 回归：`sh scripts/run-e2e.sh t81a-supersede.spec.ts t85-scroll.spec.ts t91-reaction.spec.ts` → 全过（notice 行、滚动跟随不受影响；给行加 `position:relative` 会改变行内其他 absolute 子元素——reaction pills / hover 条——的基准，t91 专门守这一处。若 relative 只能加在 notice/timeline 行上而不影响消息行，回执写明选择器取舍）
4. `git diff <起点>..HEAD --stat` 只含边界 1 的两个文件
5. 截图亮暗两张在 `work/ui-quality/evidence/T79a/`，回执写每张看到了什么

## 为什么这样验收
用户看到的是「时间戳飘在别人的话上」。① 保住静止不可见（原版口径），② ③ 保住「属于自己那一行、互不重叠」，④ 的滚动复断专门防「只是碰巧落在行里」——脱锚的特征就是滚动后位置不变。只断 opacity 会让「藏起来但仍脱锚」蒙混过关，以后一旦做拨开手势又会重现，所以 ② 必须独立成立。

## 产出
- `app/ui/renderer-grok/overrides/p5-55-layout.css`（T79a 段）、`app/ui/tests/e2e/t79a-row-timestamp.spec.ts`
- 回执 `work/tickets/receipts/T79a.receipt.md`（含嫌疑面 1-3 核实结论、红证、截图说明）

## 经理验收（2026-11-16，任务 B）
- 重跑（worktree 重 build）：t79a 两连 1p/1p；t81a+t85-scroll+t91 回归 4 passed。diff 只 2 文件（p5-55 末段 10 行 + 新 spec）。
- 四原子 + `.sand-transcript-row{position:relative}`：消息行虚拟行（recovered transcript.tsx:764）无 absolute/transform 类，relative 不改布局；hover 条有更近的 anchor（Sol 同结论）。
- 截图：spec 自拍的 `notice-ts.*.png` **无效**（拍在注入 30 行填充并滚动之后，画面只有 t79a-fill-*，看不到 notice 行）。经理补拍真场景：`evidence/T79a/mgr-notice-hover.{light,dark}.png`——两条「Bot 已停止手头的事。」notice 行 + 长正文，hover 时无任何浮着的时间戳；`mgr-notice-forced-visible.dark.png`（手动 `--sand-ts-progress:1`）三条时间戳各贴自己那行右缘、互不叠；`mgr-probe.json` ts.y=row.y、opacity 0。
- 结论：**通过**。spec 截图位置的小毛记 queue 提议（下次碰 t79a spec 时挪到注入填充之前），不单独返修。
- 顺带观察（非本单）：hover 条（emoji/More）落在 notice 文字上（mgr-notice-hover 图中「Bot 已停止手…」被遮），属 T79c 浮层定位范围。
