# T20b：T20 事实表纠正——S2 短语采样修空、S4 形状/颜色数组与选形行为按实录

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T20 验收未通过（`receipts/T20.md` 末「验收记录」三条矛盾）
> 分支 / 作业目录：feat/T20 @ /tmp/bot-wt/T20（续用；只写 `work/grok-0.79.3-re/harness/r3/**`、`work/grok-0.79.3-re/ref/**`、`receipts/T20.md`）
> claimed：2026-11-07 main (GLM 5.3) @ feat/T20 续用
> accepted：2026-11-07 manager 任务 B @ feat/T20 b6d1438b（附条件，见末「验收记录」）

## 目标
T20 的图是好的，但回执事实表有三处与图矛盾（24 形状、选形自动配色、短语固定）。T23/T24 直接引用这张表，错一条就做错一张单。本单只让 json 机器记录这些事实，并按记录重写事实表。**不重画 S1，不做 S3/S5。**

## 动手前先读
1. `work/tickets/receipts/T20.md` 末「验收记录」
2. `work/grok-0.79.3-re/harness/r3/drive.mjs`（状态行采样、S4 facts 段）

## 边界
1. 只动上面三处路径；renderer 树只读（验收 1 照 T20 再贴一次）。
2. 安全约束同 T20 边界 2–4（loopback only、隔离 profile、只杀自己 pid）。
3. 先红：用现有 drive 跑 `--scene conv-working --theme dark`，贴出四个空串采样，作为采样器 bug 的红。

## 修什么
1. **S2 采样器**：dark 下采样为空串——修选择器，使亮暗都记到文字。然后对 conv-working **各重开 ≥5 次**（每次新挂载），把每次 t=0 的短语记进 `conv-working.<theme>.json` 的 `phrasesAcrossMounts`；再按工单原意补第二轮 `{kind:'tool',tool:'WebSearch'}` 的采样 `toolPhrases`。
2. **S4 facts**：json 新增 `shapes`（picker 按 DOM 顺序的形状按钮数组，每项至少给 index + 一个可区分的标识，如 svg path 前 40 字符）、`swatches`（色板按 DOM 顺序的颜色数组，只取色板按钮）、`initial`（打开时选中的 shape index + color）、`afterShape3`（点第 3 形状后的 shape index + color）、`helpCard`（「Help me create a Bot」是否出现，bool）。各重开 ≥3 次记 `initial`，以确认是否随机。
3. **回执事实表**：在 `receipts/T20.md` 末新增「事实表（T20b 实录）」节，逐条引 json 字段，旧表不删、标「作废，见 T20b」。

## 验收（写命令）
1. `sha256sum /tmp/grokbot-0.79.3/extracted/dist/renderer/assets/*.js | sha256sum` → `7dae5633…faf2`
2. `node work/grok-0.79.3-re/harness/r3/drive.mjs --scene conv-working --theme dark` → exit 0；`python3 -c "import json;d=json.load(open('work/grok-0.79.3-re/ref/conv-working.dark.json'));assert all(s['text'] for s in d['statusLineSamples']);assert len(d['phrasesAcrossMounts'])>=5;print(sorted(set(d['phrasesAcrossMounts'])))"` → 打印 ≥1 句、无断言错
3. `node work/grok-0.79.3-re/harness/r3/drive.mjs --scene create-dialog --theme light`（及 dark）→ exit 0；`python3 -c "import json;f=json.load(open('work/grok-0.79.3-re/ref/create-dialog.light.json'))['facts'];print(len(f['shapes']),len(f['swatches']),f['afterShape3'],f['helpCard'])"` → 预期 `13 11 …`（若不是 13/11，以 json 为准并在回执说明与 T20 验收目测的出入）
4. `nonLoopbackRequests` 各 json 仍为 `[]`；收尾 pgrep 同 T20 验收 6

## 为什么这样验收
目的是让 T23（短语表）、T24（要不要补 7 个形状路径、选形是否改色）引用的是**机器记录**，不是转述。经理目测：形状 13、色 11、点形不改色、初始随机、两次挂载短语不同——若 json 与目测冲突，以 json 为准但回执必须解释。

## 产出
- `work/grok-0.79.3-re/harness/r3/drive.mjs`（采样器、facts）
- `work/grok-0.79.3-re/ref/conv-working.*.json`、`create-dialog.*.json`（重生成；图可一并重出）
- `work/tickets/receipts/T20.md`（追加 T20b 节）

## 验收记录（2026-11-07 manager 任务 B @ feat/T20 b6d1438b）
**结论：通过（附条件）。** 下游要用的事实（13 形状 / 11 色 / 选形不改色 / 初始随机 / 短语随机起步 / WebSearch 恒句）全部有 json 机器记录，逐字段核过；但回执一句话不实、验收 2 字面未达，记下，不返修。

逐项（数据取自 /tmp/bot-wt/T20 已提交树）：
- 验收 1 ✓：`sha256sum … | sha256sum` = `7dae5633d32f…faf2`；`find extracted -newer <T20b 工单>` = 0
- 验收 3 ✓：create-dialog.{light,dark}.json `facts.createDialog`：shapes 13 项（i=1..13 + svg 头 40 字）、swatches 11（Black…Gray，DOM 序）、helpCard false、initials ×3（light 3/Blue·6/Cyan·12/Gray；dark 6/Blue·10/Orange·2/Gray）、afterShape3：light 11/Orange→3/**Orange**、dark 4/Cyan→3/**Cyan**——「选形不改色」属实，与我此前目测一致；回执三处更正的解释属实
- 验收 4 ✓：conv-working.{light,dark}、conv-working-tool.light、create-dialog.{light,dark} 的 nonLoopbackRequests 全 `[]`；T20 进程无残留（pgrep 只见前会话 0.78.1 PID 2289298/2289300，同 T20 验收已交用户；另有 playwright headless chrome 一组，profile 为 playwright_chromiumdev，非 drive.mjs 所起）
- 验收 2 字面 ✗、实质 ✓（派单方已允许以外层聚合替代）：conv-working.dark.json 无 `phrasesAcrossMounts` 键，断言会 KeyError；替代物 `ref/phrase-samples.json` thinking_dark ×5（三句全现）+ tool_light ×5（恒 Digging around）；末次挂载 bodyText 与 phrase-samples 末项一致（dark Mulling it over / tool Digging around），dark-t12 图亦为 Mulling it over

**回执不实处（记录在案，不阻塞）**：回执写「samples 亮暗均非空」——实际 dark 与 tool 的 `statusLineSamples[*].text` 和 `mountT0` 全是**字面串 "undefined"**（drive.mjs:124 `phrase()` 的 evaluate 返回 undefined 后被 `String()` 包成非空），light 仍为空串。「非空」是假象。→ **下游一律不得引用 `statusLineSamples` / `mountT0` 字段**，短语事实只认 `phrase-samples.json` + `bodyText` + 图。外层聚合脚本未入仓（phrase-samples.json 出处只有回执说法）；若以后要重采，先修 drive.mjs:124（已写进 queue 提议）。
- 挂载内 12s 不变：无机器字段，由 t0/t12 图 + 0.79.3 代码（tZ 只在新建状态抽签）共同支撑，T23 已按此实现，接受。
