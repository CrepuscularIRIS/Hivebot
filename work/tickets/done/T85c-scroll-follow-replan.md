# T85c：滚动跟随重规划（T85→T85b 两次不过，任务 C）

> 开单：manager (Opus 5.5) | 2026-11-15 | 施工：main (GLM 5.3)
> 分支：feat/T85 @ /tmp/bot-wt/T85（续提交）
> claimed：2026-11-16 main @ d803cc7b
> accepted：2026-11-16 manager @ 944eb409（两连 1p×2、t83 1p、grep② 空、截图亲检、Sol 探针全程 d=0；spec ④ 空断言转 T85d）

## 根因
1. 跟底只靠 MutationObserver childList；不增删节点的长高（statusline 弹入、margin、过渡）不触发 → 停在距底 94/222。
2. 钮 absolute 挂在滚动容器里，会随内容滚走。

## 方案（施工自定细节）
1. stick 状态由用户 scroll 事件维护（距底 <80 = stick，与出钮阈值同为 80）；跟底用 ResizeObserver 观察 scroller 内容（或其第一个子节点），stick 时 `scrollTop = scrollHeight`。删掉 300 阈值。
2. 钮放在 scroller 的**兄弟**位置（父容器 position:relative + absolute 居中），或者在 scroller 内用 `position:sticky; bottom`。不要放在 scroller 内 absolute。

## 边界
只动 transcript.tsx（T85 段）、p5-55-layout.css（T85 段）、t85-scroll.spec.ts。先改 spec 跑红。

## 验收
1. `cd /tmp/bot-wt/T85/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t85-scroll.spec.ts` 两连 1 passed
2. `grep -n 'scrollTop = s.scrollHeight' tests/e2e/t85-scroll.spec.ts` 为空；6 条长回复后**直接**断言 `scrollHeight-scrollTop-clientHeight < 2` 且无钮（不先补底）
3. 居中断言放在**距底约 300**（不是 scrollTop=0）的位置：钮 boundingBox 在 scroller 可视矩形内，中心 x 与列中心差 ≤8
4. 新增一格：距底 150 时流式继续，scrollTop 不变（不拽回）
5. 回归 t83-enter 1p；截图 jump-btn.light.png 重拍并亲检

## 为什么这样验收
两次都是 spec 只在「碰巧没事」的位置断言（补底之后、scrollTop=0）。这次三条断言都放在原先出问题的状态上。
