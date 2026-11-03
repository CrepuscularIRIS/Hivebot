# REPORT · P5-21 SDK 档位策略

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-21 @ 8266351（基 c6aba1b），3 commits（测试先行→实现→④b 跟语义），12 文件（产品 5 + 测试 7）。

## 交付（Q-013 全表）
- tiers.json（BRIEF (c)：profile 文件）：bash=1 sandbox-allow、文件=3/4 区内门控/区外读 ASK 无 always/区外写交 fence、mcp=7 ask（桥前回退）、web=10 allow 显式入表、default=11；loader 同 id 整键替换（applyEntryPatches 实证）
- 门控（决策 13⑤/16）：instance=sha256(launch-token)；每 pre-execute 重读 <dataDir>/policy-state.json；五态（缺失/坏/paused/fault/version≠1/instance 不符）→ bash+工作区文件 ALWAYS 全退 ASK，NEVER 不变
- 第 4 行 realpath（resolve.mjs 只解析不判定，复用 guard extractPaths+fs.resolve）；区外写 next() 交上游 fence
- 坏表 fail-closed 全退 ASK+console.error；T-12 严格更宽委托与 P5-05 never 折叠原样保留

## 测试
单测重写 42 用例；e2e tiers-policy 6 用例；**对旧实现语义红已验**（stash 对照五点全红）；既有测试 4 处语义适配（guard-fs toolTurn 自动应答/mock-demo①/market③/guard-escalation④b——档位表合法改变，按「断言现值」规则说明）。全量 32/281 绿（13:18；13:10 一跑 5 红系 /tmp handoff 残留竞争面复跑绿——H1 后缓解）；statSync ENOENT 根因修复（never-roots flatMap 容错）。

## 事故（已处置）
stash 串位 12:51-12:58 损失未提交实现一轮——上下文重写+立即 commit 固化；备份 /tmp/bot-p5-21-backup/。此后未用 stash。

## 未完成/新发现
1. **决策 16 解读待 director**：「所有 ALWAYS 退」按「仅 bash+工作区文件随门收紧；web/default（Q-013 维持现状）不随门关」实现——字面全退口径是一处条件之差（本报告留证）
2. dfa 部署态工作区 read 现拒——P5-29 合入后复跑 ④b
3. ⑥ 桥接分档留 P5-23；A9④ UI 侧归 P5-31
