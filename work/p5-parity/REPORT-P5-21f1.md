# REPORT · P5-21.f1（e2e 适配 P5-21 连接器 ASK 化）

- 分支：`feat/P5-21f1`（基 main 34da8f9）· commit `8a47a64` · worktree `/tmp/bot-wt/P5-21f1`
- 改动：`app/ui/tests/e2e/market.spec.ts`、`app/ui/tests/e2e/journeys/d4-d5-d6-journey.spec.ts`，共 3 处 +12 行；**产品代码零改动**

## 改动处数（3）

| # | 文件:行 | 段落 | 插入 |
|---|---|---|---|
| 1 | market.spec.ts（原 :263） | P-C② D5：X 实调 read_file | 发消息后先 `[data-approval-card]` waitFor → 点 `[data-action="approve"]`（allowed-once），再等 `.tool-row[data-status="done"]` |
| 2 | journeys/d4-d5-d6-journey.spec.ts（原 :93） | D5：X 实调 read_file | 同上 |
| 3 | journeys/d4-d5-d6-journey.spec.ts（原 :129） | D6b：重启后再调 | 同上 |

答卡写法复用本仓既有模式（journey D4 段 :56-58、workspaces.spec:96-97）；`[data-action="approve"]` 即 `answer(eventId,'allowed-once')`（renderer/plugins/session/Conversation.tsx:53）。

全仓 grep 结论：无其他「发消息→裸等连接器 tool-row done」用例。settings.spec / bots.spec / d10b-d7 / d11-d12 / restore / d1 / workspaces 的连接器旅程只覆盖 UI 勾选、recipe 断言与 meta-dead 态，不实调 `mcp__` 工具；workspaces 的两处 tool-row 等待（p25-x/y）本来就带答卡。

## TDD

- 红（改动前，worktree 内复现）：`pnpm test:e2e market.spec.ts -g "P-C ②"` → `X 实调连接器工具成功` locator `.tool-row[data-status="done"]` 60s 超时（element not found）——即派发描述的「出审批卡没人答 → 永不 done」。根因在 main：`app/sdk/src/policy/shell-ask.mjs:199` 对 `mcp__` 前缀一律 ask。
- 绿（改动后）：market.spec 2/2 绿；journeys/d4-d5-d6-journey.spec.ts 1/1 绿。

语义断言全部保留：`enabled:false`（m1Installs 等值）、Y 工具表无 `mcp__*`、结果内容（HELLO_TEXT / u31-d5-journey-evidence）、D5 完成、D6a/D6b 断言原样未动。

## 全量 e2e（worktree，dist 已重建）

```
64 passed (8.2m)
1 failed: tests/e2e/grok-shim.spec.ts:56:5（boot 阶段 .sand-agent-item 60s 不出现）
```

共 65 tests。grok-shim 处置记录（照实，非 flake 认定）：

1. 全量跑红 → **单跑复核仍红**（两次）；
2. 本分支撤掉全部改动（`git diff > patch` + `checkout --`，未用 stash）后复跑 grok-shim **仍红** → 与本改动无关的 main 存量；
3. 主仓已有认领：work/LOG.md:879、REPORT-P5-51.md 记录 grok-shim 为**稳定红非 flake**（现象：`touch /tmp/bot-p551-ws-*/p551-ok` ENOENT，沙箱看不到 /tmp 下会话工作区），已立 **P5-51.f2**。本次单跑看到的错误形态（boot `.sand-agent-item` 不出现）与之不同环节但同 spec，供 P5-51.f2 一并排查；
4. 派发词中「36s 超时历史 flake」的预期与实际不符（14:47 LOG 曾记单跑绿，15:02 修正为稳定红），以 15:02 后的记录为准。

visual-hairline.spec.ts:58 显示 ✘ 但计入 passed：该用例带 `test.fail` 标记（P5-14.f1 接线未落地的预期失败），playwright 显示惯例，非红。

## 复测命令

```sh
cd /tmp/bot-wt/P5-21f1/app/ui && pnpm build && pnpm test:e2e market.spec.ts && pnpm test:e2e journeys/d4-d5-d6-journey.spec.ts
```

未完成项 / 新问题：无新问题；grok-shim 存量红归属 P5-51.f2，不在本任务范围。
