# T58c：T58 第二次返修——「删后空」态 Done 越出滚动容器（2/3 轮红）+ 回执/截图名两处不实

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：`receipts/T58b-T68.acceptance.md`；父单 `doing/T58-market-overlay-align.md`、`doing/T58b-market-done-label-and-states.md`
> 分支 / 作业目录：feat/T58 @ /tmp/bot-wt/T58（接 0b578f36）
> 失败计数：T58 线第 2 次退回。T58c 再不过 → 经理任务 C 重规划，不再开 T58d。
> claimed：0b9a2d58（时间线判定中间帧+Empty 终态标记+pressSequentially/toPass 根治；连跑 5 轮全 2p；market 3p——doing 待批审）
> accepted：2026-11-12 manager 复验通过 @0b9a2d58（3 轮 2p，load 32→22；见 receipts/T58c-T68b.acceptance.md）

## 目标
1. **删后空态红**：经理在 0b578f36 上跑 3 轮 `t58-market-layout.spec.ts`，2 轮在 `:257 doneIntactProd('删后空')` 红，两次读数完全相同：`Done bottom 607.5 > .pb-market__scroll bottom 478.5`（差 129px）。读数确定、只是出现与否随时序——说明「删掉最后一条」后存在一个**确定的布局态**，Done 落在滚动容器裁切区外 129px。回执「三轮全过」不成立。
2. 回执两处不实：`sources-error-light.png` 来自 env 段（:199，两源+错误），不是生产段；`sources-one-dark.png`（:207）仍是 env 段两源暗色，冒名「one」。

## 口径
- **先判这是真 UI 态还是测试抢拍**：在删除后每 50ms 记一次 `Done.rect / .pb-market__scroll.rect / [data-index-item] 计数 / 当前视图标记` 共 3s，回执贴时间线。
  - 若 607.5/478.5 是**终态**或持续 >1 帧可见：这是真缺陷（用户删完最后一条会看到 Done 被切）→ 找根因改 `.pb-market__*` CSS（或 market-surface 的视图切换，超边界先停写存疑）。
  - 若只是删除过程中的中间帧：断言改成等布局稳定（`expect.poll` 等两帧读数一致）后再判，**不得放宽阈值**；回执写明中间帧是什么（如空态块挂载前 / 列表卸载后）。
- 不许用 `.catch` 或 `test.fixme` 吞掉这一态。

## 边界
1. 只动：`tests/e2e/t58-market-layout.spec.ts`；如确为真缺陷，另可动 `overrides/p5-57.css` 市场段。
2. 先跑红：现 spec 连跑 5 轮，回执贴红的轮数与读数。

## 验收
（`cd /tmp/bot-wt/T58/app/ui && pnpm build`；e2e `CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh <spec>`）
1. `… t58-market-layout.spec.ts` **连跑 5 轮全 2 passed**，回执贴每轮尾行。
2. 截图名：生产段补截 `sources-error-light.png`（一条态 + twice 错误，:252 之后）；env 段 :199 改名 `sources-two-error-light.png`，:207 改名 `sources-two-dark.png`；旧冒名文件从 evidence 删除。
3. `git diff --stat 0b578f36..HEAD` 只含边界 1 的文件。

## 为什么这样验收
- 「删完最后一条」正是 T51 空态缺陷的入口；时有时无的红要么是真毛病，要么是没等稳的测试——两者都不能带着合并。连跑 5 轮是因为本次实测命中率 2/3，3 轮全过的说法已被推翻。
