# T11b：T11 返修——恢复被删的 T9a ⑧ 格 + canonical 回传两格

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T11 终验不通过（第 1 次），receipts/T11.md §8
> 分支 / 作业目录：feat/T11 @ /tmp/bot-wt/T11（同分支续提交）
> claimed：2026-11-07 03:0x（main）
> accepted：2026-11-07 feat/T11 a6d1e3ff

## 目标
补上 T11 合并前缺的三格：一格是被删掉的旧回归格，两格证明「canonical 回传」真的走到了 header.cwd 和 guard。

## 动手前先读
1. receipts/T11.md §8（经理终验节，含探针证据）
2. `git show db1af845:app/sdk/tests/e2e/ssh-product.test.ts` 的 `it('⑧ 会话可建；首请求工具面不含 workflow 族'` 整块（约 :125-155）
3. review/T9b-chain-security.md :31（P2 经理核实：T11 要带一格「ws 原串为链接 → 合法写放行、换链后不放宽」）

## 边界
1. 只动：`app/sdk/tests/e2e/ssh-product.test.ts`、`app/sdk/tests/unit/guard.test.ts`（或 workspace.test.ts）、`app/ui/tests/unit/m3/orchestrate.test.ts`、回执。不改产品代码；如果某格必须改产品代码才能绿，停下写回执。
2. 先红：
   - 格 B（main 侧）：把 `orchestrate.ts` 的 `workspace: r.canonical` 临时改成 `r.path`，看格 B 红，贴输出，还原。
   - 格 C（guard 侧）：用 ws 原串（链接路径）当 workspaceRoot 时同一目标判 `deny:mask`，贴输出（这是对照，证明格子能咬住）。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；e2e 只跑 ssh-product 一套，和 T17 的 e2e 错开。

## 做什么
- **A 恢复 ⑧**：`565761e1`（「RPC 404 诊断快照」wip 提交）把 T9a 的 ⑧ 格整块删了，换成四个空行，提交说明没提。经理探针：把 db1af845 版 ⑧ 原样放到 T11 代码上跑 → 1 passed。照 db1af845 原文恢复，不改断言，删掉那四个空行。顺手删 ⑥ 循环里的死代码 `let patch = ''; void patch`。
- **B main 侧 canonical 存档**（orchestrate.test.ts）：`PBOTS_DSH_HANDOFF` 指向临时目录，写好 `ssh-mode`、`remote-root`；dsh 桩对 `p2sdk/workspace_ensure` 返回 `{ ok: true, value: { path: '/r/workspaces/<id>', canonical: '/real/workspaces/<id>' } }`。断言：`session/create` 的 `request.cwd` 等于 canonical，不是 path；本机 `<dataDir>/workspaces/<id>` 没建。再加两格错误路径：RPC 返回 `ok:false` → `pbots/storage`、0 次 `session/create`。#3/#4/worker 至少覆盖一个入口；三个入口共用 mintWorkspace，一个就够。
- **C guard 侧**（P2 收口）：`P2SDK_SSH_MODE=1` 下 `judgePath`，目标 resolved 后在 canonical 下，`workspaceRoot` 给 canonical → `ok`；给链接原串 → `deny:mask`（对照）；换链（目标 resolved 到 canonical 之外、仍在软遮蔽根下）→ 不是 `ok`。照 review :31 的形态写。

## 验收（写命令，不写感觉）
1. `git diff db1af845..HEAD -- app/sdk/tests/e2e/ssh-product.test.ts | grep '^-' | grep -v '^---'` → 只剩 T11 有理由改的行（⑧ 块不在删除行里）
2. `cd app/sdk && vitest run tests/e2e/ssh-product.test.ts` → **7 passed**（②d ⑨ hardRoots ⑧ ⑥ ⑤d + 原有），跑完 `pgrep -af bot-wt/T11` 没有残留
3. `cd app/sdk && vitest run tests/unit/workspace.test.ts tests/unit/guard.test.ts tests/unit/start.test.ts` → 3 + 32(+) + 42 passed
4. `cd app/ui && vitest run tests/unit/m3 tests/unit/skills` → 114 + 新格 passed
5. 先红两段按「边界 2」原样贴进回执 §9

## 为什么这样验收
- A：T11 回执写的「ssh-product 6」看起来像是加了格，其实是「删 ⑧、加 ⑥ ⑤d」——T9a 的工具面回归（workflow 族不进 ssh 工具面）没了保护，没人发现。
- B：e2e 夹具里远端根不是链接，path 和 canonical 一样，所以 `r.canonical` 改成 `r.path` 现在所有格都照绿。P2 收口的意义全在这一个字段上，得有一格能咬住它。
- C：经理在 T9b 核实时说好 P2 的验收是「链接 ws 合法写放行、换链不放宽」，T11 工单转实体时丢了这一格。

## 产出
- 上述三个测试文件的增量；receipts/T11.md §9
