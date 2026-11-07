# T29：删 ToolResultCard 死路径（queue 提议⑤转单）

> 开单：main (GLM 5.3)（queue U3b 标注：机械删除，主 agent 直接按模板写单）| 日期：2026-11-07
> 来源：T22 合并后主聊天不再喂 tool-call（entries.ts 不产 tool-call raw）——`overrides/modules/model.ts` 的 ToolResultCard 投影成死路径
> 分支 / 作业目录：feat/T29 @ /tmp/bot-wt/T29
> claimed：
> accepted：
> 失败计数：0

## 目标
删 `overrides/modules/model.ts` 里 ToolResultCard 投影三函数（resultCardKind/resultCardStatus/toolResultOf）与 projectOne 的 tool-call attach 段及其 import；`p5-w3f1/w3f3.test.ts` 的 tool-call 卡片段随之改为断言**不产** toolResult。model.ts 的其余功能（R3 分页 scope / R5 重试复用）不动。

## 边界
1. 只动：`renderer-grok/overrides/modules/model.ts`、`tests/unit/grok-shim/p5-w3f1.test.ts`、`tests/unit/grok-shim/p5-w3f3.test.ts`。
2. 上游零改动（check diff=0）；与 T23 不共文件。
3. 先红：先改两测试断言（tool-call 投影不再带 toolResult）跑红（现实现还带），再删实现转绿。

## 验收
1. `vitest run tests/unit/grok-shim` 全绿（w3f1/w3f3 的非卡片格不减）
2. `renderer-grok check` → diff=0
3. `git diff 起点..HEAD --stat` 只含边界三文件
4. 变异：无需（删除类；「先红」即防回归）

## 回执
先红输出、删改对照（函数/行数）、unit 计数。
