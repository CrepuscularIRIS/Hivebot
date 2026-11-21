# UI 质量系统性修复 · PLAN（2026-11-12 manager 任务 A）

需求：`work/ui-borders-connect/BRIEF.md` 2026-11-12 末段（「选项反馈 / 字体大小 / 没有居中等一系列问题」，要求系统性修，不是单点修）。规格锚 = 0.78.1（`work/grok-0.79.3-re/RE-UI-LAYOUT-0.78.1.md`、`RE-BORDERS-0.78.1.md`、参照图 `work/ui-polish-win/ref/`、`work/grok-0.79.3-re/ref/`）。

## 取证（经理亲跑亲看）
- 巡检脚本：`harness/tour.spec.ts`（逐面亮暗截图 + 字阶 / 居中 / hover 三探针）、`harness/probe2.spec.ts`（字体族、气泡父链）。跑法：`cd app/ui && PATH=$PWD/node_modules/.bin:$PATH NODE_PATH=$PWD/node_modules TOUR_SPEC=<spec> sh scripts/run-e2e.sh -c ../../work/ui-quality/harness/tour.config.ts`（Xvfb，DPR2，out/ @ 10:33 含 T71c）。
- 产物：`evidence/tour/*.png`（18 面 ×亮暗）+ `probes.json` + `probe2.json`。每张主题单的「改前」图就从这里取。
- 没拍到：审批卡（fake bash 在工作区内不出卡；T73c 本来就要重做这张卡，不单列）。

## 为什么单点修没收敛
T56–T72 每张单对一个面的一组值，验收也只看那个面。但问题是**体系层**的：同一应用三套字体栈、字号全是散落的字面值（overrides+recovered 里 14 种 px、9 处 `14px!important`，token 定义了却几乎没人用）、交互态各组件各写各的（很多根本没写）、部分控件干脆是浏览器原生样式。逐面对值永远对不完，下一面照样走样。

## 主题与根因

| 主题 | 用户原话对应 | 系统性根因（证据） | 单 |
|---|---|---|---|
| L 气泡宽塌陷 | 「没有居中 / 一系列问题」——最刺眼 | 百分比 max-width 落在 `width:fit-content` 的 anchor 上，循环依赖 → 短回复 24px 宽、一字一行（`sidebar-menu.light.png` 的「d/o/n/e」；probe2 bubbleChain） | **T74**（done，终验 2026-11-12 @e45d0e5d，待合并） |
| A1 字体族 | 「字体」 | 三套栈：主壳系统栈 / 设置 `Inter,…system-ui` / 市场与建 bot `system-ui`，Linux 上两种字形（probe2） | **T75**（done，终验 2026-11-12 @f007d447，待合并） |
| A2 字阶 | 「很多的字体大小」 | 没有统一字阶：命令面板全 16px/normal（未设字号，吃 body 默认）、info pane 小标题 16px/normal、设置 email 11px（原版 13 tertiary）、账户名 700（原版 400）、菜单项 12px；样式散落字面值 + `!important` 补丁 | T76（计划） |
| C 选项反馈 | 「选项反馈」 | ① 侧栏右键菜单项是 `SandButton variant=secondary`（`production/AgentRowActions.tsx`，5 处 role=menuitem）→ 灰底药丸、文字居中，不是原版左对齐透明行 + hover 底；② hover 无变化：侧栏 bot 行、Connect apps、设置左导航、市场行、命令面板 tabs/行（probes.json hover.list）；原版 nav/行 hover = bg 叠层 + `.12s ease-out`（RE-UI-LAYOUT §1.2/§2） | T77 **done**（① 侧栏菜单+侧栏行 hover，2026-11-15 验收）；余量 T77b open |
| B 原生控件泄漏 + 滚动条 | 「没有居中」「一系列」 | ① onboarding 6 个裸 `<button>`（`onboarding-steps-0793.tsx`、`onboarding-view.tsx`）→ 浏览器灰框按钮（`onboarding-2/4.light.png`）；② 全应用经典滚动条带上下箭头（会话列、info pane、市场、建 bot 对话框；后者滚动条还顶出圆角），原版 overlay thin（RE-UI-LAYOUT §6「滚动条」行），我们 CSS 里零条 scrollbar 规则生效 | T78（计划） |
| D 版式对齐逐面收尾 | 「没有居中」 | 前四张做完后残留的版式差：设置账户卡复制钮掉到 email 下一行（原版同行）、设置导航 Models 用齿轮图标、onboarding 角色卡文字顶左 + 大片空白、kit md 钮 `sand-1yrsyyn` 原子名撞车（queue 既有提议，T58b 只局部补）。做完 T74–T78 后重跑巡检再定清单，不提前写死；已预登记（T74 验收经理旁见）：窄窗下「回复失败…」错误行折行居中且与时间戳重叠 | T79（计划） |

居中探针结论（防误判）：可点元素「文字中心 vs 盒中心」211 个（含 onboarding）全部 ≤1.5px——用户说的「没有居中」不是按钮内文字竖向偏，而是上表 L/C/B/D：菜单项文字居中（该左对齐）、气泡塌陷、原生按钮、元素换行错位。

## 顺序与并行
用户点名三类按痛感：选项反馈 / 字号 / 居中。T74 是 bug 级（短回复竖排），先做；T75 是一刀切的族统一，小、和 T74 文件不相交 → **T74 ‖ T75 现在就开**，也与 T73c（审批卡 + 设置 General Clear 行）文件不相交，可并行。
T76（字阶）碰设置 / 市场 / 面板一大片，**等 T73c 合并 + T75 合并后开**（否则和 T73c 的设置改动三方合并打架）。T77 在 T76 后（hover 态的字色要在新字阶上量）。T78 与 T76 不相交（onboarding + 全局滚动条），T75 合并后可与 T76 并行。T79 最后，开单前经理重跑巡检。
验收统一口径：DPR2、亮暗双截、`work/ui-quality/evidence/T<N>/` 与 `evidence/tour/` 同名前后对比、经理亲看；断言写成「整面扫描」（全部文字元素 / 全部可点元素），不抽一两个点。

## 产品结构（BRIEF 同日上一段「主 bot=DSH Superagent」）
巡检所见：主 bot 开箱显示为未命名「New chat」、建 bot 对话框只有名字 + 形状（与原版一致）。没有发现建 bot UI 与「其余 bot 走 DSH」冲突的界面；首启「命名主 bot」属于产品流程而非样式，按 BRIEF 原定「Connect 主线收尾后立项核对」，不并入本线。onboarding 首屏仍是「Welcome to Grok Bot」（品牌字样，已在等用户）。
