# T51b：T51 返修——目录源初值别覆盖用户设置文件 + Index sources 视图控件对齐

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`receipts/T51.acceptance.md` §3 F1、F2 后半（T51 第 1 次不通过）
> 分支 / 作业目录：feat/T51 @ /tmp/bot-wt/T51（在 T51 分支上续做）
> claimed：2026-11-11 main (GLM) @ feat/T51
> accepted：2026-11-11 feat/T51 @ 721e38f3（随 T51 整线终验，见 receipts/T51.acceptance.md §5）

## 目标
1. `ensureMarketBundle` 种目录源初值时**只改 plugin-market 那一行**，永不整文件覆盖 `profiles/web/cordis.patch.yml`；URL 正确转义。
2. Index sources 视图里的输入框、Add、Done 与同一浮层其它控件同一套样子，亮暗都看得清。

## 动手前先读
1. `receipts/T51.acceptance.md`（F1/F2 原文）、T51 回执第 0 步结论
2. `app/sdk/src/start.ts` 的 `ensureMarketBundle` 与同文件 `yamlScalar`
3. 市场浮层里现有搜索框的写法（`market-surface.tsx` `data-market-search` 那段）作为输入框样式参照

## 边界
1. 只动：`app/sdk/src/start.ts`（仅 `ensureMarketBundle`）、对应 sdk 单测（新建 `app/sdk/tests/unit/market-bundle.test.ts` 或并入现有 start 单测文件）、`market-surface.tsx`、`p5-57.css`、`market.spec.ts`（仅 T51 格的截图步骤）。不碰调色板（暗色 primary 字色归 T56）。
2. F1 修法要求：用户层文件已存在且非 `[]` 时，种子只能**追加一条 plugin-market 行**（或什么都不做），不得改写 / 删除其它行；判断「已有 plugin-market 行」用 YAML 解析（dsh 已装 yaml 依赖，或运行时现成解析器，选已装的），不用字符串包含；URL 经 `yamlScalar` 转义。读不懂文件（解析失败）→ 不种、打一行 WARN，**不覆盖**。
3. 先写失败测试（单测，纯函数级，临时目录）：
   - ① 用户层已有 `- id: llm-pi-ai …` 一段、无 plugin-market，seed 非空 → 跑完后 llm-pi-ai 段逐字节仍在，且多出 plugin-market 行；**改前必红**。
   - ② 用户层已有 plugin-market 行（用 dsh 写回的真实格式，取 `evidence/T51/step0v10.txt` 里的样子，再加一个带引号的变体）→ 文件哈希不变。
   - ③ 文件是坏 YAML → 文件哈希不变。
   - ④ seed 含 `https://a.example/x.json?q=1` 与带 `'` 的 URL → 解析回来的 indexes 与输入逐字相等。
   - ⑤ 连跑两次 → 第二次文件哈希不变（幂等）。
4. F2：URL 输入框复用搜索框的外观类（圆角、同高、同字号），Add / Done 用与浮层其它按钮相同的 `SandButton` size；Add 在草稿为空时禁用可以，但禁用态标签要看得见。
5. 测试走隔离 HOME / TMPDIR。

## 验收（写命令，不写感觉）
1. `cd /tmp/bot-wt/T51/app/sdk && pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/market-bundle.test.ts` → ①–⑤ 全绿；回执贴 ① 在改前的红尾。
2. 变异：把追加改回 `writeFileSync` 整写 → ① 红（贴尾）。
3. 改动行覆盖 ≥80%：`pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/market-bundle.test.ts --coverage --coverage.include=src/start.ts`，回执贴 `ensureMarketBundle` 行区间的覆盖（整文件覆盖率低不要紧，看函数段）。
4. `cd /tmp/bot-wt/T51/app/ui && PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/market.spec.ts` → 3 passed（先 `pnpm build`，LEARNINGS「变异 main 须 rebuild」同理，改 renderer 也要 build）。
5. 重拍 `evidence/T51/shots/t51-manage-{light,dark}.png`（含一条被拒的草稿）；经理 Read 看：输入框与搜索框同款、Add/Done 标签清楚、Done 文字居中不裁。
6. `git diff --stat 50ac53bc..HEAD` 只含边界 1 的路径 + 证据。

## 为什么这样验收
F1 的危险不在今天，而在 T49 落地之后：同一个文件会装用户的模型路由，一次带 env 的启动就能把它抹掉，而且用户不会知道为什么 key「丢了」。所以 ① 必须用「已有 llm-pi-ai 段」的真实场景，并且改前必红；②③⑤ 防「判断失误又整写」。F2 是用户最近明确在抱怨的 UI 质量，这个视图是新做的，不该一出生就和浮层其它部分两套样子。

## 产出
- `app/sdk/src/start.ts`、新单测、`market-surface.tsx`、`p5-57.css`、重拍截图、`work/tickets/receipts/T51b.receipt.md`
