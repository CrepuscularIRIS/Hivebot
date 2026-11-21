seat: A
verdict: REVISE
confidence: medium
findings:
- [HIGH] evidence/P5-58/contrast.tsv（工具行预览 / 时间分隔 / 审批 Deny once 三行）— 「23 目标 WCAG 全过、最低 4.94」不成立：对比度计算没有做 alpha 合成。fg=rgba(28,28,28,0.56) 算出 16.61，和不透明的 rgb(28,28,28) 一模一样，可见 alpha 被丢掉了 — 证据：按 WCAG 公式先合成再算，亮色「工具行预览」13px/400 = **3.93**（<4.5，AA 不过）；时间分隔 5.80，Deny once 5.86。VERIFY-P5-58 的「独立重算 7 组全 MATCH」只抽了不透明的值，所以没有发现 — 建议：contrast 脚本改为先按底色合成 rgba 再算，然后重跑。0.78.1 用的也是同一个 token，所以 3.93 是照原版的值：标成「ref-faithful <4.5」交用户定，不要算作「全过」。另外审计没覆盖 placeholder、侧栏副题、市场「Not available」、Stop 钮这些次级文字，一并补上
- [HIGH] evidence/compare/u1-appref.tsv permission.card 24 行 waived:arch — 40 行 arch 豁免里有 24 行（60%）是审批卡，豁免理由写「分段结构与内容属 P5-31」，可是 P5-31 已 done，REPORT-P5-31 的交付里没有分段（标题条「Computer」、关闭钮、target 代码块）。这条豁免**指向了一个已关闭、也没做这件事的任务**，等于没人认领 — 证据：singles/conv-rest.light.{ref,app}.png：ref 卡在 transcript 内，「Computer」头加 × 加灰底绿字代码块，高 252；app 卡 dock 在 composer 上方，没有标题条，代码框是深色 1px 硬边框，高 180，和上方 typing 指示之间空出约 1/4 屏。这正是 BRIEF §12.3 根因 2「构件形态」那一类差距，而且审批卡是用户最常看到的卡 — 建议：要么开 P5-31.f 补分段壳（标题条、关闭、填充式代码块），要么在 U5 报告里把它写成「已知形态偏差」，由用户签收。不能让「open=0」把它盖住
- [HIGH] work/p6-orchestration/evidence/P6-03/d2-b-error-{light,dark}.png — D2(b) 错误路径显示给用户的是原始 JS 异常「回复失败：Cannot read properties of undefined (reading 'code')」，脚本注入的错误是 `P6-03 boom`（app/ui/tests/e2e/p6-fold.spec.ts:177），这段文本丢了。e2e 只断言 `toContainText('回复失败')`（:183），所以是绿的 — 证据：截图正文；spec 177/183 行 — 建议：查 turn/end error → notice 链路上哪一层读了 `undefined.code`（fake provider 映射还是 sdk/reduce），并把断言收紧为 toContainText('P6-03 boom')
- [MEDIUM] evidence/P5-57/config-pane-light.png、compare/singles/info-pane.dark.app.png — 配置面板 Name/Description 是原生方框 input 加带 resize 柄的 textarea，Model 是原生 select，跟周围 0.78.1 token 风格明显不协调（P5-57 自己披露了「无 0.78.1 样式」）。新建对话框的 radio/select 也是原生的 — 建议：套 composer/搜索框同族 token（r12、elevated 底、无硬边框）
- [MEDIUM] compare/singles/market.*.ref.png 是空白 stale frame（R-04 已披露）— 市场三联**没有参照内容**，「market 三联 + open=0」对市场来说是空对比。另外 P5-57/market-list-*.png 首屏 9 行全是「Not available」，可装条目被埋在后面 — 建议：U5 报告把市场标成「未验证（参照缺失），按 R-04 静态规格」；列表把 installable 排到前面，或默认筛掉 browse-only
- [MEDIUM] conv-running / sidebar-collapsed 两个视图的会话区不是同场景对比：conv-running 的 app 侧打开的是 Ops Bot（data 豁免 16 行里有 8 行），collapsed 的 ref 侧没有 openAgent（fixture 12 行）— 证据：u1-appref.tsv 的 data/fixture 行和两张 singles。结果是「运行中」观感（ref 侧栏 persona 变成三点思考动画）在对照台上没有可比画面，只能靠 P5-56 e2e — 建议：报告里标「未验证」（PLAN P5-41 ② 本来就要求这样标），不要计入 open=0 的覆盖面
- [LOW] composer 少了左边「+」和右边麦克风（P5-52 零死入口的有意取舍），但 U5 报告没有把它列为偏差；ref 的 composer 形态是 BRIEF §12.3 点名的构件 — 建议：在偏差清单里写一行
- [LOW] 侧栏副题「Waiting for you: local-tool-permissi…」把内部 kind 名露给了用户 — 证据：conv-rest.*.app.png — 建议：改成人话（如「Waiting for your approval」）
- [LOW] P6-03 暗色图（21:38 拍）的 composer、Plugins 药丸还是浅底白字的过渡帧，P5-58 的 settle 修在它之后，没有重拍。另外 d2-b、d2-d 左侧悬着一个孤立的「9:36 PM」— 建议：settle 后重拍 P6-03 那 14 张，并查清孤立时间戳的来源
- [LOW] 折叠 rail 底部「Connect apps」的图标：ref 是 grid，app 是 plug。arch 豁免说「同位置同形态」，图标对不上 — 证据：sidebar-collapsed.light 两张 singles
reverse_take: 最可能的失败方式：用户目视终验时第一眼看到的就是审批卡（结构不同、位置不同）、配置面板的原生表单、错误条里的 JS 异常。这几处都被「open=0 / 全过 / e2e 绿」三层数字挡在外面，用户的结论会是「数值对、看起来还是不对」，等于第三次重演 §12.3。更笨更稳的做法：U5 报告直接附一张「目视偏差清单」（就是上面这几条加截图），让用户逐条签收或打回，不要把 waiver 计数当作像不像的证据。

---

## 评判明细（对应派发 ①–⑤）

**视觉通道披露**：本席 Read 能直接显示图片（不受 P5-55/58 那种「只有 CDN 链接」的限制）。我用 PIL 把 `evidence/compare/singles/*.{ref,app}.png`（23:27 最新一轮，合并态）上下拼起来逐张看过；P5-57 截 8 张、P6-03 截 9 张做成 contact sheet 也看过。中间产物在 `/tmp/bot-gu41a/`。

① **三联整体观感**：色板、侧栏（40px 圆钮、条目高、Connect apps 药丸、未读点）、会话头药丸、用户黑气泡、助手灰卡、代码块、时间分隔，亮暗两套都和 0.78.1 高度一致。这是这条路线第一次在「同 fixture 并排」下看起来是同一个产品，观感可以接受。豁免分类：subpixel 12 行（|Δ|≤0.02px）、computed-equiv 10 行（min-height auto≡0）诚实；R10 arch 12 行有 RE-v3-toolrow.md 的静态加 CDP 证据（0.78.1 transcript 不给 tool-call 生成 row），诚实；**审批卡 arch 24 行理由属实，但认领任务落空**（HIGH-2）；data/fixture 28 行属实，但它们说明的是两个视图不可比，应该记为「未验证」，不是「通过」（MEDIUM）。

② **亮暗双主题**：成对图和合并态 compare 暗色都没有浅底浅字，P6-03 OBS 被定性为截图时机问题，这一点 VERIFY-P5-58 的 probe（YAVG 31/232）能支撑。**WCAG「全过」不成立**：算法没处理 alpha（HIGH-1），实际有一项 3.93。

③ **三段式 / 折叠 / 未读线**：折叠收起时首行预览、展开、运行中尾段，亮暗都清楚；tool/thinking 行的灰阶层级合适。问题在错误路径（HIGH-3）和孤立时间戳（LOW）。Read 行露出完整的 /tmp 绝对路径，这是 fixture 数据，不扣分。

④ **市场 / 配置 / 停止 / 封面**：封面三态（Starting / Couldn't connect + Reload）干净，跟原版图标一致；Stop 是会话头的小描边钮，可接受（不进 composer 已披露）；市场单行组件、Connect→Connecting…→✓Connected 已经 VERIFY 亲验，但没有参照对比，首屏全是 Not available（MEDIUM）；配置面板是原生表单（MEDIUM）。

⑤ **用户两轮反馈**：
- 「动画不行」：**已回应**。侧栏、会话头都是 persona SVG（P5-56：9/9 帧 ΔRGB≤2，reduced-motion 像素帧差 0）。但对照台的 conv-running 不是同场景，运行中动画没有并排证据（MEDIUM）。同一个名字的 bot 在 ref/app 两侧颜色不同（ref Main=蓝，app Main=绿），原因是 fixture 的 id 不同，用户并排看时可能又觉得「颜色不对」，报告里应该解释一句。
- 「颜色不对」：**已回应**。合并态 compare 的底色、文字、主钮亮暗都对得上，appref open=0 的结论站得住。
- 「双色」：**部分回应**。暗色质量确实没问题，但审计数字有算法缺陷（HIGH-1）。

**结论 REVISE**：没有 BLOCK 项。按 PLAN P5-41 写成一次性修复清单（HIGH×3 + MEDIUM×3），修完后以 U2–U4 全绿加用户目视收口，不开第二轮。
