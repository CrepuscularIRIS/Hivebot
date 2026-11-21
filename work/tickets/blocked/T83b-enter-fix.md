# T83b：T83 三批修复——reduced keyframes 缺失（假过）+ 换会话历史行误入场 + 两条遗留弱点

> **2026-11-15 经理终验**：①③④ 通过；② 会话门未生效（effect 依赖缺 activeAgent.id）→ 转 T83c。本单随 T83c 一起进 done。

> 来源：2026-11-15 经理终验 T83 三批（feat/T83-batch3 @91c366e4）不通过。分支续在 /tmp/bot-wt/T83c。
> 边界：只动 `app/ui/renderer-grok/overrides/p5-55-layout.css`、`app/ui/renderer-grok/overrides/modules/transcript.tsx`、`app/ui/tests/e2e/t83-enter3.spec.ts`、`app/ui/tests/e2e/t83-enter.spec.ts`。

## 问题（已核实）

1. **reduced 版 keyframes 不存在**：p5-55-layout.css:413 引用 `t83-enter-fade-reduced`，全仓 grep 无 `@keyframes t83-enter-fade-reduced`（只有 `t83-status-fade-reduced` @422）。后果：reduced 下没有任何 opacity 动画；`animationend` 永不触发，`data-enter` 永久残留；之后用户关掉 reduced，这些旧行会按 `t83-enter-msg` 重播。spec ④ 只量 computed `animationName`（未定义的名字也照样回报）→ 假过。
2. **换会话的历史行会被当新行**：observer effect 依赖只有 `[isMainLine]`，ProductionRenderer:3516 的 `<ConversationTranscript>` 无 key，切会话不重挂载；新会话的历史行进 DOM 时不在 `seen` 里、boot 门已开 → 全部入场。同理首次打开有历史的会话、历史在 boot rAF 之后才异步到达时也会全量入场。违反三批规格「历史加载的行不打」。
3. 三批节点名的遗留弱点没做：t83-enter.spec.ts 状态行 reduced 断言仍包在 `if (count>0)` 里；shimmer 底字 alpha≈0.6 断言未做。
4. spec ① 只断言「有 data-enter 或名字含 t83-enter」，未断言工单要求的 fill=backwards、duration=.24s、timing=cubic-bezier(.22,1,.36,1)；`dataset.enteredSeen` 分支是死代码（全仓无人设置），删掉。

## 做法（最小）

- 补 `@keyframes t83-enter-fade-reduced { 0% { opacity: 0 } to { opacity: 1 } }`。
- 会话门：effect 依赖加 `activeAgent.id`（切会话时 seen 清空、boot 门重置），并且「新」只认本会话 boot 之后**本地发送或流式到达**的条目——施工方二选一并在回执写理由：(a) boot 门改为等首批 entries 落稳（例如 props.entries 首次非空后的下一帧）；(b) 记录 boot 时刻，只给 `createdAt > boot` 的条目打标。不要再走 entries-diff 多实例路线。

## 先红的测试（t83-enter3.spec.ts 增补）

- ④' reduced：`@keyframes` 真实存在——在页面里遍历 `document.styleSheets` 找 `CSSKeyframesRule.name === 't83-enter-fade-reduced'`，必须找到且只含 opacity；并断言 reduced 新行在 1s 内 `data-enter` 被移除（animationend 真触发）。现状应红。
- ⑤ 换会话：建第二个有 ≥2 轮历史的会话（runtime 侧预写或先在 B 里发两条），从 A 切到 B 后 600ms 内 B 的所有 `.sand-transcript-row` 都**从未**带 `data-enter`（用页面里提前装一个 MutationObserver 记录 attributes 变化，不靠事后量 computed）；再在 B 里发一条，这条要入场。现状应红。
- ① 补断言：新行 computed animationName=t83-enter-msg、animationDuration=0.24s、animationTimingFunction=cubic-bezier(0.22, 1, 0.36, 1)、animationFillMode=backwards（在 data-enter 存在期抢测；抢不到就用同样的预装 observer 记录 + 对 CSS 规则文本断言）。
- t83-enter.spec.ts：状态行 reduced 断言去掉 `if (count>0)`（用 fake runtime 卡 thinking 保证状态行在）；shimmer 底字 alpha 断言 0.6±0.05。

## 验收

```
cd /tmp/bot-wt/T83c/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t83-enter3.spec.ts   # 1 passed
CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t83-enter.spec.ts tests/e2e/t91*.spec.ts          # 2 passed
```
回执贴先红输出（④'、⑤ 至少各一处红）再绿输出。

## 为什么这样验收

要保住的是「只有本次会话新到的消息动一下，任何已有消息永不动」。量 computed 名字证明不了动画真在跑（这次就假过了）；事后量 none 也证明不了「从未动过」——所以用预装 observer 记录属性历史，并直接检查 keyframes 规则存在。

## 记档裁决（三批的虚拟化风险）

接受记档：`.sand-virtual-transcript` 只是类名，recovered transcript.tsx 为 entries 全量 map、无 slice/overscan 窗口化（经理 grep 复核）。observer 的 `seen` 集合也保证同 id 回收重挂不重播。若将来引入窗口化，风险是「首次滚入视口的历史行被当新」——届时改 id/时间戳白名单（做法 (b) 天然覆盖）。

> 2026-11-15 经理：随 T83 三批挪 blocked（T83d 终验 2/3），不合并。
