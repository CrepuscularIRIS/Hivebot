# T22：主聊天只留「首答 + 终答」——thinking / 工具行 / 中间轮正文不进主 transcript

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：BRIEF §用户体验反馈 1（用户原话：「grok bot 是没有 cot 的，只有回复的结果，只有第一次回答和最后一次回答」）；RE-UI-0.79.3 题 1(b)(c)、差距表 #1 #2
> 分支 / 作业目录：**feat/T21 续做**（/tmp/bot-wt/T21）。T21 回执写完即可开工，不等 T21 验收；两单一起验收、一起合并
> 排期：UI 链第 2 张（用户反馈最直接对应的一张）
> claimed：2026-11-07 main (GLM 5.3) @ feat/T21 续做
> accepted：2026-11-07 manager (Opus 5.5) 任务 B · feat/T21 HEAD d1e85205 · 通过（附 T21b：⑤ 回归格咬不住 review M1，测试单，不阻塞合并）
> 失败计数：0

## 规格（原版即规格）
0.79.3 主聊天的隐藏谓词在渲染端（APP `function LF(e){return IF(e)||bF(e)||e.kind===\`tool-call\``）和 coordinator 端（COORD `function Qz(n){return $re(n)||IL(n)||n.kind==="tool-call"`）各有一份、语义相同：**tool-call 无条件不显示；带 `suppressed` 的中间轮 message 不显示**；思考根本不是 transcript 条目。我们的 shim 就是 coordinator，所以**在 shim 序列化处过滤**（对应 COORD Qz），不改渲染端。

我们的「首答 / 终答」不需要新造 `suppressed`：fold（`renderer/fold/turn-fold.ts`）已经把一回合切成 `message role:'ack'`（首工具前的正文）、`message role:'result'`（回合结束的正文）和 `thinking from:'text'`（中间轮正文）。所以规则就是：

| 主 transcript 保留 | 主 transcript 去掉 |
|---|---|
| user、message（ack / result）、notice、peer（编排：Messaging 行 / 回报卡 / 任务卡，T27 再动）、审批卡（`permissionEntry` 的 send-message，pending 必须可见——LF 只藏 expired） | thinking（from text 与 reasoning 两种）、tool-call（ASSIGN_TOOLS 之外的；ASSIGN_TOOLS 现在本来就转成 peer notice，不变）、`live-reasoning`、`streamingAs==='thinking'` 时的 `live-stream` |

**流式终答的取舍（写进代码注释）**：首工具之后的正文在 turn/end 前分不清是中间轮还是终答（P6-03），本单让它在流式期不显示、turn/end 后作为 result 一次出现。理由：中间轮先显示再消失会闪；0.79.3 的打标在服务端、产物看不到（RE 题 1(f)），用户观察「只有首答和终答」与此一致。过程期间的可见反馈是 0.18 的 typing 点 + 侧栏吉祥物状态（T23 换成 0.79.3 状态行）。

## 动手前先读
1. `app/ui/renderer-grok/shim/src/entries.ts:58-128`（`serialize` / `toRawEntries` 是唯一改点）
2. `app/ui/renderer/fold/turn-fold.ts:1-21`（不改，只读语义）
3. T21 回执与 `shim/src/outline.ts`（outline 的数据来自 fold 输出，不经 `toRawEntries`——确认本单的过滤不会顺带掏空 outline）
4. 受影响测试（下表），以及 `work/p5-parity/harness/compare/disposition.mjs:11-12`（R10「0.78.1 会话流对 tool-call / thinking 零渲染」这条已知差异在本单后不再成立）

## 受影响测试清单（施工前跑一遍记基线，逐条按「改法」处理；回执给对照表：文件:行 → 旧断言 → 新断言）
| 文件 | 依赖点 | 改法 |
|---|---|---|
| `tests/support/ui.ts:140` `toolRows` | 全页 `.sand-outline-item[data-kind="tool-call"]` | 改成作用域 `.sand-outline-panel`（即 T21 的 `outlineToolRows`，合成一个）；调用方先 `openOutline` |
| `tests/e2e/session.spec.ts:36,58,67` | 工具行文本 / failed / done | 断言前 `openOutline`，其余不变 |
| `tests/e2e/d4-deadline.spec.ts:35` | 工具 failed | 同上 |
| `tests/e2e/journeys/d4-d5-d6-journey.spec.ts:40,85` | 工具 done | 同上 |
| `tests/e2e/p6-fold.spec.ts:85,123-124,171,204` 及 thinking 行断言（:16 起） | 工具行计数 / running / B、C 为 thinking 行 | 主 transcript：**「恰 2 气泡 A、E」原断言保留**；新增「transcript 内 thinking 行 = 0、工具行 = 0、bodyText 不含 B/C 正文」；工具计数与状态迁到 outline（`running` → outline 的 `pending`） |
| `tests/e2e/grok-shim.spec.ts` ①（「每类 entry 渲染」） | thinking / tool 在 transcript 里渲染 | 改为 transcript 只有 user/ack/assistant/审批卡，thinking/tool 在 outline 里各 ≥1 |
| `tests/e2e/visual-session.spec.ts` ①（B7 thinking 行 live→定稿、开合） | transcript 内 thinking 行 | 选择器改作用域 outline 面板；live 段改为「面板开着时流式 reasoning 出现 `live-reasoning` 行」 |
| `tests/e2e/visual.spec.ts:39-42`（B6/B7 几何）、`tests/e2e/theme-dual.spec.ts:38-39,72-73` | transcript 内工具/thinking 行样式 | 同一 `.sand-outline-item` 组件，改为在 outline 面板里量；数值期望不改 |
| `tests/e2e/p6-workers.spec.ts:259` | 编排工具不是普通工具行（count 0） | 不改，跑一遍确认仍绿 |
| `tests/e2e/d1.spec.ts:83`、`journeys/d1-real-model.spec.ts:35-37` | `live-stream` 出现 | d1（fake，无工具）应仍绿；real-model 若模型先调工具则 live-stream 不出现——跑一次，红了改为「live-stream 或定稿至少一个出现」并在回执说明 |
| `tests/e2e/launcher.spec.ts` ⑥ | 定稿非空 | 不改，跑一遍 |
| `tests/unit/grok-shim/entries.test.ts:39,45,99` | toRawEntries 产 thinking / tool-call | 改为断言**不产**；tool-call 完整 args/result 的断言（:99，L-7 R2）迁到 `outline.test.ts` 能表达的部分（summary），其余随主聊天工具卡一起退场，回执写明 |
| `tests/unit/grok-shim/p5-w3f1.test.ts`、`p5-w3f3.test.ts` | 直接调 `projectTranscriptEntry` 投影 tool-call | 不改（投影函数仍在，只是主聊天不再喂它 tool-call）；跑一遍确认绿 |
| `renderer-grok/harness/mount.mjs`（S0 桩，:2 断言 boot transcript 有 thinking / 工具行） | 桩直接喂 raw entry，不经 serialize | 跑 `pnpm -C app/ui/renderer-grok mount` 确认；它测的是上游渲染能力，不改 |

**不准**用删格、`test.skip`、放宽为 `>=0` 的方式让表里的测试变绿；确实要删的格回执逐条写理由。

## 边界
1. 产品代码只动 `shim/src/entries.ts`（过滤 + 注释锚点 `0.79.3 COORD Qz / APP LF`）。测试只动上表所列文件 + `tests/support/ui.ts`。`disposition.mjs` 删 R10 一条。`pnpm check` 上游 diff=0。
2. 不改 fold、不改 `EMPTY_RESULT_NOTICE` 文案（「展开查看过程」现在指向空处——已记 queue 提议，等 T23 定状态行时一起定）。
3. 全量 e2e 不跑；上表文件逐个跑（同一时刻一套，与 T7bd 错开；负载高时停）。

## 先红
先改 `entries.test.ts` 与 `p6-fold.spec.ts` 的新断言（transcript 内 thinking=0、工具=0、无 B/C 正文），跑一次贴红，再改 `entries.ts`。

## 验收（命令）
前置：`pnpm --config.verify-deps-before-run=false -C app/ui build`（构建时记 `git rev-parse HEAD`）。
1. `pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim tests/unit/fold tests/unit/session` → 全绿
2. `pnpm -C app/ui --config.verify-deps-before-run=false test:e2e <上表每个 e2e 文件>` → 全 passed（回执贴每个文件的计数，与施工前基线逐文件对比：总格数不减，除非回执逐条说明）
3. `pnpm -C app/ui/renderer-grok check` → diff=0；`pnpm -C app/ui/renderer-grok mount` → 照旧通过
4. 变异：M1 `toRawEntries` 恢复产出 tool-call → p6-fold 新断言红；M2 只去 tool-call、保留 thinking → p6-fold / entries 对应格红；M3 把审批卡也滤掉 → 审批相关格（`permissionDock` 可见）红——贴三刀输出
5. 截图（出自已提交 HEAD 构建）：`conv-done.{light,dark}.png`（一轮 A→工具→B→工具→E 完成后的主聊天）、`conv-working.{light,dark}.png`（gate 卡住时）存 `work/grok-0.79.3-re/ours/`；T20 S1/S2 参照在的话做 ours|ref 拼版。经理会打开看：主聊天里只看得到用户消息、A、E（进行中只看得到 A + typing 点）
6. 收尾：`pgrep -af 'bot-T22' | grep -v pgrep` → 空

## 为什么这样验收
用户的抱怨是「看到了不该看到的过程」，所以核心断言是**否定式的**（transcript 里没有 thinking / 工具 / B、C 正文），并用 M1/M2 证明它咬得住；同时 M3 防止为了「干净」把审批卡一起藏掉（那会让需要审批的回合卡死）。迁移表的意义是：工具状态这类老 oracle 不能因为看不见了就丢，挪到 outline 继续断言。

## 回执（`work/tickets/receipts/T22.md`）
先红输出、基线与施工后逐文件计数对照、迁移对照表（文件:行 → 旧 → 新）、变异三刀、截图路径与 HEAD、存疑项。
