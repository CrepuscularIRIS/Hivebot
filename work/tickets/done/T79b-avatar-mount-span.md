# T79b：bot 头像整片空白（P0-2）

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：`work/ui-quality/T79-TOUR.md` P0-2；queue 2026-11-14 节第 18 行拆单；T88/T88b 遗留
> 分支 / 作业目录：feat/T79b @ /tmp/bot-wt/T79b（起点＝集成分支 docs/rebuild-p6-p5-plan 当前 HEAD）
> 并行：与 T79a 文件不相交，可同时施工
> claimed：2026-11-16 主 agent（GLM 5.3）feat/T79b
> accepted：2026-11-16 feat/T79b @ 75066377（经理任务 B）

## 目标
侧栏、会话头、palette、状态行里每个 `.sand-grok-bot-mark` 都画出彩色吉祥物（idle 也画），和 0.78.1 每行都有头像一致。

## 现象（证据，原样引用 T79-TOUR）
- `evidence/T79-tour/probes-b.json` `avatar`：4 个 mark（侧栏 ×2 36×36、会话头 16×16 / 24×24），全部 `state:"idle"`、`err:null`、`svg:1`、canvas `getImageData` 不透明像素 `ink:0`。`html` 字段：`<canvas width="28" ...><svg ... id="sand-agent-mark-source-session-…">` —— **svg 是 `<canvas>` 的子节点**。
- `sidebar-rows.*.png`、`multiselect.*.png`、`more-menu-userLast.light.png`：侧栏行头像位、会话头药丸左侧都是空的，亮暗、选中与否都一样。
- T88e 拼版 `work/session-presence/evidence/T88/mascot-vs-0781.light.png` 右半：侧栏、头部也空，**只有状态行（thinking）画出来**。
- 原版：`work/grok-0.79.3-re/ref/conv-done.light.png` 侧栏三行与头部药丸都有彩色吉祥物。

## 经理已查到的根因（高置信，施工方先复核再动手）
引擎 `attach({host, canvas})` 里的 `canvas` **不是 HTML `<canvas>`，是一个挂 svg 的容器**：
- 引擎侧：`app/ui/renderer-grok/assets/vendor-078/index.eager-common-DbK3Oi_r.js` 约 @362364 前，`p=()=>{let e=c?.canvas ... e_(e, Xg(...))}`，`e_` 做的是 `e.replaceChildren(svg)` —— 把 svg 直接塞进 `canvas` 参数那个元素。
- 0.78.1 包装（`dT` 的上游组件 `mM`）：`work/grok-1.1.0-re/deb0781/asar/dist/renderer/assets/index.eager-platform-C2su3Zzb.js` @519603：`O.attach({host:e,canvas:t})`，其中 `t` 是 `jsx("span",{ref:T,style:pM(fill)})`，`pM` = `{position:absolute,left:50%,top:50%,width:${s(fill)*100}%,height:同,transform:translate(-50%,-50%),pointerEvents:none}`；外层 host 是 `span`，`fM(size)` = `{display:inline-block,position:relative,flexShrink:0,width/height:size,lineHeight:0}`。
- 我们：`app/ui/renderer-grok/overrides/modules/agent-avatar.tsx:129` 渲染的是 `<canvas ref={canvasRef}>`，svg 塞进 `<canvas>` 只算 fallback 内容，浏览器不画 → 全空。T88b 第二轮当时只修了「不传 canvas 就不建 svg」，把参数名当成了真 canvas；T88 闸门 `tests/e2e/t88-mascot-engine.spec.ts:21` 也用 `<canvas id=cv>`、只数 svg 个数，所以一直没暴露。

## 需要施工方解释的矛盾（写进回执，不解释清不算完）
1. **状态行为什么在 T88e 拼版里画出来了？** 状态行（`overrides/modules/transcript.tsx:76`）走的也是同一个 `PersonaMark`，按上面根因也该空。查：那张拼版是什么提交、什么产物拍的（产物 mtime vs 提交）；或者状态行那块其实画出来的不是 mark。对不上就说明根因不止一个，停下写回执。
2. **idle vs 非 idle 消费路径差异**：侧栏 `sidebar.tsx:117/:297`、会话头 `chat-header.tsx:26` 传 `currentActivity/isRunning/...` 由 `personaStateFromAgent` 推状态（idle）；状态行固定传 `isRunning`（working/thinking）。引擎 `isResting:!i()`、`C()` 的 rAF 循环在 `!i()&&a.isSettled` 时停帧——确认修好挂载点后 idle 首帧会画（`attach→m()→p()` 同步画一次），不依赖 rAF；若 idle 仍不出图再查 `go(...).setResting`。
3. **shim `agents.ts` shape/color 恒 null 的旧坑复查**：`shim/src/agents.ts:49-50` `avatarShape/avatarColor: input.avatarShape ?? null`，未选形象时为 null → `resolvePersonaColor/Shape(agentId, null)` 按 agentId 哈希回落。核：同一 bot 在侧栏 / 会话头 / 状态行三处传入的 `agentId` 是否同一个值（侧栏 `avatar.agentId` vs 头部 `agent.id` vs 状态行 `activeAgent.id ?? ''`——状态行空串回落会让颜色/形状和另两处不同），探针打出三处 `data-avatar-color` / `data-avatar-shape`，回执贴。不一致 → 记存疑项，**不在本单修 shim**（另开单）。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（L134、L188）
2. `done/T88b-mascot-engine-fix.md`「第二轮终验」节（canvas 参数那段来龙去脉）
3. 上面三个锚点文件对应偏移

## 边界
1. 只动：`app/ui/renderer-grok/overrides/modules/agent-avatar.tsx`（`PersonaMark`：挂载点改成 0.78.1 `mM` 同形——内层 `span` 按 `pM(fill)` 定位、外层 host 按 `fM`，attach 照旧传 `{host, canvas: 内层span}`；注释写锚）；新建 `app/ui/tests/e2e/t79b-avatar-ink.spec.ts`；`tests/e2e/t88-mascot-engine.spec.ts` 闸门 gate.html 的 `<canvas id=cv>` 同步改为 `<span>`（只改这一处，与产品同口径）。shim、sidebar、chat-header、transcript 不碰。
2. 先写失败测试（当前 HEAD 跑红，贴输出）：
   - ① 侧栏 idle 行、会话头的每个 `.sand-grok-bot-mark`：内部 `svg` 存在、`svg.closest('canvas') === null`、`svg.getBoundingClientRect()` 宽高 > 0（被真正布局 = 真正绘制）。
   - ② 墨量：页内把该 svg `XMLSerializer` 序列化 → `Image` → 画到离屏 canvas → `getImageData` 数 alpha>10 的像素，`> 0`（防「svg 在但是空图」）。
   - ③ 防空过：断言前 `expect(marks).toHaveCount(≥2)`，且至少 1 个 `data-grok-state="idle"`。
   - 截图：侧栏 + 会话头亮暗各一张，与 `work/grok-0.79.3-re/ref/conv-done.light.png` 拼版（同风格 `mascot-vs-0781`），放 `work/ui-quality/evidence/T79b/`。**截图亲检交给经理验收**（主 agent 不调 analyze_image），回执写每张图的确认点：侧栏每行左侧有彩色形状、头部药丸左侧有形状、颜色亮暗都可见。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。
4. 凭证不进代码、文档和日志；只在 feat/T79b 提交。

## 验收（写命令，不写感觉）
1. `cd app/ui && pnpm build && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh t79b-avatar-ink.spec.ts` 两连 → 全过
2. 红证：修前 HEAD 同 spec 失败输出（① `closest('canvas')` 非空或 rect 0×0）
3. 回归：`sh scripts/run-e2e.sh t88-mascot-engine.spec.ts t96-multiselect.spec.ts`（t96 实际文件名以 `ls tests/e2e | grep t96` 为准）→ 全过；t88 A 段在 span 挂载下 svg 建立 + thinking 动画仍成立
4. 引擎原件未改：`git diff <起点>..HEAD -- app/ui/renderer-grok/assets/vendor-078/` 为空
5. `git diff <起点>..HEAD --stat` 只含边界 1 的三个文件
6. 回执回答「需要解释的矛盾」1-3，各附命令输出

## 为什么这样验收
T88 的检查数的是「svg 有没有」，于是 svg 躲在 `<canvas>` 里不画也一路绿了两轮——这次必须断「真被布局、真有墨」。① 断不在 canvas 里 + 有尺寸，② 断有墨，两条缺一都会再次假过。矛盾 1 必须解释：如果状态行当时真画出来了，说明还有第二条路径，修一半等于没修。

## 产出
- `app/ui/renderer-grok/overrides/modules/agent-avatar.tsx`、`app/ui/tests/e2e/t79b-avatar-ink.spec.ts`、`app/ui/tests/e2e/t88-mascot-engine.spec.ts`（gate 一处）
- 回执 `work/tickets/receipts/T79b.receipt.md`、拼版 `work/ui-quality/evidence/T79b/`

## 经理验收（2026-11-16，任务 B）
- 重跑（worktree 重 build）：t79b 两连 1p/1p；t88+t96 回归 5 passed；`git diff 22e792c2..feat/T79b -- …/vendor-078/` 空；diff 只 3 文件（边界 1）。
- 拼版亲检：`evidence/T79b/avatar-vs-0781.{light,dark}.png`（左 conv-done.light 参考、右我们）+ `ours-zoom.{light,dark}.png`：侧栏 Beta/Alpha/New chat 三行左侧都有彩色形状（灰 squircle/橙 wedge/红棕 blob），头部「Alpha」药丸左侧橙色形状，亮暗都清楚；大小与参考同量级。`mgr-marks.json`：5 个 mark 全 idle、svg=1、canvas=0；侧栏 Alpha 与头部同 color/shape。
- 三问答核：①状态行确是 `overrides/modules/transcript.tsx:12` 直 import 上游 0.18 `agent-avatar`（LEARNINGS L202「modules 内 importer 不替换」）——成立；T88 引擎没接到状态行，**要开单**（见 queue 18e），不在本单修。②idle 首帧有墨由 t79b 断言实证——成立。③侧栏/头部一致——成立；状态行 `activeAgent.id ?? ''` 一致性待 18e 接上引擎后一起核。
- 结论：**通过**。
