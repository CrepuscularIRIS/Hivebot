# T37b：send_to_bot / stop_bot 描述里的漏网叫法

> 开单：manager (Opus 5.5) | 日期：2026-11-08 | 施工：main (GLM 5.3)
> 来源：T37 终验第 5 条（`receipts/T37.receipt.md`）；T37 存疑 1
> 分支 / 作业目录：feat/T37b，小改动不开 worktree（只碰 SDK 两处描述 + 测试）
> claimed：2026-11-08 08:5x main (GLM 5.3) @ feat/T37b
> accepted：

## 目标
模型看到的 `send_to_bot` / `stop_bot` 工具描述里，不再把 worker 叫 bot，也不再说 subagent「在 Workers 里看不见」。

## 定案（逐字，施工不发挥）
- `app/sdk/src/orchestration/stop.mjs:29` 整句替换为：
  `'The user can inspect that worker in the Workers group while the main conversation stays responsive. This controls create_bot workers, not subagent helpers.',`
- `app/sdk/src/orchestration/send.mjs:36` 整句替换为：
  `'The work stays visible in that same worker in the Workers group while the main conversation remains responsive. Use this for create_bot workers, not subagent helpers.',`
- 其余句子、工具名、schema 不动。

## 动手前先读
1. `app/sdk/src/orchestration/{send,stop}.mjs` 对应行
2. `app/sdk/tests/unit/orchestration-routing.test.ts` 末尾 T37 格

## 边界
1. 只动：`send.mjs`、`stop.mjs`、`tests/unit/orchestration-routing.test.ts`（扩 T37 格）、受影响的 send/stop 测试锚（若有，回执列出）、`work/**`。
2. 先写失败测试：T37 格扩成四个描述都查——`ROUTING_PROMPT`、`CREATE_BOT_DESCRIPTION`、`SEND_TO_BOT_DESCRIPTION`、`STOP_BOT_DESCRIPTION`（数组先 `join(' ')`）均不含 `worker bot`、`Workers bot`、`that bot`、`not visible`。先跑红（send/stop 两条红），再改文案。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。

## 验收（`app/sdk` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`）
1. 先红输出贴回执
2. `VR tests/unit/orchestration-routing.test.ts tests/unit/orchestration-send.test.ts tests/unit/orchestration-stop.test.ts tests/unit/orchestration-create.test.ts tests/unit/orchestration-routing-live.test.ts tests/unit/orchestration-default-chain-live.test.ts` → 全绿
3. `grep -rnE "worker bot|Workers bot|that bot|not visible" app/sdk/src app/ui/main app/ui/renderer-grok/shim/src app/ui/renderer-grok/overrides`（仓根跑）→ 只剩注释行（贴原样）
4. `git diff --stat main...feat/T37b` → 只有上面列的文件

## 为什么这样验收
- T37 漏网的根因是 grep 关键词只有 `worker bot`；这次把四种说法都写进测试，以后谁再写回旧叫法会红，不靠人记得。
- 文案逐字定稿：T35 复测要测定稿文本。

## 产出
- `send.mjs`、`stop.mjs` 两句；`orchestration-routing.test.ts` T37 格扩展
- `work/tickets/receipts/T37b.receipt.md`
