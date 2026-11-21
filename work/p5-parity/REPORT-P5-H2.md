# REPORT · P5-H2 · never-roots flaky 修复

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-H2 @ 1f134d5（基 92d0cc8）。改动：never-roots.mjs（handoffSiblings 两遍扫描合一 + statSync 容错）、never-roots-race.test.ts（新回归）、evidence/P5-H2/stress-race.mjs。

## 根因（实证，非 git 子进程）
handoffSiblings pass 2 的 statSync 无守卫；并发 e2e fork 的 afterAll rmSync 在两遍之间删 p2sdk-handoff-* → computeRoots 抛 ENOENT → 调用窗口内用例红（policyRoots 只是受害者）。压力脚本跨进程复现：旧实现第一次调用即抛；生产 launcher start.ts 同样暴露。副作用收益：每次少 ~568 次 stat。

## 修法（ponytail 单遍）
单次 statSync 同时拿 isDirectory+mtimeMs，try/catch 跳过刚删的；下游 existsSync 过滤兜底语义不变。

## 验证
race 回归先红后绿（mock 第 2 次 stat 抛 ENOENT 精确复刻形状）；11/11；stress 30s/1027 次零抛；**全量 5 连跑 32 files/250 全绿**（每次内部含并发 teardown 暴露面）。
