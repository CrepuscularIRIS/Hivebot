# T34b：T34 live 补格——⑤ 环境泄漏探针 + ④ 断言收紧

> 开单：manager (Opus 5.5) | 日期：2026-11-08 | 施工：main (GLM 5.3)
> 来源：T34 终验（`receipts/T34.receipt.md`「T34 终验」存疑 1、2）；原单 `done/T34-orchestration-default-chain.md` 验收 2 ④⑤
> 分支 / 作业目录：feat/T34b（自 T34 合并后的主线开），小改动可不开 worktree
> claimed：2026-11-09 main (GLM 5.3) @ feat/T34b // worktree /tmp/bot-wt/T34b
> accepted：

## 目标
补上 T34 工单验收 2 ⑤（施工未做、回执把 ⑤ 改标成 orchDataDir 四分支，未按工单「成本过高就停下写回执」记录），并把 ④ 的宽松正则收紧到信封真实错误码。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/sdk/tests/unit/orchestration-default-chain-live.test.ts`（T34 新文件，本单只改它）
3. `app/sdk/tests/e2e/tiers-policy.test.ts:80-170`（`connect({ interactions: 'answer' })` + `approval/request` 卡应答 `allowed-once` 的现成写法）
4. `app/sdk/tests/unit/orchestration-envelope-live.test.ts:195-230`（`toContain('pbots/forbidden')` 断言写法）
5. 静态依据（已核，本单是给它上运行时证据）：已装 `@deepseek-ai/dsh-subprocess/lib/index.js:50 scrubbedParentEnv` 擦全部 `DSH_*`，`dsh-shell` 调用它

## 边界
1. 只动 `app/sdk/tests/unit/orchestration-default-chain-live.test.ts` 与 `work/**`。不改产品代码、不改 support/。
2. 先写失败测试：⑤ 格先在**故意坏的**环境下看它红——临时把 start.ts childEnv 那行改成 `child.P2SDK_PBOTS_DATA_DIR = …`（不提交），⑤ 应红（输出含数据根）；贴红输出后还原，再看绿。这一步证明探针不是恒真。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。
4. ⑤ 若审批卡应答在 unit live 里确实搭不起来（`interactions: 'answer'` 客户端与 `launchRuntime` 不兼容等），**停下写回执**，写清卡在哪一步——不许删格、不许改成恒真、不许改标别的格。

## 验收（写命令，不写感觉）
（`app/sdk` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`）
1. `VR tests/unit/orchestration-default-chain-live.test.ts --reporter=verbose` → 6 passed，含新格 ⑤：主 bot 会话 fake 脚本调一次 `bash`（命令 `env`），审批卡应答 `allowed-once`，工具结果文本**非空且含 `PATH=`**（证明真拿到了 env 输出），**不含** `dataDir` 绝对路径、**不含** `DSH_PBOTS_DATA_DIR`
2. 同一文件 ④：断言改为每条 subagent 工具结果 `toContain('pbots/forbidden')`（照 envelope-live），新增会话数 0 不变
3. 边界 2 的先红输出原样贴回执（含临时改动的 diff 一行与还原后的 `git diff --stat` 为空）

## 为什么这样验收
⑤ 守的是 P5-01 决策 15：数据根不进模型可见环境。T34 的论证是静态的（DSH_* 由上游擦除）；上游升级换 executor、或有人把注入改回 P2SDK_ 前缀时，只有运行时探针会红。「含 `PATH=`」防的是 bash 被拒或输出为空导致「不含」恒真；先红步骤防探针本身是摆设。

## 产出
- 修改：`app/sdk/tests/unit/orchestration-default-chain-live.test.ts`
- 回执：`work/tickets/receipts/T34b.receipt.md`
