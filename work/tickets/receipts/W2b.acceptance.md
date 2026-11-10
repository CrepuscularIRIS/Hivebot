# 验收 W2b：launcher-serve.spec try/finally + 五面 token 断言 —— **通过**

> 经理 (Opus 5.5) | 2026-11-10 | 验收对象：feat/W2b @ 997308ad（/tmp/bot-wt/W2b）

## 经理重跑
- `/tmp/bot-wt/W2b/app/ui`：`run-e2e.sh tests/e2e/launcher-serve.spec.ts` → `1 passed (5.3s)`；跑完 `ps … bot-t46c-` = 0
- 同一份 spec 合进 T46d 后在 eb9cb0b8 上也 `1 passed`（见 T46d.acceptance）
- 改动范围：997308ad 只动 `app/ui/tests/e2e/launcher-serve.spec.ts`（回执 4c832e95 在集成分支上）

## 代码抽查
finally 段：child 未退 → TERM，最多 100×300ms，再 KILL；状态行 dsh pid 在 `/proc` → KILL；`rmSync(home)`。五面 `not.toContain(tokenVal)` 都在。只杀自己起的进程，合规。

## 未重跑
验收 2（注入红前后 ps 对照）、验收 3（launcher 泄 token 变异）没重跑：回执有原样 ps 输出与失败行号，finally 代码逐行看过和定案一致，注入红是临时改动、代价高于收益。

## 结论
通过 → `done/`，accepted 2026-11-10 997308ad。
