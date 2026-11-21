# T79c c：首行 More 菜单被顶出视口 + spec 三处空断言（T79c/b 验收不过的返修）

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：T79c 验收（经理任务 B，HEAD 58a0eca0）；queue 18c；审查 reviews/T79c.review.md 末段核实
> 分支 / 作业目录：feat/T79c @ /tmp/bot-wt/T79c（续）
> claimed：
> accepted：2026-11-16 feat/T79c @ 062e0924（经理任务 B；T79c 链按 d 退路收口——只交 jump 钮+未读 pill，菜单件撤并入 queue 18s）

## 目标
修掉 T79c 自己带进来的回归（列表最上面一行的 More 菜单弹到头部底下，看不见、点不到），并让 t79c spec 的四条断言在修复前的代码上真能红。

## 证据（经理复验）
- 探针 `/tmp/mgr-t79c-probe/measure.spec.ts`：逐个 More 钮开菜单量 rect。第 0 行（首条用户消息）菜单 top=33 / bottom=71，scroller top=61，菜单中心点 `elementFromPoint` 不在菜单内（被头部盖住）；第 1~3 行正常（top≥79，中心命中，0 相交）。
- 截图 `work/ui-quality/evidence/T79c/mgr-menu.{light,dark}.png`：右上角只露出菜单底边一条，菜单本体在 "New chat" 头部后面。
- 根因：`p5-55-layout.css` T79c 段无条件把 menu-open 的 hover 条挪到 `top:-34px`，菜单再相对条向上弹 → 上方没空间时出界。上游菜单是 inline div（`message-actions.tsx:277`），没有碰撞翻转。
- **spec ① 为什么没抓到**：`button[aria-label="More message actions"]` 的 `.first()` 是**第 0 行**的钮（不是 hover 的 assistant 行），菜单被顶出视口 → 与任何气泡都不相交 → 断言 0 通过。断言恰好在坏掉的那一行上「过了」。
- **spec 反例② 空**：改的是 `dataset.t79cProbe`，而 MO 的 `attributeFilter` 只有 `['style','class']`（transcript.tsx:173）——这一步根本不触发回调；修复前代码同样绿。
- **spec 反例③ 空**：6 块在一次 `evaluate` 里同步追加 → MO 只收到一次合并回调、增量 144px，修复前的 `distance 差 >40` 同样触发；没测到「分帧小块」。
- 产品侧 b 修复本身经理探针确认成立（`/tmp/mgr-t79c-probe/probe.spec.ts`：class 切换 ×4 后 unread=null；6×24px 分帧逐块，第 1 块即 true），问题只在 spec 没有牙。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/ui/renderer-grok/overrides/p5-55-layout.css` 末段 T79c、`overrides/modules/transcript.tsx:115-200`
3. 经理探针 `/tmp/mgr-t79c-probe/{measure,probe}.spec.ts`（可直接照抄进 spec 的写法）

## 边界
1. 只动：`p5-55-layout.css` T79c 段、`overrides/modules/transcript.tsx`（若翻转需要 JS）、`tests/e2e/t79c-overlay-positions.spec.ts`。不改 recovered/ 上游树。
2. 修法建议（最小）：菜单上方放不下时不上移——开菜单时量 hover 条 top 与 scroller top 的距离，不够「条高+菜单高」就在 anchor 上打 `data-menu-flip`（或反过来只在够时打 `data-menu-up`），CSS 只对该属性上移。其它等价做法可以，但必须同时满足下面验收 1 的两种行。
3. 先写失败测试：spec ① 改为**对 hover 的那一行自己的钮**开菜单（`row.locator('button[aria-label="More message actions"]')` 或按 owner 行取），并新增「第 0 行」用例；对两种行都断言：菜单与任何 `.sand-message` 不相交 **且** 菜单 rect 完全在 `.sand-virtual-transcript` 可视 rect 内 **且** 菜单中心 `elementFromPoint` 命中菜单。先在 58a0eca0 上跑，第 0 行必须红。
4. 反例② 改用 `classList.toggle`（照 Sol 探针 /tmp/t79c-review-probe/probe.spec.ts:23）；反例③ 改为循环里每块单独 `evaluate` + `waitForTimeout(150)`。
5. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；只跑下面列的 spec。

## 验收（写命令，不写感觉）
1. `cd /tmp/bot-wt/T79c/app/ui && PATH="$PWD/node_modules/.bin:$PATH" sh scripts/run-e2e.sh t79c-overlay-positions.spec.ts` ×2 → 1 passed ×2（含首行 + 中间行两种菜单、反例②③）
2. 回执贴「先红」证据：新 spec 在 58a0eca0 产物上运行，首行菜单断言红（贴失败行）。
3. 反例的牙：把 `transcript.tsx` 判定临时改回 98c82311 的 distance 版（不提交），spec 反例②或③至少一条红；贴输出后还原。
4. 回归：`sh scripts/run-e2e.sh t91-reaction.spec.ts t85-scroll.spec.ts t81a-supersede.spec.ts` → 4 passed
5. 截图：spec 内补拍首行菜单 `evidence/T79c/menu-top.{light,dark}.png`，经理亲看。

## 为什么这样验收
目的是「菜单开在用户看得见、点得到、又不盖别人气泡的地方」，不是「菜单不和气泡相交」——后者把菜单扔出屏幕也满足。所以必须加「在视口内 + 中心可命中」，且覆盖最顶上一行。反例要在旧实现上能红，否则就是摆设。

## 产出
- 上述三文件改动；回执 `receipts/T79c.receipt.md` 追加 c 段

## 经理裁定（2026-11-16，施工两难回复）：选 B，附条件

理由：no-flip 行 = T79c 之前已上线的基线行为（菜单落下一行），不是新伤害；其余行仍修好 → 相对基线单调改进、零回归。C 白扔已验证的上移件；A 是真解（带碰撞翻转的浮层，0.78.1 `gw` 组件同类），但要覆盖化上游层，不在本单。
条件（验收 1 的首行用例按此改写）：
1. 翻转按**空间**判（菜单上弹会出 scroller 可视顶），不按「第 0 行」写死——现 MO 方案符合即可。
2. 首行（no-flip 行）**豁免「不盖气泡」**，但**不豁免可用性**：菜单 rect 完全在 scroller 可视区内 + 菜单中心 `elementFromPoint` 命中菜单——两条必须断言。
3. 「More 钮 dispatchEvent 超时」先查清是测试取钮问题还是真被挡：spec 用该行自己的钮（row 内 locator），并断言钮中心 `elementFromPoint` 命中钮本身。若真被挡 = 基线就有的问题，回执存疑项写明证据，不在本单修。
4. 非首行仍断言 0 相交 + 界内 + 中心命中；反例②③保持 class 化/分帧。
5. 回执写清豁免范围。经理另记 queue 提议：More 菜单改带碰撞翻转的浮层（A 方案），等上游层覆盖化时做。

## 验收记录（经理 2026-11-16 · HEAD 1b27dced）：不通过 → T79c d

- **首条消息行开 More 菜单 → 渲染进程卡死**。探针 /tmp/mgr-t79c-probe/osc.spec.ts：对第 0 个 `.sand-transcript-row`（用户第一条）用 setTimeout 点 More，之后一个 500ms 的 evaluate 8s 内无返回（`ALIVE 0 HUNG 8001 ms`）。同场景在 58a0eca0 上能打开（只是出界），所以是 c 引入的。
- 根因（transcript.tsx c 段）：MO 里 `anchor.classList.toggle('t79c-no-flip', out)`，而 `out` 用**菜单自己的 rect** 算——挂上 no-flip 后菜单回原位 → out=false → 摘掉 → 菜单又上移 → out=true……class 变化本身在 MO 的 attributeFilter 里，形成同步微任务死循环。
- 施工方说的「dispatchEvent 超时 = 取钮容器错」不成立：超时就是这个死循环。spec 首行段取的是**第一个 assistant 行**（top≈79，本来就不出界），不走翻转路径，所以绿。
- 回归/spec 未复跑（主要件已判不过，省一次）。
