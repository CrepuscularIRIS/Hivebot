# P5-15 · U2 逐行表（R8 fixed 22 项）

分支 `feat/P5-15` @83a39ab · 文件 `app/ui/tests/e2e/visual.spec.ts` · 断言名 = `expect.soft(..., '<名>')` 的 message。
每条断言在 `themed()` 里亮、暗各跑一次（B6/B8 收起态、展开态各再跑一次；规则 15 亮暗各抓一张审批卡）。
规格依据：R8 = `RE-visual-residual.md`，R2 = `RE-visual-078-values.md`（与 R8 冲突时以 R2 为准，PLAN §0.1）。
「待回修」= 断言写的是 main 现值，与 R2 不符，偏差见 `work/p5-parity/REPORT-P5-15.md` 待回修清单。

| # | 项 | 断言名 | 断言值（main 实测） | 状态 |
|---|---|---|---|---|
| 1 | A1 侧栏头 | `A1` | `.sidebar-head` height 38px、padding 0px（另：`.grok-mark` 计数 0，非 computed） | **待回修 P5-15.f1**（R2 覆盖 → P5-11） |
| 2 | A3 列表 padding | `A3` | `.bot-list` padding 4px 12px 24px | 绿 |
| 3 | A4 条目高 / padding | `A4`、`A4 实高` | min-height 58px、padding 8px；实高 ≥58 | **待回修 P5-15.f2**（R2 覆盖 → P5-16） |
| 4 | A5 grid / gap | `A5` | display grid、列 `34px …`、column-gap 9px | gap **待回修 P5-15.f2**（R2 §0.1 A4 行 gap 8）；列宽随 A6 |
| 5 | A6 头像 | `A6` | 34px（R2 推断 32 未实测，待 R3 / Q-014，不覆盖） | 绿 |
| 6 | A8 相对时间 | — | 无数值，不断言（文案「刚刚」已有 toHaveText） | — |
| 7 | A14 列表空/错态 | — | 无数值，不断言（条件显示：断线 → `[data-roster-state=unreachable]` 可见、列表保留） | — |
| 8 | A18 调宽手柄 | `A18` | `.sidebar > .resizer` right -6px、width 12px | 绿 |
| 9 | B1 行间距 | `B1` | `.chat-col` row-gap 22px | 绿 |
| 10 | B2 内容列 | `B2` | `.chat-col` padding 28px 30px、max-width 750px（= 690 + 2×30） | 绿 |
| 11 | B6 tool-call 行 | `B6 卡`、`B6 行`、`B6 chevron`、`B6 detail` | 卡 1px / r9；行 min-h 34、padding 7px 9px；chevron 6×6、收 −45°（matrix .707,−.707）展 +45°；detail padding 0 10 10 25、max-h 220 | **待回修 P5-15.f3**（R2 覆盖 → P5-16） |
| 12 | B8 审批卡 | `B8 卡`、`B8 钮` | 卡 r10、padding 14px 16px；批准钮 padding 6px 9px、r6 | **待回修 P5-15.f4**（R2 覆盖 → P5-31） |
| 13 | B10 composer | `B10 shell`、`B10 输入`、`B10 dock` | padding 9px、r16；输入 min-h 48px；dock padding-bottom 18px | 绿 |
| 14 | B15 代码块 copy 钮 | `B15` | top 6px、right 6px、静息 opacity 0 | 绿 |
| 15 | C1 pane 宽 | `C1 范围`、`C1 初始` | resizer aria-valuemin 280 / valuemax 480；初始宽 320px | 绿 |
| 16 | C2 pane 头 | `C2` | `.pane-head` padding-left 12px（另：关闭钮 glyph chevrons-right U+F31D，非 computed） | 绿 |
| 17 | D4 市场搜索框 | `D4` | r8、height 32px、padding 0px 9px | 绿 |
| 18 | D6 市场列表行 | `D6 行距`、`D6 行`、`D6 头像` | row-gap 7px；`.m-main` padding 12px、min-h 56px、gap 12px；头像 36 | 绿 |
| 19 | E3 font-synthesis / color-scheme | `E3` | html font-synthesis none；color-scheme = light / dark（随主题） | 绿 |
| 20 | 规则 5 working 副行 accent | `规则 5` | `.bot-sub.accent` color 亮 rgb(11,109,211) / 暗 rgb(77,155,255) | 绿 |
| 21 | 规则 9 会话头 Working 小标 | `规则 9` | `[data-working]` color 同上、font-size 12px | 绿 |
| 22 | 规则 15 审批已决 → outcome 单行 | `规则 15 light`、`规则 15 dark` | `.approval-outcome` padding 8px 0px、13px / 18.2px、color 亮 rgba(28,28,28,.68) / 暗 rgba(245,245,245,.66) | 绿（数值无 R2 冲突；R2 终态文案集归 P5-31） |

**计数**：有数值 20 项（22 − A8 − A14）；断言执行条数 70（亮暗合计），≥ 20 × 2。

**被 R2 覆盖的 4 项去向**（PLAN §0.1）：A1 → P5-11；A4（含 A5 gap）→ P5-16；B6 → P5-16；B8/B9 → P5-31。本任务对这 4 项断言的是 main 现值（保证绿），承接任务改 css 时把对应断言改成 R2 值（P5-16 ②已写明 A4/B6）。
