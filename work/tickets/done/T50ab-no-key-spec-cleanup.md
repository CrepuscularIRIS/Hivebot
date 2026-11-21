# T50ab：t50a-no-key.spec 失败路径清理 + 注释措辞

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：T50a 修复单——`receipts/T50a.review.md` MINOR 1（经理核实属实，见 `receipts/T50a.acceptance.md`）
> 分支 / 作业目录：T50a 合并后直接在集成分支改（只动一个测试文件，机械单，不再派 reviewer）
> claimed：0c475ffe（机械单：探针反转 EXIT=1 全关 + spec 重跑 1p + diff 单文件）
> accepted：2026-11-11 自验收（机械单口径：工单明示不再派 reviewer，验收 1-3 原样输出在回执）

## 目标
`app/ui/tests/e2e/t50a-no-key.spec.ts` 任一启动步骤失败时，已起的 HTTP 桩 / SDK runtime / shell 都被关掉，不留进程和端口。

## 做法（最小）
1. 在 `stub.listen` 之后立刻进 `try`；`rt`、`shell` 用 `let … | undefined` 声明在 try 外，在 try 内赋值（`launchSdkRuntime`、`launchShell` 都挪进 try）。
2. finally 逆序清理，每步各自吞错不阻断下一步：
   `await shell?.stop().catch(() => {})`；`await rt?.stop().catch(() => {})`；`await new Promise<void>((r) => stub.close(() => r()))`。
3. :116 注释「终态 DOM/console 全程不含假 key」改为「终态 DOM + 监听注册后 console 不含假 key」。
4. 断言、步骤顺序、其他文件一律不动。

## 边界
1. 只动 `app/ui/tests/e2e/t50a-no-key.spec.ts`。
2. 先红：`node /tmp/bot-t50a-sol-probe/bootstrap-cleanup.cjs` 现输出 `{"stubOpen":true,"runtimeOpen":true,"stubCloses":0,"runtimeStops":0}`（该探针以「泄漏」为通过条件，exit 0 = 仍泄漏）。
3. 隔离 HOME / TMPDIR，DBus 指不存在路径。

## 验收
1. `node /tmp/bot-t50a-sol-probe/bootstrap-cleanup.cjs; echo EXIT=$?` → `{"stubOpen":false,"runtimeOpen":false,"stubCloses":1,"runtimeStops":1}` 且 EXIT=1（探针断言反转即修好）。探针若被清掉，回执贴一个等价注入（mock launchShell 抛错）的同形输出。
2. `cd app/ui && pnpm build && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t50a-no-key.spec.ts` → `1 passed`，`echo EXIT=$?` = 0。
3. `git diff --stat` 只含该 spec 一个文件。

## 为什么这样验收
要保住的是「测试失败不污染机器」：机器在跑 GPU 训练、清进程只能 bot-reap，漏一个 SDK 进程就要人工收拾。验收 1 用注入失败直接证明清理生效，验收 2 证明正常路径没被改坏。

## 产出
- spec 改动；`receipts/T50ab.receipt.md`（两条命令原样输出）
