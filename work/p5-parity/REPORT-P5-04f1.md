# REPORT · P5-04.f1（PLAN P5-04 行 ④⑤ 补格）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-04f1 @ a21cc2c（基 21d7f16），worktree /tmp/bot-wt/P5-04f1。5 文件 +257/-16。

## 交付
- ④ dfa 启动态会话级拒绝：guard.mjs sessionMode(ctx, exec)（ctx.get('sandboxPolicy').resolve，与 shell-ask 同暴露面）；模式=dfa → deny bash/write/edit，字面串 danger-full-access session mode is not supported；位于 args 级判定后、路径判定前；读不到服务/resolve 抛错 → 不拦（guard 无 approvalPolicy 分支）
- ⑤ 顺序组合格：patch 整键覆盖组合「有效模式=dfa 且 approval≠never」；普通 bash → guard 拒+asked 0+guard 字面串；差分不挂 guard → asked 1 批准后执行

## 重要发现：insert 行加载顺序不可靠（⑤ 首红暴露）
两种 insert 排列下 shell-ask 都先注册居外层，guard 收不到任何 bash exec（此前 P5-02/03/04 用例恰好都不依赖顺序）。对已合 main 无实际损失（args 级 dfa 经 shell-ask 放行后仍被拦）。修复：guard `ctx.on('tools/pre-execute', …, true)`（cordis prepend → unshift 最前），不依赖加载顺序；旧注释「靠 insert 顺序」同步改正。**P5-06 矩阵依赖本分支先合**（main 上 guard 非最外层，bash 类格原因会落 shell-ask）。

## 测试
e2e +3 格（④b/⑤主/⑤差分，红基线：bash=approval unavailable…、write=masked-area、组合 asked 1）；单测 +2 格。`pnpm -C app/sdk test` → 29 files/236 全绿（基线 231+5）。
