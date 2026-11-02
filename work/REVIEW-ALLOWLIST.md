# REVIEW-ALLOWLIST · review 判据豁免清单

verifier / review 过程中裁定的判据豁免，reviewer 命中下列行时不计 finding。每行：日期 · 任务 · 豁免对象 · 事实基础 · 裁定出处。

2026-11-02 · U-13 · `grep -rn "Duplicate agent preset" app/` 命中 `app/sdk/tests/unit/p2temp.proc.mjs:65` | 该文件是 SDK 单测的 mock registry（复刻上游 packages/preset/agent-preset-registry src/index.ts:97-136 的 duplicate-throw 文案，供 T-18 in-flight 单飞测试断言），非生产判重逻辑；生产代码（app/ui/main/、app/sdk/src/）零命中 | VERIFY-U-13.md 裁定 a（D10a 判据限定生产代码 src/，测试替身豁免）
