# P5-41.f1 · 定稿（GU-P5-41 修复清单的取舍）

输入：`panels/GU-P5-41.md`（汇总）+ 席 A 原文 `panels/GU-P5-41-A.md` + 席 B 代录 `panels/GU-P5-41-B.md`。没有 ux-proposer 两份提案（这是 GU 裁决修复），所以每行写「采纳哪席 / 自定 + 理由」。

| # | 分歧点 / 清单项 | 采纳 | 理由 |
|---|---|---|---|
| ① | WCAG 算法 | A+B（两席同点）+ B 的「背景祖先向子级合成」 | 旧算法有两个 bug：丢前景 alpha（A、B 都指出了）；遇到不透明祖先就直接返回，叶子上的半透明层（助手气泡 `#1c1c1c0f`）被丢掉（B 的第二句话）。合成移到 `tests/support/contrast.ts`，纯函数加单测反例 |
| ①' | 审计覆盖 | A（补次级文字） | 补审 placeholder ×2、侧栏副题、Stop、市场空态。市场列表态放在 market.spec（theme-dual 的默认 profile 没有目录源） |
| ①'' | 不达标的项怎么处置 | 自定：每项都拿 0.78.1 对照台**实测**定性，不凭推断 | 写了 ref 探针（复用对照台 harness），读 0.78.1 的 computed color。实测结果：正文链接在 0.78.1 里是 text-primary 而不是蓝色，所以**修**；搜索占位在 0.78.1 里是 text-tertiary，我们之前是 Chromium 默认 #757575（暗色 3.58），**修成原版 token**；工具行预览、审批代码块、搜索占位（亮）与原版同值，**签收**；composer 占位原版是 2.49，我们是 3.96，比原版高，**签收**；侧栏副题拿不到 0.78.1 的值，**签收**（附一行修复方案） |
| ①''' | 钉值还是放过 | 自定：签收项钉现值（±0.05） | 「照原版」不等于「过」。值一变就红，防止下次又被「全过」盖住（席 A reverse_take） |
| ①⁗ | 取样时机 | 自定 | 重跑审计时发现暗色 composer 占位的 bg=177，是 composer 背景 .15s 过渡中的插值。settle 现在会等 CSSTransition 跑完再取样。旧 contrast.tsv 也可能在过渡中取样 |
| ② | 审批卡：开 .f 还是签收 | A 两条都要：结构补上，位置签收 | 分段结构按 0.78.1 实测 DOM 落地：标题条（laptop 徽标、「Computer」、关闭钮 aria-label = Deny once，原版就是这样）、标题和说明、填充式代码块（ref 实测 bg-quaternary 底 + green-primary 字）加 Copy code、按钮段。位置（dock vs transcript 内）要改 0.18 的 ProductionRenderer 挂载点，是架构改动，写进签收单 §2，不硬改 |
| ② | 关闭钮语义 | 自定 = Deny once | 0.78.1 的关闭钮 aria-label 就是「Deny once」（ref 探针看到的 DOM）。拒绝是安全默认，不新增作答值（D9 值域仍 ⊆ {allowed-once, rejected}） |
| ③ | D2(b) 在哪一层丢的 | 自定（实证） | 是 fake 脚本违反了 dsh 的 FinishReason 契约：写成 `{kind:'error', message}`，契约要求 `{kind:'error', failure:{code,message}}`。dsh-llm-retry 读 `failure.code` 时抛 TypeError，turn/end 记下的就是这个异常文本。reduce、fold、shim、0.18 渲染都没问题。证据：用旧脚本加收紧后的断言复跑，收到的是「回复失败：Cannot read properties of undefined (reading 'code')」；修正后注入文本直接到达用户 |
| ④a | 原生表单 | A（最小样式对齐）+ 签收余项 | select、input、textarea 套用 composer/搜索同族样式（secondary 填充、无硬边框、r12、半像素描边、自绘 chevron）。原生下拉弹层和 radio/checkbox 字形仍是平台原生的，写进签收单 |
| ④b | 市场首屏 | A | 可连接的条目排到前面（已加载页内稳定分区），整页都是仅浏览时显示引导文案。市场参照仍然缺失（R-04 空白帧），标「未验证」 |
| ④c | 两视图非同场景 | A+B | disposition 改标 `unverified:*`（不计入 open=0），审批卡改标 `signoff:arch` 并指向签收单；README 补写这两类标签 |
| LOW | composer +/mic、侧栏副题露内部 kind、P6-03 暗色重拍、Connect apps 图标 | 不在本单范围 | 写进签收单 §5，由用户决定是否另开任务 |
