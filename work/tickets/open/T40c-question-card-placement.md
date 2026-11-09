# T40c：提问卡排在提问发生的位置，不是永远压在对话最底下

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：T40+T40b 终验 G1（`receipts/T40.receipt.md`「T40+T40b 终验」段；截图 `work/exp-polish/evidence/T40/dismissed.light.png`：`done` 显示在已答卡上方）
> 分支 / 作业目录：feat/T40c @ /tmp/bot-wt/T40c（从 T40 合并后的集成分支起）
> claimed：
> accepted：

## 目标
bot 问过的问题卡留在提问那一刻的位置；bot 后来说的话、用户后来发的消息都排在卡**下面**。现在卡恒拼在 transcript 尾、批永不删除，所以每个历史提问永远压在对话最底下。

## 根因
`shim/src/data.ts` `entriesOf` 把 `questionEntries(agentId)` 拼在 `main` 之后；`questionBatches` 发出后保留（T40 定案「历史可见」）。T40 定案写的「排在对话流末尾」是经理方案缺陷，不是施工错。顺带：`timestampMs: Date.now()` 每次投影都变（T40 终验 F4）。

## 动手前先读
1. `data.ts` `entriesOf` / `questionEntries` / `askEntries`（askEntries 用 `ask.at` 与 `callId` 找工具行，可参照）
2. 看 serialize 出的 main entries 有没有 `timestampMs`、`ask_user_question` 工具行有没有 callId，能否和 waterfall 对上（ledger 的 waterfall 本身不带 callId：`main/dsh/ledger.ts:13`）
3. RE-question-card §1.1（0.18 里 widget entry 就是普通 send-message，按时间排在 transcript 里）

## 边界
1. 只动 `shim/src/data.ts`（必要时 `questions.ts`）、`tests/unit/grok-shim/questions.test.ts`、`tests/e2e/grok-question-card.spec.ts`。
2. 先写失败测试，贴原样红输出：
   - ⑭ 单测：REQ1 进来后再往 view 推一条晚到的 assistant 文本 → `openAgentTail` 的 entries 里该 widget 卡的下标 **小于** 那条文本的下标（施工前必红）。
   - ⑮ 单测：同一批两次投影的 `timestampMs` 相等（施工前必红）。
3. 定位方案施工自定（优先：waterfall 到达时记 `at`，按 timestamp 插进 main；或锚到 `ask_user_question` 工具行之后）。在回执里写选了哪种、为什么。

## 验收
（`app/ui` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`）
1. `VR tests/unit/grok-shim/questions.test.ts tests/unit/grok-shim/coordinator.test.ts` → 全绿，含 ⑭⑮；贴施工前红尾
2. 回归 `VR tests/unit/grok-shim tests/unit/m1 tests/unit/shell` → 353 + 新增格数
3. 变异：把 questionEntries 改回拼在尾部 → ⑭ 红，贴原样红尾，cp 还原
4. 先 build，再 `test:e2e tests/e2e/grok-question-card.spec.ts` → passed；spec 加断言：`done` 文本节点在 DOM 顺序上位于三张 `.sand-widget` 之后（`compareDocumentPosition`）；重拍 `dismissed.light.png` + `dismissed.dark.png`，亲眼看（用 Read 打开，**不要上传到任何外部服务**）
5. 定向：`test:e2e tests/e2e/questions-answer.spec.ts` → passed

## 为什么这样验收
- 用户看到的是对话顺序；⑭ 和 e2e DOM 顺序断言直接守「卡在 bot 回复之前」。只看卡在不在会假绿。
- ⑮ 防止每次推送 timestamp 跳动，导致卡在列表里乱跳或日期分组错。

## 产出
- `data.ts` 改动、⑭⑮、e2e 顺序断言、`receipts/T40c.receipt.md`、两张截图
