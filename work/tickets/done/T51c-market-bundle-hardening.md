# T51c：T51 线第二轮返修——审查 4 major + 1 minor（种子 YAML 边角 / 规范化地址 / manifest 整写 / symlink EEXIST / m1 undefined）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`work/tickets/review/T51-review.md`（Sol @ 02ee677d，经理逐条复现成立，核实结论附在报告末尾）
> 分支 / 作业目录：feat/T51 @ /tmp/bot-wt/T51（续做）
> claimed：2026-11-11 main (GLM) @ 2a807b54
> accepted：2026-11-11 feat/T51 @ 721e38f3（随 T51 整线终验，见 receipts/T51.acceptance.md §5）
> **失败计数**：T51 线第 2 次（第 1 次 = 经理验收 F1/F2 → T51b；第 2 次 = 审查）。经理已按任务 C 复核方案前提：bundle 层挂载这条路仍成立（问题都在 `ensureMarketBundle` 对 dsh 拥有的文件做手工改写的边角，不在路线）；本单仍失败 → 停，转 `blocked/` 并把「是否保留 env 种子」交用户 / 重规划，不再开 T51d。

## 目标
`ensureMarketBundle` 对三个已有文件（用户补丁层、manifest、node_modules 链接位）**任何读不懂 / 不确定的情况都不动原件、启动不炸**；新加源后选中的是上游规范化后的那个地址；m1 守卫不放过 `undefined`。

## 逐条要求（每条先写失败测试，看红再改）
1. **R1 种子追加破坏 YAML**（`start.ts` `seedMarketIndexes`）：
   - 解析结果是空序列（文件为 `[]`、`[ ]`、只有注释的空文档等）→ 文件里没有用户状态，**可整写为种子文档**。
   - 非空**块**序列 → 追加；原文件不以换行结尾先补 `\n`。
   - 其它（流式非空序列 `[a, b]`、非序列、解析失败）→ WARN，不写。
   - **写后自检**：重新解析必须成功，且写前的每一项按深比较仍在、顺序不变；不满足就把写前的原字节写回并 WARN。
   - 单测补：⑥ 默认骨架 `[]\n` + seed → 可解析、只有 plugin-market 一项；⑦ 非空块序列无尾换行 + seed → 可解析、原项逐项相等；⑧ 流式 `[{id: x}]` + seed → 哈希不变；⑨ 用桩让追加后的内容不可解析（或直接测自检函数）→ 原字节恢复。
2. **R2 新加源选错地址**（`market-store.ts` `addIndex`）：`enterMarket(true)` 之后，从刷新得到的 `sources` 里找**本次新增**的那一个（`next` 之前没有、现在有的那项；找不到才回退首项），用它 `setSource`，不用 `trimmed`。单测：上游桩把 `https://EXAMPLE.com:443/a/../index.json` 规范化成 `https://example.com/index.json` → `state.url` ∈ `sources`、无 `Index is not configured`、只发生一次针对规范地址的搜索（照审查探针 `/tmp/t51-review-probe.mjs` 的 canonical 段改写成仓内单测）。
3. **R3 manifest 解析失败被整写**（`ensureMarketBundle` manifest 段）：只有 `ENOENT` 才创建默认 manifest；读或解析已有文件失败 → WARN，**不写 manifest、不挂 bundle**（市场退回空态，SDK 照常启动），不抛。单测：缺尾 `}` 的 manifest 调用后字节不变、函数不抛。
4. **R4 链接位是真目录 → EEXIST 启动失败**（`link`）：先 `lstat`：不存在 → 建链接；已是指向同一目标的链接 → 不动；是别的链接 → 换掉；**是真目录或文件 → 不删、不链，WARN，继续**（真目录若就是一份可用的 dsh-plugin-market，dsh 照样能解析）。删除失败不许吞掉后继续 symlink。单测：链接位放一个含 `package.json` 的普通目录 → 函数不抛、目录原样在、WARN 一行。
5. **R5 m1 undefined 穿守卫**（`m1-api/index.ts` setIndexes 段）：`find` 改 `some`（或 `findIndex`）。单测：`{urls:[undefined,'https://a.example/index.json']}` → invalid-args，上游调用 0 次。

## 边界
1. 只动：`app/sdk/src/start.ts`（`ensureMarketBundle` / `seedMarketIndexes` 及新加的小助手）、`app/sdk/tests/unit/market-bundle.test.ts`、`app/ui/renderer-grok/overrides/modules/market-store.ts`（仅 `addIndex`）、对应 renderer 单测（放 `app/ui/tests/unit/grok-shim/` 下现有风格）、`app/ui/main/m1-api/index.ts`（仅 setIndexes 守卫一行）、`app/ui/tests/unit/m1/api.test.ts`。
2. 不扩功能、不改 UI 外观、不动调色板。
3. WARN 一律走 stderr 一行，带文件路径，不带 URL 以外的文件内容。

## 验收（写命令，不写感觉）
1. `cd /tmp/bot-wt/T51/app/sdk && pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/market-bundle.test.ts` → 原 ①–⑤ + 新 ⑥–⑨ + R3 + R4 格全绿；回执贴 ⑥⑦ R3 R4 改前红尾。
2. `cd /tmp/bot-wt/T51/app/ui && pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/m1/api.test.ts <R2 单测文件>` → 全绿；回执贴 R2、R5 改前红尾。
3. 审查复现脚本全部转为「不再复现」：`cd /tmp && node --experimental-strip-types t51-review-probe.mjs; node --experimental-strip-types t51-review-manifest.mjs; node --experimental-strip-types t51-review-m1.mjs` → 不再出现 `BROKEN YAML`、`EEXIST`、`afterDependencies":{}`、`"upstreamCalls":1`、`Index is not configured`（脚本断言写死旧行为的话，回执贴输出并逐条说明新输出为什么是正确的）。
4. `ensureMarketBundle` 函数段改动行覆盖 ≥80%（`--coverage --coverage.include=src/start.ts`，贴函数行区间）。
5. 回归：`cd /tmp/bot-wt/T51/app/ui && pnpm build && PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/market.spec.ts` → 3 passed；`cd /tmp/bot-wt/T51/app/sdk && pnpm --config.verify-deps-before-run=false exec vitest run tests/market/` → 全绿（env 种子路径的既有用户）。
6. `git diff --stat 2a807b54..HEAD` 只含边界 1 的路径 + 回执。

## 为什么这样验收
四个 major 的共同点：我们在改 dsh 自己拥有的文件，而且「没把握时」选择了覆盖或继续。用户能感受到的后果是**启动不了**（R1 坏 YAML、R4 EEXIST）或**设置 / 已装连接器悄悄没了**（R3）。所以验收的核心是「读不懂就不动、写了要自检、启动不因它而炸」，每条都要用改前必红的测试钉住，并用审查员的原复现脚本做最后的旁证。

## 产出
- 上列文件；`work/tickets/receipts/T51c.receipt.md`
