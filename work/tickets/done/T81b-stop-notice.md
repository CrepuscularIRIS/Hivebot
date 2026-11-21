# T81b：打断回执行文案对齐原版 turnStopped

> 开单：main（机械小改，按模板直写；原无工单文件，经理验收时补档） | 2026-11-14
> 分支：feat/T81b @ /tmp/bot-wt/T81b @ 1e2a4490
> accepted: 2026-11-14 1e2a4490

## 范围
reduce.ts endNotice 的 muted 文案「已停止」→「Bot 已停止手头的事。」（锚 `messaging.turnStopped`/`vHRDVH` "Your Bot stopped what it was doing."，见 work/persona-stop-gap/RE-STOP-0.78.1.md:63）；t81a spec 补 UI 可见断言；两处单测同步。

## 经理验收（2026-11-14）
- 重跑 vitest reduce + turn-fold：2 files / 47 passed；e2e t81a-supersede：1 passed (5.2s)
- diff 只 4 文件（reduce.ts + 3 测试），测试改动仅换文案字符串与加一条 toBeVisible，未删弱断言
- 文案裁决：zh 表无此 key（原版只在外部渠道用），按原文语义中文对应可行，采纳原句，不另改
