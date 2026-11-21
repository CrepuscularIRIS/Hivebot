# REVIEW P6-21.f1 · 方向 D（回归与资源）

> 代录，未经改写。该席派发于 verifier.md 白名单修正之前，未能写 REVIEW 文件；以下为其最终回报原文。证据已由其本人写入 `evidence/P6-21f1-D/`。

- 审查对象：合并 commit `5930660`（父 `35afc63`）
- **结论：critical 0、major 0、minor 1**

- minor | `app/sdk/tests/unit/orchestration-foundation.test.ts:552` | disposed 防护及成功发送后的 Map 清理缺少断言；移除两者后现有 56 条纯单测仍全绿（变异探针确认错误行为未被测试捕获）
- 回归：全部 orchestration 单测 58/58；claim 崩溃 (iv)、停止撤回 (v)、同键恰一次、删插重排均绿
- 资源疑点 REFUTED：成功/skipped、失败接管、disposed 路径均回收；1000 个并发唯一键完成后 Map=0、读句柄全部关闭，无固定容量上限
- 证据：`evidence/P6-21f1-D/`（regression.log、probe.mjs、probe.log、变异脚本及结果）
