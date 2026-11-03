verdict: PASS
commit: a21cc2cd55af81821cad914654fc89fe958d20ed（worktree /tmp/bot-wt/P5-04f1，验收后 git status 干净）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 全量 29 files / 236 绿（基线 231+5） | PASS | `HOME=/tmp/bot-p504f1-vfy pnpm -C app/sdk test` → `29 passed (29)` / `236 passed (236)`（evidence/P5-04f1/verify-runs.txt §1） |
| guard-escalation 单文件含新 3 格全绿 | PASS | `vitest run tests/e2e/guard-escalation.test.ts` → 7 passed（原 4 + ④b/⑤主/⑤差分；§2） |
| ⑤ prepend 红基线证伪 | PASS | 去掉 guard.mjs:311 第三参 `true` → ⑤ 主格红：尾部日志 `approval/asked`（shell-ask 先出卡，guard 永不执行，turn 挂起超时）；`git checkout` 恢复后 ⑤ 复绿（§3/§4）。prepend 是「guard 居最外层」的唯一来源，非 yaml 行序 |
| ④ dfa 启动态会话级拒绝 | PASS | `-t '④b'` 亲跑绿：前提断言 defaultPreset/pinned 均为 danger-full-access（防空绿）→ bash+write 恰 2 deny、原因含字面串 `danger-full-access session mode is not supported` 且含 `p2sdk-fs-guard` 前缀、不含 `masked area`（先于路径判定）、asked 0、canary/宿主外文件均不存在；read 工作区文件照常读到 `p504-read-ok`（不越界收紧）（§5） |
| ⑤ 差分（同组合不挂 guard） | PASS | `-t '差分：同组合不挂 guard'` 绿：answered/asked 均 1、批准后 canary 真实写入 `x`（§5） |
| 顺序不可靠发现复核（cordis 链路） | PASS | vendor `@deepseek-ai/cordis@4.0.6-alpha.1/lib/index.js`：`on(name, listener, options)` 第三参布尔 → `{prepend: options}`（:372）→ `register` 内 `options.prepend ? "unshift" : "push"`（:336），prepend 确实 unshift 到 hooks 最前；与红基线实测互证 |
| 区域：5 文件 | PASS | `git diff --stat 21d7f16..a21cc2c` = 5 files +257/-16，与申报一致（approval.yml / guard.mjs / start.ts / guard-escalation.test.ts / guard.test.ts） |

新问题：无。

备注：REPORT 声明「P5-06 矩阵依赖本分支先合」（main 上 guard 非最外层时 bash 类格原因会落 shell-ask）——合并顺序约束属实，主会话排程时注意。
