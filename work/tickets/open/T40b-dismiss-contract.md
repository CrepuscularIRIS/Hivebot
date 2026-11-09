# T40b：提问卡 Dismiss 按钮真能关卡（T40 终验返修）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：T40 终验不通过第 1 次（`receipts/T40.receipt.md`「T40 终验」段 F1–F4）
> 分支 / 作业目录：feat/T40 @ /tmp/bot-wt/T40（接着 92f1a3a7 提交）
> claimed：
> accepted：

## 目标
用户点提问卡右上角的 X（Dismiss question），这张卡变成 Dismissed 态并一直保持；整批最后一题被关掉时答案照常交给 dsh。现在点 X 卡会弹回可作答，最后一题的情形下卡变成「看着能答、怎么点都失败」。

## 根因（终验已打开文件确认）
- F1：`shim/src/coordinator.ts:149-152` dismissWidget 回 `null`。契约 `renderer-grok/source/shared/rpc/coordinator.ts:103` 是 `reply: "record"`，`recovered/runtime/coordinator-source.ts:191` 对 null 判 MALFORMED；`widget-interactions.ts` transport 也写着 null 就抛 → adapter rollback。
- F2：`data.ts` questionEntries 只在 cancel（`batch.dismissed`）时带 `widgetDismissed:true`，单题 dismiss（`answered.kind==='dismiss'`）不带；adapter `replaceEntries` 每次推送都按 entry 重建 snapshot → 下一次推送把关掉的卡重置为 idle。

## 动手前先读
1. `receipts/T40.receipt.md`「T40 终验」段
2. `recovered/features/conversation/cards/transcript-card/widget-interactions.ts`（transport 的 actionReply、adapter 的 dismiss / replaceEntries / settledSnapshot）
3. `tests/unit/grok-shim/coordinator.test.ts` 的内存端口 rig（F1 要在 coordinator 层测，不能只经 deps 直调——T40 就是这样漏的）

## 边界
1. 只动：`shim/src/{data.ts,coordinator.ts}`、`tests/unit/grok-shim/questions.test.ts`（可在 `coordinator.test.ts` 加格）、`tests/e2e/grok-question-card.spec.ts`。recovered / main / M1 不碰。
2. 先写失败测试，贴红输出再改：
   - ⑫ **coordinator 层**：经 createCoordinatorServer 内存端口发 `dismissWidget` → reply outcome `status:'ok'` 且 `value` 逐字 `{accepted:true}`（施工前必红：value 为 null）。同格顺带断 `respondToWidget` 回 `{accepted:true}`。
   - ⑬ **单题 dismiss 投影**：REQ2 下 dismiss qa → tail 里 `q-ev2-qa` 顶层 `widgetDismissed === true`、无 `respondedValue`；再答 qb 后 qa 仍 `widgetDismissed === true`（施工前必红）。
   - 改正 `questions.test.ts:198`：重试 dismiss 的期望从 `undefined` 改为 `{accepted:true}`（这是把违约写成期望，属于测试本身错，可以改）。
   - dismiss 失败回滚（中4 格）要同时断回滚后 `widgetDismissed` 不在。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；只跑下面列的 e2e。

## 验收（写命令，不写感觉）
（`app/ui` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`）
1. `VR tests/unit/grok-shim/questions.test.ts tests/unit/grok-shim/coordinator.test.ts --reporter=verbose` → 全绿，含 ⑫⑬；回执贴施工前 ⑫⑬ 红输出
2. 回归：`VR tests/unit/grok-shim tests/unit/m1 tests/unit/shell` → 全绿，passed = 350 + 新增格数
3. **补 T40 缺的验收证据**（T40 #3 / #6）：
   - 变异 V1（攒批改逐题发）→ ③ 红；V2（custom 塞进 selected）→ ④ 红；V3（删 user-questions 分支）→ ① 红；新增 V4（coordinator dismissWidget 改回 null）→ ⑫ 红；V5（去掉单题 dismiss 的 widgetDismissed）→ ⑬ 红。各贴红输出，cp 还原，不 stash / reset。
   - 覆盖：`VR tests/unit/grok-shim/questions.test.ts --coverage --coverage.include='renderer-grok/shim/src/{questions,data,coordinator}.ts'`，回执贴 T40+T40b 改动行区间的覆盖（≥80%）
4. e2e：先 `pnpm --config.verify-deps-before-run=false build`，再 `test:e2e tests/e2e/grok-question-card.spec.ts` → passed。spec 改为：
   - 第 1 批 2 题照旧（q1 点 Blue、q2 自定义 hello）→ 两张卡都变 `.sand-widget--resolved`（守 T40 中2 的 UI 面）→ 断 fake 第二轮文本 `done` 在对话里出现（替换 `:54` 恒真的 composer 可见断言）
   - 第 2 批 1 题（fake 第二轮改发第二次 `ask_user_question`，第三轮出 `done`）：点 `button[aria-label="Dismiss question"]` → 该卡 `.sand-widget--dismissed` 计 1 且 3 秒后仍为 1 → 工具结果 parse 后为 `{answers:[{id:…, selected:[]}]}`
   - 截图 `work/exp-polish/evidence/T40/{asked,answered,dismissed}.{light,dark}.png`（只截目标窗口，亲眼打开确认）
5. 定向回归：`test:e2e tests/e2e/questions-answer.spec.ts` → passed。（`grok-shim.spec:57` 已定谳主线同红，不在本单验收内。）

## 为什么这样验收
- ⑫ 走 coordinator 层是因为 bug 就在 deps 与 UI 之间的回包形状上；deps 直调的格看不见它。
- ⑬ 和 e2e「3 秒后仍为 1」守的是 adapter 每次推送都按 entry 重建状态——只看点完那一刻会假绿。
- e2e 断 `done` 出现，守的是用户真正关心的「我答了，bot 接着干」。

## 产出
- `shim/src/{data.ts,coordinator.ts}` 修改、测试格、e2e 改写
- 回执追加在 `receipts/T40.receipt.md` 末尾「T40b」段；截图 `work/exp-polish/evidence/T40/*.png`
- 施工完连同 T40 一起派 reviewer 只审 T40b 提交区间（协议面），再派经理终验 T40+T40b
