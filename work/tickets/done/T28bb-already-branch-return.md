# T28bb：onboarding-view `already` 分支的 return 恢复为无条件

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T28b 经理验收遗留（receipts/T28b.md「经理验收」节）
> 分支 / 作业目录：可直接在集成分支（T28b 合并之后）；机械小改
> claimed：2026-11-07 main (GLM 5.3) @ 集成分支（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：2026-11-07（机械单：1 行 diff 逐字对照原行 + onboarding 6 passed + check diff=0——工单验收 1/2/3 全过；经 T28b 终验经理开单授权）（经理验收通过时填：日期、HEAD）

## 目标
T28b 把 `onboarding-view.tsx:149` 的 `return` 挪进了 `if (slotRef.current === claimed) { … }`。结果是：账号已经走过引导，并且在 setSeen 或 dwell 期间账号槽位变了的时候，代码会往下走，为旧槽位调 createAgent（产生孤儿 bot）。要恢复成 T28b 之前的语义，并且去掉没用的 roleId 实参。

## 边界
1. 只动：`app/ui/renderer-grok/overrides/modules/onboarding-view.tsx` 第 149 行，改成
   `if (already) { await bridge.onboarding.setSeen(true); await dwell.wait(); if (slotRef.current === claimed) finish(null); return }`
2. 不补测试：单账号下槽位不会变，e2e 构造不出这种情况；按代码审查验收（逐字对照 36ea874d 的原行）。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。

## 验收
1. `git diff <起点>..HEAD` 只有这 1 行，且和 `git show 36ea874d:app/ui/renderer-grok/overrides/modules/onboarding-view.tsx` 里对应的行逐字相同
2. `test:e2e tests/e2e/onboarding.spec.ts` → 6 passed
3. `pnpm -C renderer-grok check` → upstream diff=0

## 为什么这样验收
要保住的是：槽位变了以后，旧的 create 流程一律放弃，不再建 bot。原来那行就是这个语义，恢复原行最稳。
