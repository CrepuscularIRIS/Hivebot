# T83：会话区动效（状态行 shimmer + 消息入场 + 锚点闪，G1/P0；typing 三点已删，见修订）

> 开单：manager (Opus 5.5) 排法 + main 落单 | 日期：2026-11-13 | 施工：main (GLM 5.3)
> 来源：work/grok-0.79.3-re/RE-MOTION-0.78.1.md §1（G1 组）；done/T82-audit-motion-behavior.md「经理定的施工排法」
> 分支 / 作业目录：feat/T83 @ /tmp/bot-wt/T83
> claimed：三批完工（feat/T83-batch3，MutationObserver 路线，四格绿）d1880353 @ /tmp/bot-wt/T83（第一批=第 2 项 shimmer）
> accepted：第一批（第 2 项）机械验收通过 2026-11-14 @d1880353，放行合并；第 2 项收口还差回执+亮暗截图拼版（见下）；第 3/4 项未做，本单留 doing
>
> **2026-11-14 经理终验（第一批）**：t83 spec 1 passed；回归 t68/t74 各 1 passed；改动只 3 文件（status-line.css / transcript.tsx 加 data-text / 新 spec），在边界内。裁决=分批通过。第 2 项收口前补：①回执 `receipts/T83.receipt.md`（含 isShimmering 恒开、reduced-motion=停底字 的 0.78.1 锚点原文——本单第 5 条说原版降级是纯 opacity 版，shimmer 的降级要锚点证明）；②亮暗截图拼版（验收 2，高光色用了 `--sand-text-secondary`，须证明中段比底字深，和原版 "Digging around" 一致）；③spec 底字断言 `/color\(srgb|rgba?\(/` 任何颜色都能过，第二批时改成断言 alpha≈0.6
> blocked：2026-11-15 等「t83-enter3 ① 段改 observer 记录法 + 5 连全过」；三批代码在 feat/T83-batch3 @b345fac2（/tmp/bot-wt/T83c），不合并。二批 @dbd3c18d 已放行，照常合。

## 目标
会话区四个最高频动效对齐原版：typing 三点浮动、流式 text-shimmer 扫光、消息入场双段、跳转锚点闪烁。原版锚点全在 RE-MOTION §1（逐值参数表），施工前把对应行的 computed 读数补齐（报告局限：99/147 从 JS 配对，`?` 项要实测）。

> **2026-11-13 经理修订（session-presence 立项）**：原第 1 项 typing 三点**删除**——T23 已让三点退役（`overrides/modules/transcript.tsx:112`），现在没有任何地方渲染它，给它加动画等于做给死代码。原第 2 项 shimmer 的目标定死为**状态行短语**，这是用户点名「thinking 部分在动」的另一半（另一半吉祥物变形见 T88）。

## 做法（每项：原版参数抄 RE-MOTION 对应行，不自己发明）
1. ~~typing 三点~~（删，见上）
2. **状态行短语 shimmer**：0.78.1 状态行文字组件用 `Wx`，渲染 `sand-shimmer-text`（app `index.eager-app-iGTgHP_Q.js` @704488）。状态行 label 传 `isPaused:!isShimmering`（@2430541，`sand-activity-label__text`）。时长 token `shimmerDuration:1400ms`（@679914）。keyframes / 渐变取 `index-Dh7EWA8t.css` 里 `sand-shimmer-text` 对应的原子类，查不到的部分走 RE-MOTION §1 shimmer 行。挂到我们的 `.sand-status-line` 文字节点上（`overrides/status-line.css` + `overrides/modules/transcript.tsx` 加 class）。`isShimmering` 什么时候为真，读 `$Ht` 调用处确定，不要猜。reduced-motion 按原版降级。
3. **消息入场**：`data-enter=new` 双段（scale .985 + ty 12px，cb(.22,1,.36,1)）——挂载 class 在 transcript 挂载链
4. **锚点闪**：跳转锚点 box-shadow 脉冲 + 1.6s anchor-flash；hover 动作钮背景闪（2.5s）
5. 每项带 **reduced-motion 降级**（原版=换纯 opacity 版，不是 animation:none）

## 边界
1. 只动 CSS + transcript 挂载 class；不动 JS 行为（滚动跟随 T85 单开）
2. 与 T76（字阶）文件不相交，可并行
3. 每处参数以 RE-MOTION 表为准；表里 `?` 的先补 computed 读数（Xvfb probe）再抄
4. reduced-motion 每项同批做，不留大单

## 验收（写命令，不写感觉）
1. e2e spec（DPR2 亮暗）：每动效一处——computed animationName/duration/timingFunction 断言（值=RE-MOTION 表）；reduced-motion emulate 下降级版断言。状态行 shimmer 额外断言：fake runtime 卡在 thinking 时 `.sand-status-line` 文字节点 animationDuration=1.4s 且 animationPlayState=running
2. 截图亮暗各一张（状态行 shimmer 中间帧 / 入场完成态），和 `work/grok-0.79.3-re/ref/conv-working.light-t0.png` 拼版——亲检交经理（原版 "Digging around" 中段字色更深，就是扫光）
3. 回归 t68（会话区 token）+ t74（气泡几何不受动画影响——入场动画结束后的稳定态几何不变）

## 产出
- CSS 若干 + transcript 挂载 class、`tests/e2e/t83-session-motion.spec.ts`、`work/tickets/receipts/T83.receipt.md`、evidence

> **2026-11-14 经理复核（第一批收口）**：回执 `receipts/T83.receipt.md` 已交；拼版 `work/ui-quality/evidence/T83/shimmer-vs-0781.light.png` 亲检——左侧 "Digging around" 像素列最暗值：Digging 段 164～252，"aroun" 段 77～123，中段扫光带明显比底字深，与原版一致。第一批确认，第 2 项收口完成；第 3/4 项与 spec alpha≈0.6 断言留第二批，本单继续 doing

> **2026-11-15 经理验收（第二批审后版 dbd3c18d）**：重跑 t83-enter 1 passed；回归 t83-session-motion+t68 2 passed，与回执一致。改动只 p5-55-layout.css（+14）和 t83-enter.spec.ts，在边界内。Sol 中①②③核实成立，处置正确：last-child 近似本身就是回归根因，撤掉比修补对；状态行改 bubble `.18s ease-out backwards`，不留终态，`[data-exiting]{opacity:0}` 退场不被压（spec ② 卸载断言覆盖）。**裁决：收窄交付通过，放行合并**。本批成果=状态行入场（bubble）+ reduced 版；消息行入场**未交付**，`t83-enter-msg` keyframes 现在是没人用的 CSS，三批挂上。
> 留存小弱点（三批一并修，不阻塞）：spec ④ reduced 断言包在 `if (count>0)` 里，状态行没出现时空过——三批改成必断言（或用 fake runtime 卡住 thinking 保证状态行在）；第一批留的 shimmer 底字 alpha≈0.6 断言仍未做。
>
> **三批（开，排 T91 之后——都碰 transcript.tsx，串行）**：只做第 3 项消息行入场的精确挂载——transcript 挂载链给**本次会话新到的条目**打 `data-enter="new"`（历史加载、虚拟列表回收复用的行不打），CSS 用已备的 `t83-enter-msg` `.24s cb(.22,1,.36,1) backwards`。先红的测试：①新消息行 animationName=t83-enter-msg、fill=backwards；②发第二条后第一条 animationName 仍为 none（旧行不重播，就是 Sol 中②的回归）；③滚回去再滚回来的行不重播；④reduced 必断言纯 opacity 版。加上面两条小弱点。第 4 项锚点闪已转 T85，不在本单。三批做完本单进 done。

> **2026-11-15 经理终验（三批 @91c366e4）**：重跑 t83-enter3 1 passed、回归 t83-enter+t91 2 passed，与回执一致；改动 3 文件在边界内。**裁决：不通过**——①reduced 引用的 `@keyframes t83-enter-fade-reduced` 全仓不存在（spec ④ 只量名字=假过，data-enter 永久残留）；②observer 依赖只有 isMainLine、transcript 无 key，切会话/历史异步到达会全量误入场（违反「历史加载的行不打」）；③二批两条遗留弱点未做；④spec ① 未断言 duration/timing/fill。→ **T83b 已开 open/**。虚拟化风险记档=接受（全量 map 复核属实）。T83 留 doing，T83b 过后整单 done。

> **2026-11-15 经理终验第二次（三批+T83b @09c4fd4d）**：重跑 t83-enter3 1 passed、回归 t83-enter+t91 2 passed，与回执一致；改动只 transcript.tsx / p5-55-layout.css / t83-enter3.spec.ts，在边界内。`@keyframes t83-enter-fade-reduced` 已实存（p5-55-layout.css:415，纯 opacity）。T83b ①③④ 通过。**裁决：不通过**——T83b ② 会话门是死代码：判定写在 effect 体内，但依赖仍 `[isMainLine]`，transcript 无 key 不重挂载，切会话时门不会再跑（T83b 做法明写「依赖加 activeAgent.id」，未做）。⑤ 不能按「代码在、只差实证」关：代码本身不生效，⑤ 实证若做对了就是红的。→ **T83c 已开 open/**（一行依赖 + ⑤ 用「从未显示过的有历史会话」，绕开 B 内发消息链路）。T83 第二次不通过，T83c 再不过 → 消息行入场挪 blocked。
> 二批遗留两项（状态行 reduced `if(count>0)` 弱断言、shimmer 底字 alpha≈0.6 断言）：**并进 T76**（同碰会话区 CSS/spec），不阻塞 T83。

> **2026-11-15 经理终验第四次（T83d 时间盒 @b345fac2）**：验收规定连跑 3 次 → **2/3**（第 2 次 1 failed，`toContain` 断言失败；全 spec 只有 ① 动画四属性段 L52/54/62/63 有 toContain，即失败点在 **①**，不在 ④）；加跑 6 次全过，合计 8/9。回归 t83-enter+t91 2 passed。改动只 t83-enter3.spec.ts（+14/-5），在边界内。④ observer 法与 ⑤ 真红证据本身成立。**裁决：不通过**，按约执行：**三批（消息行入场）挪 blocked，只合二批 @dbd3c18d**；feat/T83-batch3 与 T83b/c/d 不合并。解封条件：① 段 snapshot 改成与 ④ 同法（observer 事后记录 animationName/四属性，不在 240ms 窗内抢测），并连跑 5 次全过；失败候选：`has` 只判属性存在不判值=new、或 animationend 前 computed 尚未生效。
