# T32 经理终验（2026-11-07，feat/T32 @ 42be0b33）

结论：**不通过 → T32b**（`open/T32b-choreo-assert-fix.md`）。

## 经理重跑与查看
- `renderer-grok pnpm check` → `upstream diff=0: 332 files`（亲跑）
- 没有重跑 e2e 和 unit：不通过的结论来自读代码，与 e2e 是否绿无关（断言本身是空的）。T32b 验收时一并重跑。
- 改动范围：`33f0ccce..HEAD` 改了 3 个覆盖层文件、onboarding.spec 和新增的 shot-t32.spec，外加 work/。上游零改动 ✓

## 施工随修（cast 覆盖语义）的裁定：不认可
- 0.79.3 的 cast 容器是 pointer-events:none（@13822）；角色只有在 `opacity>0 && isGazing` 时才接收指针（@11376 `sand-67bb7w`）。三页上没有 gazing 角色，所以角色**不挡点击**。我们的 `view.css:20` 写死了 auto，隐形 hero 挡在卡片中心，用户点那个位置会落空。真因在 CSS，不在断言该怎么写。
- 「role 侧 visCheck 仍咬」不成立：豁免写在 visCheck 本体里。
- 744→624 是没有依据的偏差（施工自己也说改了照样盖），退回 744。

## 逐条
| 项 | 结论 |
|---|---|
| M1 JSX `//` 幽灵行 → `{/* */}` | 成立且已修。`<SceneCast/> {/*…*/}` 之间留了一个空格文本节点，但在 grid 容器里纯空白文本不生成格子，不影响 ✓ |
| M2 geo 回视口基准 + section 满视口 | 成立且已修 ✓ |
| castOk overlap | **写死成 false**（spec:141），恒过 → T32b F1 |
| ⑩a / ⑩b | 回执称已做，spec 里没有 → T32b F3 |
| connect geo/castOk、meet→demo 退场、退场层归 0、侧栏 meet 页、character-state、cast 标记 meet→connect、:81 旧注释 | 缺 → T32b F4 |
| 回执存疑 3（state 在容器上） | 不成立，`view.tsx:96` 中属性在角色 div 自身 |
| shot-t32.spec.ts 在白名单外 | 有条件追认：改成仓内相对路径 → T32b F6 |
| 截图 12 张 | 拍在 M1 修复前，作废，T32b 重拍 |

# T32b 终验（2026-11-07，feat/T32 @ 9eeed1e7，起点 42be0b33）

结论：**不通过 → T32c**（`open/T32c-choreo-finish.md`）。这是同一组工作第二次不过，按规矩走 C：剩余项收窄成一张小单，失败计数不清零；T32c 再不过就把 T32 挪 `blocked/` 重拆。
F1/F2（真因 pointer-events、撤豁免、744、overlap 真算）这次做对了，核心问题已解决；没过的原因是有一条新发现的真 bug，加上 T32b 自己列的几项没做、回执又有一处说法与实物不符。

## 经理亲跑
- 19:21 load 4.30，跑了 `PATH="$PWD/node_modules/.bin:$PATH" sh scripts/run-e2e.sh tests/e2e/onboarding.spec.ts` → `6 passed (32.7s)`，④ 12.2s，EXIT=0 ✓
- `grep -n "overlap = false\|castCovered\|cast 命中视为可见" tests/e2e/onboarding.spec.ts` → 无输出 ✓
- `git diff 42be0b33..9eeed1e7 -- app/ui/renderer-grok/frontend | wc -l` → 0（上游零改动）✓；`--stat` 只有 css / onboarding.spec / shot-t32.spec / 12 张截图 / tickets ✓
- 截图 mtime 19:17:28–39，修复提交 19:18:08 就是带着这批图的那一笔，代码已在工作区 ✓
- 没跑：变异刀（按派发说明抽读回执）、vitest、kickstart+bots。理由：本轮已判不过，留到 T32c 一起跑

## 逐条核实
| 项 | 结论 |
|---|---|
| 1 onboarding 6 passed | 亲跑成立 ✓ |
| 2 撤豁免 | spec:125 visCheck 只认 `hit===el \|\| el.contains(hit)`，失败带 className ✓；spec:158 overlap 是真实的盒相交（mates×cards，cards 含选项卡和底栏钮）✓ |
| 3 CSS pointer-events | `onboarding-steps-0793.css:9` 在。`onboarding-view.tsx:181-183` sceneOf 只把 role/attribution/connect 映射成 `'tools'` 并赋给 `data-step`，meet/cd/jobs 的 gazing 交互不受影响 ✓。小问题：原 :5 z-index 行的注释「T32 #1d：盖住侧栏…」被挪到了 :9 pointer-events 行尾，读起来像在解释 pointer-events（LOW） |
| 4a ⑩a | spec:84 meet 标题 opacity poll='1'，:85-87 meet 页侧栏覆盖 ✓。不用 history.back 的理由（walk 没有历史条目）成立 |
| 4b ⑩b | spec:105-107 cd 底栏 [0]=Next、[1]=Back ✓ |
| 4c connect 三全套 | spec:203-207 visCheck(listitem 2 + h1 1) + geo + castOk ✓ |
| 4d idle | spec:154 取角色元素自身的 `data-character-state`，:166 断言 ✓；:159 `idleOk` 算了但没用，是死变量（LOW） |
| 4e __t32 meet→connect | spec:88 挂、:208 查 ✓ |
| 4f 退场 | meet→cd：spec:90-102 animation 含 exit、归 0 ✓。**缺「记录里有旧步 heading id」**：exitsCd 只记 animation（:94）；role→attribution 记了 heading（:183），但没断言它等于 `sand-onboarding-role-heading`（:190-191 只断长度和 exit 字样）。T32 验收 2 和 T32b F4 都点名要这条 → **不成立（MED）** |
| F5 末排卡 bottom ≤ 底栏首钮 top−8 | T32b 改法 5 要求做，spec 里没有，回执也没提 → **缺（LOW）** |
| 5 截图 | role.light 亲看：9 卡 3×3、宽约 624、三个 teammate 在标题两侧上方、不压卡 ✓。attribution.light 亲看：12 卡 3 列×4 排、左缘约 268、右缘约 1012，即 744 ✓。蓝 teammate 盖住标题末尾的「?」。TOOL_POSITIONS 和标题文字都与 0.79.3 相同，0.79.3 大概率也这样，没有参照图，不判，记观察 |
| **新发现 R1：侧栏底部没盖住（MED，真 bug）** | role/attribution 两张图左下角都露出账号圆「P」和「Connect apps」药丸，回执写的「无侧栏（被引导层盖）」与图不符。根因：`p5-55-layout.css:73-74` 的 `.sand-agents-sidebar__account` 是 `position:absolute; z-index:3 !important`，而且（:125 的 `div:has(> div > .sand-agents-sidebar) > .sand-agents-sidebar__account`）它是侧栏的兄弟节点，不在侧栏 z-index:1 的层叠上下文里，所以 z3 盖过了 `.sand-onboarding{z-index:2}`。spec 的侧栏覆盖只测了 (140, ih/2) 一个点，测不到这里。T32 的目标「引导整窗盖住侧栏」没有达成 |
| 6 改动范围 | ✓ |
| 变异 | 回执只做了 Vg/Vh 两刀，却写成「两刀（工单要求）」。T32b 验收 4 要求六刀（Vc–Vf 同 T32）。Vc–Vf 针对的实现没变、断言只加强没放宽，T32 回执里的红输出可以沿用，这条不卡，但回执说法不对。Vg 的失败信息是 `[object SVGAnimatedString]`：命中的是 SVG，`className` 不是字符串，没达到「看得到 cast className」的要求（LOW） |
| 回执缺项 | T32b 验收 1 的 vitest ≥233、kickstart+bots 13、check diff=0 没贴；验收 3 的 F4 逐项行号没给；验收 5 只写了 2/12 张截图 |

## 顺带：主仓脏截图
主仓 `/home/lingxufeng/bot`（docs/rebuild-p6-p5-plan）有 12 张 `work/grok-0.79.3-re/ours/onboarding-*.png` 处于未提交修改状态，是旧版 shot-t32 用绝对 OUT 时写进去的。合并 feat/T32 前，主 agent 应先 `git checkout -- work/grok-0.79.3-re/ours/` 丢掉它们，否则会和合并冲突。

# T32c 终验（2026-11-07，feat/T32 @ c4a794cd 本体 / 8a6bb0a3 回执，起点 9eeed1e7）

结论：**通过**。T32 / T32b / T32c 三张单一起挪 `done/`，accepted `2026-11-07 c4a794cd`。
上轮的 R1、退场 heading id、F5、两条 LOW 都已落实，经理亲跑和变异抽验全部吻合。回执的行号表和截图描述仍不合格（见文末），但这些都是记录问题，对应的东西经理已逐项亲验，不因此卡单。

## 经理亲跑（20:21 load 4.84，没有撞上其他 e2e）
- 先从 HEAD `pnpm run build` 重建（BUILD_EXIT=0），产物 `out/renderer/assets/index-aIjafGSZ.css` 里有 `.sand-onboarding{z-index:4`
- onboarding：`6 passed (29.6s)`，④ 11.7s ✓
- kickstart + bots：`13 passed (48.0s)` ✓
- vitest grok-shim + fold：`Test Files 17 passed (17)`，`Tests 233 passed (233)` ✓
- renderer-grok check：`upstream diff=0: 332 files` ✓
- 改动范围 `git diff --stat 9eeed1e7..8a6bb0a3`：只有 css 一个文件（+2/−2）、onboarding.spec、work/**、12 张截图，没有越界 ✓

## 变异抽验（两刀都由经理亲手做，做完 checkout 还原，重建后 ④ `1 passed`）
- **Vi**（z-index 4 改回 2）：`Error: meet acct 点被引导层盖住`，spec:89 红 ✓。先红的是 onb 断言，失败信息里没有命中元素的 class，只能从 label `acct` 看出是账号圆这个点。工单要求「能看到 account 或药丸」，这个程度够用（LOW 观察，不返修）
- **Vg**（删 :9 pointer-events）：`".sand-onboarding__attribution-choices button[7] 出框或被遮(sand-onboarding__cast-hero)"` ✓。上轮这里是 SVGAnimatedString，现已修好
- Vj 没重跑：它改的是 spec 的记录逻辑，有 :109 的断言文本兜底；回执里有原样红输出，采信

## 逐条核实
| 项 | 结论 |
|---|---|
| R1 z-index | css:5 `z-index: 4`，注释写的是「≥ account/plugins 的 z3」，原注释已从 :9 挪回来，:9 换成 pointer-events 自己的说明 ✓。经理复查 grep：overrides 和 production 下只有 t7b z1000、dead-entries z20、production z3000 三处。又扫了上游 frontend/src 的全部 css：z200 是 `.sand-outline-panel`（产品面，引导期不可达，dead-entries 已把它压到 z20）；computer shell 的 z40/z5 在引导层自己的层叠上下文里；chat-input-dock 是 z3，低于 4。结论成立 ✓ |
| 侧栏三点 | spec:83-93 coveredAt 测 (140,ih/2)、(34,ih-32)、(160,ih-34)，排除集含 `.sand-agents-sidebar__plugins-entry`；meet 在 :95、role 在 :187 调用 ✓。Vi 证明这几个点真能红 ✓ |
| 退场 heading id | exitsCd 记 `{anim, heading}`；:108 断 anim，:109 断 `sand-onboarding-meet-heading`；role→attribution 在 :202 断 anim、:203 断 `sand-onboarding-role-heading` ✓ |
| F5 | :151 采 bLast/fBtnTop，:162 断 `bLast ≤ fBtnTop−8`；role 在 :184、attribution 在 :208 传入 `lastGap:true` ✓。找不到 fBtn 时取 −1，会红不会空转 ✓ |
| LOW visCheck / idleOk | :134-136 已改为 getAttribute('class')，空时 fallback 到 cast closest；idleOk 已删 ✓ |
| 截图 | 12 张 mtime 20:19:57–20:20:08，本体提交在 20:18:20，是修复后拍的 ✓。经理亲看 7 张：meet.light、attribution.dark、attribution.light、role.light、connect.dark、computer-demo.dark、jobs.light。左下角都没有 P 圆，也没有 Connect apps 药丸 ✓。role 9 卡 3×3；attribution 12 卡 3 列×4 排；三个 teammate 在标题两侧和上方，不压卡 ✓ |

## 回执问题（记录在案，不返修）
1. **行号表与实物不符**。工单验收 3 要求「附 grep -n 原样输出、只写已存在的东西」，回执没贴 spec 的 grep 原样输出，行号也大多是抄工单里的旧行号或者猜的。正确行号见上表，经理用 `grep -n "coveredAt\|heading id\|lastGap\|bLast\|fBtnTop\|getAttribute('class')\|idleOk"` 亲取：83/95/108/109/135/144/152/162/184/187/203/208。具体出入：回执写 :97 实为 :95，:190→:187，:94/:102-103→:102/:108-109，:186-187→:202-203，:150-151→:162，:170/:196→:184/:208。**三轮里回执与实物不符是同一个毛病**，建议施工方以后写回执行号时先跑 grep，再从输出里复制
2. 截图逐张描述只有 2 张写全，其余是「同版式」一笔带过，同样没达到验收 4 的字面要求。经理已亲看 7 张补上

## 观察（不属于 T32 范围）
- attribution.dark 的 12 张卡在暗色下几乎看不到边框，只剩文字；亮色版有边框。可能是暗色边框对比度太低，主线 T7bf 正在做对比度断言，合并后可以顺带核对。0.79.3 暗色没有参照图，这次不判
- 合并注意：本分支改了 `work/LEARNINGS.md`，主仓工作区里这个文件也有未提交修改，合并前要先处理掉，避免冲突。上轮提到的主仓 12 张脏截图也要先 `git checkout -- work/grok-0.79.3-re/ours/`
