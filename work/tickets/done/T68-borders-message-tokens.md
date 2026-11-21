# T68：会话区残留的 0.18 橄榄色硬编码换 0.78.1 token——hover 动作钮 / 附件卡 / 发送状态行 + agent 气泡宽度

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`work/ui-borders-connect/BRIEF.md`；规格 `work/grok-0.79.3-re/RE-BORDERS-0.78.1.md` §2.4 / §2.7 / §5（hover 动作钮、附件行、气泡几何三行）
> 分支 / 作业目录：feat/T68 @ /tmp/bot-wt/T68（从 T66 合并后的集成分支开——同改 p5-55-layout.css，排在 T66 后减少三方合并）
> claimed：96f176ab（全集格 8 残留清零+变异红+回归 theme-dual 2p/visual 1p；grok-shim 环境性超时三基线一致——doing 待批审）
> accepted：2026-11-12 manager 复验通过 @f246e4f3（经 T68b 返修闭合；见 receipts/T58c-T68b.acceptance.md）

## 目标
会话区里还有一批 0.18 移植树写死的深橄榄色块（`#20231f` 底 / `#343832` 1px 边 / `#a9afa3`、`#92998d`、`#c7ec6b`、`#f0a7a7`、`#798076` 字色），亮色主题下是一块块「深色补丁」，暗色下边框也比原版硬。按 0.78.1 token 换掉；顺带 agent 气泡最大宽度对齐。

## 经理核对过的现状（p5-55-layout.css 已盖掉的不再动）
| 构件 | 现值（recovered view.css，未被覆盖） | 0.78.1 | 动作 |
|---|---|---|---|
| 消息 hover 动作钮 `.sand-message-hover-actions__button` | :133 `#20231f` 底、`1px #343832` 边、`#a9afa3` 字；:134-135 hover `#292d26` 底 + `1px #a9c85d` outline | elevated 变体：`1px solid --sand-border-tertiary-translucent` + `--sand-bg-elevated`，hover `--sand-bg-elevated-hover`，字 `--sand-text-secondary`→hover primary；焦点环 `--sand-border-focus-primary`（RE-BORDERS §2.7 / §1） | 改 |
| 消息附件卡 `.sand-message-attachment` | :269 `#20231f` 底、`1px #343832` 边；:272 small `#798076` | `border:0` + `box-shadow: 0 0 0 .5px var(--sand-border-attachment-card), 0 1px 4px var(--sand-shadow-secondary), 0 6px 12px var(--sand-shadow-card)`、底 `--sand-bg-elevated`、副文字 `--sand-text-tertiary`（§2.4 `sand-1jf74b8`） | 改 |
| 排队 / 发送失败行 `.sand-queued-send-notice` / `.sand-failed-send-actions` | :192-194 `#92998d` 字、按钮 `#c7ec6b`、错误 `#f0a7a7` | 字 `--sand-text-secondary`、按钮 `--sand-text-accent-primary`、错误 `--sand-text-danger-primary`（调色板已有，经理核过） | 改 |
| agent 气泡最大宽 `.sand-message` | p5-55-layout.css:189 `max-width:560px` | `min(80%, 560px, calc(100% - 82px))`（§5 气泡几何；user 侧 :212 已是此值） | 改 |
| typing 气泡 / 时间分隔 / 气泡玻璃环 / padding 7 12 | p5-55-layout.css:183-215 已覆盖 | — | 只断言 |
| composer 内附件 chip `.sand-prompt-attachment`（:319） | `1px stroke-secondary` + bg-tertiary（token 化了，非硬编码） | 第 0 步在 `ref/border-rules-0.78.1.txt` 查 composer 附件 chip 是否同 `sand-1jf74b8` 附件卡环 | 有锚才改 |

**不在本单**：mermaid / media 全屏查看器的同色硬编码（view.css 的 `.sand-mermaid-*` / `.sand-media-viewer*` 规则，非日常面）→ queue 提议；composer 外框（T67）；结构线（T66）。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md 末条（特异性：recovered 规则 0,1,0 级，覆盖层统一 `!important` 即可；DPR）
2. RE-BORDERS §1 / §2.4 / §2.7；recovered `view.css:133-135, 190-194, 269-272, 319`；`overrides/p5-55-layout.css:180-215`
3. 能造出 agent 消息 + 附件 + 排队态的现成 spec：`theme-dual.spec.ts`、`grok-shim.spec.ts`、`d1.spec.ts`（照搬其 fake provider 起会话的写法，不新造夹具）

## 边界
1. 只动：`overrides/p5-55-layout.css`（B 节内新增「T68 会话区 token 化」一小节 + :189 一行）、新 `app/ui/tests/e2e/t68-message-tokens.spec.ts`。**不改** recovered view.css（保持移植原样，覆盖层压）、不改 TSX、不改调色板。
2. 先写失败测试：下面验收 1 的「全集无橄榄色」格先跑红。
3. 色值走 token 求值比对。
4. 测试走隔离 HOME / TMPDIR，DBus 指不存在路径；不跑全量 e2e。

## 验收（写命令，不写感觉）
（先 `pnpm build`；e2e `CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh <spec>`）
1. `… run-e2e.sh tests/e2e/t68-message-tokens.spec.ts` → passed（`--force-device-scale-factor=2`，首格断言 DPR 2；亮暗各一遍）。会话里至少有：1 条 agent 消息、1 条带附件的 user 消息、1 条排队或失败态消息（造不出的态在回执说明并用 DOM 注入同类名元素补，注入元素只用于读 computed）：
   - **全集格**：遍历 `.sand-virtual-transcript` 与 `.sand-chat-input-dock` 下全部元素，收集 computed `color / background-color / border-*-color / outline-color`，断言不含旧橄榄色集合 {#20231f, #292d26, #343832, #a9afa3, #a9c85d, #92998d, #c7ec6b, #f0a7a7, #798076, #9ba392, #747b70} 的 rgb 形式；**正对照**：同一遍历能找到 `--sand-fill-bubble-agent` 求值色（证明遍历真扫到了气泡）。hover 动作钮 opacity 0 也照扫（computed 不受 opacity 影响）。
   - hover 动作钮：`borderTopWidth '1px'`、色 = tertiary 求值、底 = `--sand-bg-elevated` 求值；hover 后底 = elevated-hover 求值
   - 附件卡：`borderTopWidth '0px'`，`boxShadow` 含 `0.5px` 且首段颜色 = `--sand-border-attachment-card` 求值（暗色是 12%、比亮色浓——别按亮色写死）
   - agent 气泡：窗口宽 1280 与 700 两档下 `maxWidth` 求值分别命中 560 与 `80%` 分支（rect 宽 ≤ 父宽×0.8+1）
   - 变异：删掉 hover 动作钮那条覆盖 → 全集格红
2. 回归：`… run-e2e.sh tests/e2e/theme-dual.spec.ts tests/e2e/grok-shim.spec.ts tests/e2e/visual.spec.ts` → 全 passed（visual 若有基线图因颜色变化而红，回执贴差异图并说明属本单预期变化，交经理判）
3. 截图（Read 亲眼看）：`work/ui-borders-connect/evidence/T68/transcript-{light,dark}@2x.png`（hover 住一条消息，让动作钮可见；含附件卡）
4. `git diff --stat <起点>..HEAD` 只含边界 1 的文件

## 为什么这样验收
- 用户感受到的是「亮色下冒出深色块、边框发硬」。逐个类名断言只能证明改了列出来的那几个；**全集格**拿整片会话区去比旧色集合，才能证明「没有漏网的橄榄色」——这是 LEARNINGS「防漂移格要拿全集比」的同一条规矩，并配正对照防遍历空转。
- 附件卡暗色 token 比亮色浓（RE-BORDERS §1 特殊项），亮暗分开断言防抄错。

## 产出
- 边界 1 的改动；`receipts/T68.receipt.md`（含第 0 步 chip 查锚结论）；`work/ui-borders-connect/evidence/T68/` 截图
