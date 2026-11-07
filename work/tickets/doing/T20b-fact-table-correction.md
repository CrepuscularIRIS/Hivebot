# T20b：T20 事实表纠正——S2 短语采样修空、S4 形状/颜色数组与选形行为按实录

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T20 验收未通过（`receipts/T20.md` 末「验收记录」三条矛盾）
> 分支 / 作业目录：feat/T20 @ /tmp/bot-wt/T20（续用；只写 `work/grok-0.79.3-re/harness/r3/**`、`work/grok-0.79.3-re/ref/**`、`receipts/T20.md`）
> claimed：2026-11-07 main (GLM 5.3) @ feat/T20 续用
> accepted：

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
