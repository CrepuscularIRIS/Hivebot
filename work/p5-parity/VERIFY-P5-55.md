# VERIFY · P5-55 0.18→0.78.1 视觉收口（U1′ 清零）

verdict: **PASS（附一条合并闸门级 FIX：P5-55.f1 必须随合并落地，见新问题第 1 条）**
commit: 32aef121420e41b37d2e1cfe7f35cb1b674d4fe1（feat/P5-55 @ /tmp/bot-wt/P5-55，基 4836bb4，head 与申报一致无漂移）
验收人：verifier（GLM 5.3），2026-11-03 19:04–19:5x；独立 worktree `/tmp/bot-vfy-P55`（detach 32aef12）复跑，共享 pnpm store；合并态复核 worktree `/tmp/bot-vfy-P55m`（main bcb0b51 + 32aef12 = e6f7137，git 自动合并零冲突、entries.ts 两边改动都存活）

## 验收项与证据

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 基础：两包 build → vitest 359 → e2e 62/0 → check diff=0 | PASS | 隔离安装（app/ui + app/sdk 各 frozen install，首跑 sdk 缺装使 m3 ensure 报 ENOENT，补装即绿＝环境项非产品项）→ `pnpm build` 三步过（out/renderer 含 override-p5-55-{palette,layout}.css + fonts/）→ `pnpm test` = **359/359**（33 files）→ `pnpm test:e2e`（Xvfb）= **62 passed (6.8m) 0 failed**，含 #55 E5 细边=1px、#58 新增 unread-scroll（滚位 28±2px 行为断言）、#60 visual.spec 基线锁 → `pnpm -C app/ui/renderer-grok check` = **upstream diff=0: 332 files** + SHA256SUMS 全过。日志：`evidence/P5-55/verify/{vitest.log,e2e.log}` |
| 对照台清零亲验（三联 open=0） | PASS | 亲跑 `pnpm test:compare-app`（1 passed，15s）+ `build:upstream`（纯上游产物，CSS 无 p5-55 标记，OURS 列确为纯 0.18）+ `node run.mjs`（238s，10 拼图，boundary=0 全视图，persona 264/264）→ run-summary `app-vs-ref 处置：{computed-equiv:10,data:16,subpixel:12,arch:40,fixture:12}` 共 90 豁、**无 open 键**；`node appref.mjs` 单独重算同样零 open 行（非空转：对抗注入 composer 高差 7px / 主钮宽差 50px / 亚像素 1.34px 超容差等 5 例全判 open）。产物：`verify/{run-summary.json,run-summary.md,u1-appref.tsv,u1-appref-verify-run.tsv}` |
| **P5-31 合并后 B8/B9 复核（关键增量）** | **PASS（复核完成）＋发现合并态回归 → FIX 高危** | 静态：`p5-55-layout.css:253-255` 按四钮序（Always·Allow once·Never·Deny）取 `:nth-child(2)` 为主钮；P5-31 后卡片仅 [Allow once(child1), Deny once(child2)]（`overrides/modules/local-tool-view.tsx:99-101`），CSS `!important` 压过 P5-31 内联绿钮 → **Deny once 拿到黑主钮、Allow once 降为次级**。动态双证（合并态 e6f7137 build 后 `test:compare-app`）：①计算样式——Allow once bg 分支态 `rgb(28,28,28)`（黑主钮）vs 合并态 `rgba(28,28,28,0.06)`（次级），`verify/styles-app-merged.json`；②截图亲验（视觉工具二次确认）——`verify/branch-card-crop.png`：Never·Deny once·Always allow·**Allow once(黑主钮)**；`verify/merged-card-crop.png`：Allow once(灰)·**Deny once(黑主钮)**。**后果直算**：合并态 app.json × 分支态 ref 快照跑 appref.mjs = **open=8**（全为 permission.card-primary-btn bg/color，亮暗×2 视图，`verify/u1-appref-merged-main.txt`）——不修 .f 则 P5-55 自己的 U1′=0 验收在合并后 main 上即破。合并态 vitest **363/363** 绿（=359+P5-31 新增 4）、合并态全量 e2e = **62 passed (6.7m)**（`verify/{vitest-merged.log,e2e-merged.log}`）——测试全绿恰证明测试不察颜色/主次，只有对照台口径能拦住 |
| 翻案①折叠态实测宽 88 | PASS | 我方 run 快照：`sidebar-collapsed.light` ref `sidebar.root` width=**88px**，app=**88px**（`styles.json`+`app.json`，evidence 在 verify/run-summary.json 同批）；行为面 e2e #59 A13「mod+b 折叠 88」绿 |
| 翻案②ref 正文系统字体 | PASS | 我方 run 快照：ref 侧 `transcript.user-message`/`assistant-message` font-family 均为 `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`（XVF 未启用，与 palette.css 头注「sand_xvf_typeface 服务端开关默认关」互证）；woff2 双文件 sha256 与 0.78.1 dist 逐字节一致（X-VF=0e287249…、XMono-VF=2a5fda92…） |
| disposition 抽 10 行核理由与实物 | PASS | 抽 16+ 行对到我方 run 原始数据全相符：arch-R10（ref thinking/tool row 确为 null、app present）、arch-折叠 footer-pill/search-entry（ref null、app present/两侧 null）、arch-审批卡分段（P5-31 域）、data×2（item-name 宽 55.25 vs 50.59 = Main/Ops Bot 数据差、conv-running ref present/app null = Ops Bot 挂起回合）、subpixel×4（|Δ|≤1px，如 418.156/418.148）、fixture 空态×4（collapsed ref 不 openAgent）、computed-equiv（min-height auto/0px）、fixed 定向 6 + 随机 6（终值 ref=app）。豁免规则按「视图/部位/属性/值形态」匹配，未按具体数值放水 |
| visual 基线重写后 visual.spec 绿 | PASS | 全量 e2e 内 #60 绿；基线值抽核确为 0.78.1 值（E4 正文=系统栈 14px、B8 钮=6px 14px/r9999/h32、B10 composer=r22/padding 0、C1 info pane=320px、A1 钮=36px/r9999），与 ref-computed 快照同值 |

## 坏路径（追加）

- disposition 非放水对抗：注入应 open 的差异 5 例（见上行），全部正确判 open。
- 合并兼容坏路径（P5-31×P5-55 同文件 entries.ts）：git 零冲突且语义双存活（P5-31 askText 全文命令 + P5-55 user 判侧），但 **CSS 层接缝断裂**（见 FIX①）——按 P5-02 教训，接缝靠「合并后对照台 open 数」不靠测试绿。
- unreadScrollTop 边界：恰一屏→null、dividerTop=10→clamp 0（markers.test.ts 98-108，单测 359 内）。

## 与申报的偏差（不构成 FAIL）

- 报告「1068 行修 996/豁 72+新口径 18 豁」为口径拆账：实物 disposition-u1.tsv 1086 数据行 = 996 fixed + 90 waived（72+18=90），自洽；P5-54 基线表实为 1067 行（954 open + 113 waived），行数差来自 v1 fixture 用户条目修正与「hidden=missing」新口径，无碍结论。
- U2′「31 行：修 21/等价 2/豁 8」未逐行独立复算（visual 基线 + e2e 绿已覆盖 U2′ 验收面）。
- visual.spec 测试标题仍写「基线 = 0.18 移植现值」，实际基线已是 0.78.1 覆盖后值（visual.spec.ts:79，文案滞后，不影响判定）。
- 报告范围外发现①（侧栏悬停预览卡被滚动容器裁半张，low）本验收未复验，按 builder 自报转记。
- 合并态 vitest 为 363（=359+P5-31 的 4 条新增），非回归。

新问题（每条一行，可直接成为修复任务）：
- [FIX] 合并后审批卡主钮错位：`:nth-child(2)` 在 P5-31 两钮卡上选中 Deny once，黑色主钮落到拒绝动作上，Allow once 降为次级；合并后 main 的对照台 open=8（全为主钮 bg/color），U1′=0 验收即破 | 复现：merge main+32aef12 → build → conv-rest 亮暗截图 / appref.mjs | 疑似位置：app/ui/renderer-grok/overrides/p5-55-layout.css:253-255 | 严重度 **high（合并闸门：P5-55.f1 须随合并或先于 P5-41 GU 落地；修法＝两钮组时首钮为主，如 `[role="group"] > button:first-child:nth-last-child(2)`，且新规则须排在旧 nth 规则之后）**
- [FIX] visual.spec.ts:79 测试标题仍称「基线 = 0.18 移植现值」而基线已重写为 0.78.1 值 | 复现：读 visual.spec.ts:79 与 visual-baseline.json | 疑似位置：app/ui/tests/e2e/visual.spec.ts | 严重度 low（文案）
- [FIX]（builder 自报转记，未复验）侧栏悬停预览卡被滚动容器裁半张 | 复现：builder 报告「范围外发现」 | 疑似位置：renderer-grok sidebar 滚动容器 | 严重度 low
