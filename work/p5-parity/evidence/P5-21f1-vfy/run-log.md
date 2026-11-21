# P5-21.f1 验收运行日志（verifier 自跑）

- worktree：/tmp/bot-wt/P5-21f1 · HEAD 8a47a645415d9315916dc5765c0642bca1088fff（=申报）· 基点 34da8f9 · git status 干净
- 时间：2026-11-03 15:09–15:12（每步前 `date +%H:%M` 实测）
- HOME=/tmp/bot-vfy-p5-21f1（临时 HOME，用后已删）；e2e 经 scripts/run-e2e.sh 自带 `xvfb-run -a`（真实桌面零弹窗）

## 0. build（派发词要求先 build，实测 dist 重建）

```
15:09  pnpm build → ✓ built in 1.11s（renderer assets 重出）
```

## 1. market.spec.ts 自跑（改动后）

```
15:09  pnpm test:e2e market.spec.ts
Running 2 tests using 1 worker
  ✓  1 tests/e2e/market.spec.ts:92:5 › P-C ①：浏览 / 搜索 / 分页 / 切源重置 / 三分类 109-1-1 … (10.6s)
  ✓  2 tests/e2e/market.spec.ts:175:5 › P-C ②：安装旅程 … + D5 真实旅程 … (15.6s)
  2 passed (26.7s)
```

## 2. journeys/d4-d5-d6-journey.spec.ts 自跑（改动后）

```
15:09  pnpm test:e2e journeys/d4-d5-d6-journey.spec.ts
  ✓  1 tests/e2e/journeys/d4-d5-d6-journey.spec.ts:37:5 › D4→D5→D6 全旅程 … (14.0s)
  1 passed (14.4s)
```

## 3. 坏路径：改动前状态复现红（撤掉答卡 → 应红）

方法：`git checkout 34da8f9 -- app/ui/tests/e2e/market.spec.ts` 取基点版（无答卡），
单跑同一用例；产品代码基点↔HEAD 零差异，dist 不需重建。跑完即
`git checkout 8a47a64 --` 还原，`git status --short` 空（现场未动）。

```
15:10  pnpm test:e2e market.spec.ts -g "P-C ②"
> 263 |     await expect(page.locator(`[data-pane="${x}"] .tool-row[data-status="done"]`), 'X 实调连接器工具成功').toBeVisible({ timeout: 60_000 })
     Error: X 实调连接器工具成功（element not found，60s 超时）
  1 failed
WORKTREE-CLEAN
```

红点、红法与 builder 申报及 main 根因（shell-ask.mjs:199 `mcp__` 前缀一律 ask → 出审批卡没人答 → 永不 done）一致；
与「加答卡即绿」构成双向差分：改动必要性实证，非假绿。

## 4. 静态复核（另见 VERIFY 表）

- `git diff 34da8f9..8a47a64 --stat`：恰 2 文件 +12/-0；`git show 8a47a64` 确认产品代码零改动。
- 3 处插入位置：market.spec hunk @260（原 :263 前）、journey hunk @90（原 :93 前）、hunk @126（原 :129 前），与申报行号一致；每处 +4 行（1 注释 + waitFor 答卡 + 点 approve + locator 声明）。
- 全仓实调面：`grep -rn 'mcpCall(' tests/e2e/` → 恰 3 处（market:260、journey:90、journey:131），即全部已带答卡。
- 反向扫 `tool-row[data-status="done"]` 等待全仓 4 处：3 处为本次改动；journey:118 为 D6a 历史回放（读 D4 已批准定稿行，非新实调，无需答卡）。
- workspaces.spec p25-x/y（:96/:115）自带答卡且为 bashCall 非 mcp__；settings/bots/d10b-d7 等无 writeScriptCalls 实调。无第 4 处遗漏。
