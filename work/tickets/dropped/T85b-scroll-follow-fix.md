# T85b：滚动跟随返修——长回复跟底尾差 + pill 居中错位
> 状态：2026-11-15 验收不过，被 T85c（重规划）取代

> 开单：manager (Opus 5.5) | 日期：2026-11-15 | 施工：main (GLM 5.3)
> 来源：T85 验收不通过（receipts/T85.receipt.md 尾「经理验收」）
> 分支 / 作业目录：feat/T85 @ /tmp/bot-wt/T85（续在同分支提交）
> claimed：
> accepted：

## 目标
长回复后真正停在底部并持续跟随流式；钮/pill 居中于对话列而不是整个窗口。

## 动手前先读
1. work/LEARNINGS.md（fixed/transform、wrapper 高塌那几条）
2. work/grok-0.79.3-re/RE-MOTION-0.78.1.md §1.7（`distanceFromBottomPx>80`；跟随 = 新消息 `scrollToBottom()`，`scrollToEntry(id,'smooth')` 才是 smooth）
3. app/ui/renderer-grok/overrides/modules/transcript.tsx（T85 段）、p5-55-layout.css 尾

## 问题（经理实证）
1. **尾差不是测试问题，是产品缺陷。** spec ① 在 6 条长回复后要 `s.scrollTop = s.scrollHeight` 手动补底才能断言「贴底无钮」——即不补时用户停在距底 ~210px、且「Jump to latest」钮亮着。根因：跟底用 `scrollTo({behavior:'smooth'})`，目标是调用当刻的 scrollHeight；动画途中内容继续长，下一次 MutationObserver 回调里 `atBottom` 按动画中的 scrollTop 算 >80 → 判为「用户已离底」不再跟，最终卡在半路。回执「用户最终到底」不成立。
   修法方向（施工自定）：跟底改 instant（`scrollTop = scrollHeight`，原版 scrollToBottom 语义），或用「用户主动滚动」维护 stick 状态而非 mutation 后现算距离。
2. **pill 横向错位。** `.sand-jump-to-latest{position:fixed;left:50%}` 以整窗口居中；截图 evidence/T85/jump-btn.light.png 里钮在 x≈640，对话列中心 ≈780（侧栏 280px），压在气泡文字上。应以对话列居中（sticky/absolute 于列容器，注意 LEARNINGS 的 transform 坑）。
3. 滚动监听 effect 依赖 `[isMainLine]` 只在挂载时 querySelector 一次；若切会话时 `.sand-virtual-transcript` 被重挂，监听丢失。施工先用测试确认是否重挂；重挂则需跟随重绑，不重挂则回执写明证据即可。

## 边界
1. 只动：transcript.tsx（T85 段）、p5-55-layout.css（T85 段）、tests/e2e/t85-scroll.spec.ts。
2. 先写失败测试：**删掉 spec ① 的 instant 补底那行**，看它红（距底 ~210 / 钮可见）；再修到绿。新增断言：钮 boundingBox 中心 x 与 `.sand-virtual-transcript` 中心 x 差 <8px。若问题 3 成立，加「切会话再切回→滚上>80 出钮」一格。
3. 测试隔离 HOME/TMPDIR/DBus；不跑全量。

## 验收
1. `cd /tmp/bot-wt/T85/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t85-scroll.spec.ts` → 1 passed，且 spec 内**无任何手动 scrollTop 赋底**（`grep -n 'scrollTop = s.scrollHeight' tests/e2e/t85-scroll.spec.ts` 空）
2. 回归 `t83-enter.spec.ts` → passed；合并后在主线补跑 t81h 热键 spec（T85 分支早于 T81h，worktree 内无该 spec）
3. 截图 evidence/T85/jump-btn.light.png 重拍：钮在对话列正中、不压正文可读

## 为什么这样验收
目的是「用户发完消息、看着长回复流出来，始终贴着底」。旧 spec 用补底把这个目的绕过去了，所以验收第 1 条要求 spec 不得手动补底。

## 产出
- transcript.tsx / p5-55-layout.css / t85-scroll.spec.ts 改动；receipts/T85b.receipt.md
