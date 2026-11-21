# T82：取证——动效 / 过渡 / 微交互 / 行为流对齐清单（只取证，不改码）

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3) 派 `reverse-engineer`
> 来源：work/persona-stop-gap/BRIEF.md §3（用户：「还有很多动画等等大量的配置」）
> 分支 / 作业目录：不动 app/，在集成分支只写 work/**
> claimed：
> accepted：2026-11-13 84fc8d32（经理任务 B）

## 目标
现有 RE 报告（`work/grok-0.79.3-re/RE-*.md`）全是静态结构。出一份可逐条核对的动态行为清单，格式学 `RE-BORDERS-0.78.1.md`：每条带原版值、锚点、我们的现值、差异。

## 范围（按用户最常看的面排序，做完前一面再做下一面；stop 归 T81，不在本单）
1. 会话区：消息出现（入场动画、流式文字呈现方式、光标 / 打字指示）、工具卡展开收起、思考 / 工作中指示、滚动到底行为、消息 hover 钮出现。
2. composer：聚焦、发送按下反馈、发送后清空 / 回位、附件拖入。
3. 侧栏：bot 行 hover / active / 切换过渡、未读标记出现、新 bot 出现、拖动排序。
4. 浮层：菜单 / 对话框 / 命令面板 / toast 的开合动画（时长、easing、transform 起点）、遮罩淡入。
5. 全局：`prefers-reduced-motion` 处理、主题切换过渡、通知声音与系统通知（有无、何时触发）。

每条记：触发条件、属性（transition / animation / keyframes 名）、时长、easing、延迟、原版锚点（CSS 文件 + 选择器 或 JS 搜索串）、我们的现值（`app/ui/renderer-grok` 文件 + 选择器，或 computed 读数）、差异级别（缺失 / 值不同 / 一致）。

## 边界
1. 只写 `work/grok-0.79.3-re/RE-MOTION-0.78.1.md` 与 `work/persona-stop-gap/evidence/T82/`；不改 app/、repos/。
2. 产物只读（`/tmp/t78-asar/`、0.78.1 deb、0.79.3 参照）；不读凭证目录。
3. 我们侧读数走隔离 HOME / TMPDIR、Xvfb，DPR2。
4. 与 T76/T77 的关系：hover / active 的**颜色值**已在 RE-UI-LAYOUT 与 T77 计划里，本单只记它们的**过渡**（时长 / easing），不重复颜色。

## 验收（写命令，不写感觉）
1. `test -s work/grok-0.79.3-re/RE-MOTION-0.78.1.md`，含范围 1–5 五节，每节一张表（列同上）。
2. 原版 CSS 里所有 `@keyframes` 名都出现在清单里或在「不相关（理由）」附表里：`grep -oh '@keyframes [A-Za-z0-9_-]*' /tmp/t78-asar/dist/renderer/assets/*.css | sort -u | wc -l` 与清单 + 附表计数相等（回执贴两边数字）。
3. 每节末尾给「建议拆单」：按痛感排序的 1–3 条，标明并入 T76/T77/T78/T79 还是新开。

## 为什么这样验收
用户的抱怨是「列不全」。验收 2 用 keyframes 全集做覆盖分母，防止只挑几个好查的写；附表允许排除，但要有理由。拆单建议放在每节末尾，让经理按节立刻开后续单，不用等全量做完。

## 产出
- `work/grok-0.79.3-re/RE-MOTION-0.78.1.md`、`work/persona-stop-gap/evidence/T82/`、`work/tickets/receipts/T82.receipt.md`

## 经理终验（2026-11-13）——**通过**
锚点抽查（重跑）：
- `grep -oh '@keyframes [A-Za-z0-9_-]*' /tmp/t78-asar/dist/renderer/assets/*.css | sort -u | wc -l` → **147** ✓，与附录 A 147/147 一致
- P0 typing 三点（报告 §1.3）：产物 `@keyframes sand-cqmojk-B{0%,60%,to{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}` 与报告逐值一致 ✓；CSS `.sand-16wv3z2{animation-name:sand-cqmojk-B}`，JS 组合串 `sand-16wv3z2` 在 index.eager-app 命中 1 次 ✓
- 我们侧：`recovered/.../workspace/view.css:191` 与 `overrides/p5-55-layout.css:218` 的 `.sand-message-typing__dot` 都只有尺寸/颜色、无 animation ✓（报告只列了前者，后者同样静态，施工时两处都要看）
- 五节 + 每节拆单建议 + 附录 B 排除理由齐全 ✓。局限（未跑 computed、`?` 参数项）已自报，施工单里补 computed 读数。

## 经理定的施工排法（后续单建议）
原则：P0 先、纯 CSS 先；每组自带 reduced-motion 降级版（原版是「换成纯 opacity 版」，不是 `animation:none`），不单独留一张 reduced-motion 大单。
| 建议单 | 内容（RE 组） | 级 | 归属 / 依赖 |
|---|---|---|---|
| **T83** | 会话动效：typing 三点（1.4s ease-in-out infinite + 逐点 delay）+ text-shimmer + 消息入场双段 + 高亮锚点闪（G1） | P0 | 新开，**最先**；文件 view.css / p5-55-layout.css typing 段 / transcript 挂载 class，与 T76 字阶不相交可并行 |
| **T84** | 浮层出入场参数：dialog .18s cb(.22,1,.36,1) scale .92、菜单 A3 位移族、补退场 A2（G2） | P0 | 新开，纯 CSS；与 T77（菜单项 hover）同碰菜单，**排在 T77 之后**或与 T77 合批审 |
| T85 | 滚动跟随：距底 >80px 停跟随 + 跳到最新 pill + smooth 滚动 | P1 | 新开（JS 行为，与 T83 同文件但分单，方便单独验收） |
| T86 | 按压 spring + toast tray（G4） | P1 | 新开，T84 后 |
| T87 | wipe 视图切换（G3） | P1（RE 标 P0，经理降级：要动 router，痛感低于会话区和浮层） | 新开，T84 后 |
| — | 展开族（G5，工具卡/composer 涨高） | P1 | 等 T81a 落地后再开（工具卡在 turn 打断时的状态要先定） |
| — | 指示呼吸族（G6 剩余部分） | P2 | 并入 T79 收尾巡检 |
| — | 声音（G7） | 不做 | 原版对普通用户 gate 关闭（`isAnysphereUser`），原版即规格=用户听不到；进 queue 提议，用户提才开 |
| — | corner-dot 挂载 → T76；composer 聚焦过渡 → T77；market 位移 → T78/T79 | — | 并入既有单，开单时把 RE-MOTION 对应行号写进单 |
