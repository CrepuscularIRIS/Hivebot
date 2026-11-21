# T30b：T30 返修——③ 空测试、版式三处没对上、暗色 Black、notice 覆盖、Enter 组字、回执缺项

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T30 经理任务 B 终验（HEAD 06c331e3）不通过
> 分支 / 作业目录：继续 feat/T30 @ /tmp/bot-wt/T30（不另开分支；T30 的单与验收照旧有效，本单只列差额）
> claimed：2026-11-07 main (GLM 5.3) @ feat/T30 续修
> accepted：2026-11-07 feat/T30 @53928cf2（随 T30/T30c 收口）｜历史：（2026-11-07 终验 @9fd43f2b 不通过：③ 变异不红、亮色贴纸边被盖住、蓝聚焦圈、暗 Create 未改、截图/证据缺 → T30c；本单随 T30 一起收口）

## 目标
把 T30 没做到、或测试没真咬住的地方补齐。T30 工单的规格、边界和验收继续有效，本单只列差额。

## 终验已确认的（不用再证）
build 退出码 0；unit entries 25 + grok-shim/fold 225 绿；e2e 0793 共 6 passed；kickstart 加 character 12 passed；check 的 diff=0。
变异经理补跑三刀，都咬住了：M1（去掉 trim）让 ① 红在 `:53 toBeDisabled / Received: enabled`；M4（setup 拼到闭合标签后）让 unit c 红；M6（改名失败不写 notice）让 ⑥ 红在 `Expected substring: "Bot created, but the name wasn't saved"`。三处都已用 cp 还原，git status 干净，dist 已按干净 HEAD 重建。

## 要修的（每条附证据）
1. **③ 是空测试**（`tests/e2e/create-dialog-0793.spec.ts:88-113`）。用例标题写「实参经 pbotsUi 记录（createBot 包一层）」，但正文没包任何东西：`void orig`，只推了一个 `'armed'`，最后只断言 Create 可用。回执说「页面 evaluate 沙箱换不了 pbotsUi 方法」，这和同一文件里的 ④ 对不上：④ 就是用 `page.evaluate` 调的 `window.pbotsUi.chooser`。照 T30 验收 2 ③ 重写，必须真的证明「折叠区里的选择进了 createBot 实参」。读法任选一条：包 `pbotsUi.createBot` 记实参；或读 `__pbotsDev` / session/list 的 preset。fake 的 preset 只有一项时，就改选连接器或 Model，断言它出现在实参里。**先做变异**：把 `presetId` 或 `effective` 在 submit 里写死，③ 要红。
2. **① 少了工单写明的断言**（`:40-45`）：缺 y 序「预览 < 名字框 < 第一个形状钮」，缺预览高度 96±4。注释里说的「grid 残留影响」不成立：`.pb-character` 已经改成 flex 列了。补上。
3. **② 少了工单写明的断言**：主聊天 user 行计数为 0、body 不含 `bot_introduction_request`、会话头的名字是 `Research Helper`。补上。
4. **暗色 Black 预览没修完**：`new-bot-dialog.tsx:156` 的 `<OnboardingCharacter …>` 没传 `surfaceTheme`，`character.tsx:389` 拿不到值就回落成 `#000`，暗色下 Black 吉祥物是黑形配深底（T30 方案 6 原文：「对话框调用处要把主题传进去」）。处理：传 `surfaceTheme={themeOf()}`；拍 dark + black 一张图，Read 亲眼看。回执贴侧栏 `AgentAvatar` 走不走 `character.tsx` 的 grep 结果（T30 回执漏了）。
5. **notice 被覆盖**：`data.ts:617` 写的是 `if (!sel.ok) notice = \`…model wasn't changed…\``，是直接赋值。改名和换模型都失败时，改名那条 notice 会丢，违反 T30 方案 3「用 `\n` 拼在一起」。改成追加。验收要加一格：⑥ 加上 `failNext('session/select-model' 或实际方法名)` + 在 More options 里选一个模型，两条 notice 都要可见。也可以单独开一格 ⑦。
6. **Enter 兜底没判组字**：`new-bot-dialog.tsx` 名字框的 `onKeyDown` 没查 `e.nativeEvent.isComposing`，用输入法组字时按回车会直接建 bot。Thn 规格写明了 `key==='Enter' && !nativeEvent.isComposing`。补上这个判断。onKeyDown 兜底本身可以保留（T30 已预先允许）。
7. **版式没对上参照图**（经理把 ref light-named 裁到 CSS 尺度，和 ours 逐项比过）：
   - 形状图形：ours 用 `ShapeGlyph` 默认的 `size=28`，ref 约 36（工单「参照图实测」写了 36）。传 36。
   - 选中形状的贴纸边：亮色下几乎看不见。描边宽 14/8 是 viewBox 单位（259），换算到 28px 后，外侧灰线只有约 0.3px。ref 上能清楚看到约 3px 表面色边加约 1px 灰线。按像素反算描边宽度。
   - 色板：直径还是 22、间距 8（中心距 30），工单要的是 24 / 中心距约 40，排 6+5。同步改 `.pb-character__colors` 的 max-width，两行之间的间距也按 ref 调。
   - 头部和底栏的分隔线：ref 有，ours 没有（工单对照项写了这条）。
   - 名字框：ref 是约 405×35 的圆角浅灰 1px 边框。ours 是底线，聚焦时外面套一圈蓝框。按 ref 改：聚焦时边框变深可以，不要整圈蓝。
   - 暗色下 Create 可用时是白字配浅灰底，看不清。和 `ref/create-dialog.dark-named.png` 对一下。
8. **截图要重拍**：ours 现在是 DPR 1 的元素截图（440×586）。`cmp.*.png` 右半边的 ref 没裁到对话框，而且两边比例不一样，没法对照。照 T30 验收 7 来：DPR 2，左右都裁到对话框、同一比例。
9. **`tests/support/ui.ts` 越界**：T30 边界 1 只允许两种例外，一是点 Create 前填名字，二是点开 More options。改 support 不在其中。二选一：(a) 撤掉这处改动，证明 market/settings/resilience/workspaces/d7 不靠它也绿；(b) 在 21f6127c 的构建上跑 `market.spec.ts` 并贴出红的输出，证明这是基线上就有的红、和 T30 无关，这样可以保留，回执写明根因（哪张单之后开始红）。
10. **回执补齐**（T30 工单「回执」节要求的，这次都缺）：先红的原样输出；M2、M3、M5、M7 的输出（M1/M4/M6 经理已跑，不用重跑）；P1，即 ② 跑完后新 sid 在 requests.jsonl 的全部行（带 `purpose`）；回归的基数和跑完后的数对比；改动行覆盖清单（逐行写由哪一格覆盖）；例外实际是 **16 行**（填名字 14 处，开折叠 2 处），commit 正文写的「12 处」要更正。另外：回执里「ref picker 更密 24 形状」是错的，ref 也是 13 个，排 5/5/3（经理已裁图核对），删掉这句。「无 bot-T30 残留」也不对：终验时发现 3 个 15:06–15:11 起的 dsh web 残留，已经 reap 了。收尾要实际跑 pgrep 并贴输出。

## 边界
同 T30 边界 1–5，再加一条：第 9 条按 (a) 或 (b) 处理。不碰上游 `frontend/**`、`source/**`、onboarding、谓词。

## 验收（命令）
前置：build 看退出码，不吞输出。
1. `vitest run tests/unit/grok-shim/entries.test.ts tests/unit/grok-shim tests/unit/fold` → 25 + 225（或更多）全绿
2. `test:e2e tests/e2e/create-dialog-0793.spec.ts` → 全 passed，① ② ③ 带上第 1–3 条补的断言，第 5 条的 notice 格也在里面
3. 变异：③ 写死 preset 或实参要红；第 5 条 notice 改回直接赋值要红；M2、M3、M5、M7 照 T30 跑，贴输出，用 cp 还原
4. 回归：照 T30 验收 5 跑两批，数目和基数一致
5. `renderer-grok check` → diff=0
6. 截图：重拍 6 张，加 cmp 拼版。经理会 Read 逐项核第 7 条列的每一项
7. `pgrep -af bot-T30 | grep -v pgrep` → 空（贴输出）

## 为什么这样验收
③ 是 T30 唯一一格专门防「折叠以后选择没提交」的测试，现在它什么都不断言，等于这个风险没人守。第 7 条：T24 的教训是「排列只在截图里、截图没人真看」，这次经理亲眼看了，差距确实存在。第 4、5、6 条是规格里写明了、代码里漏掉的。
