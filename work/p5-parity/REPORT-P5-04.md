# REPORT · P5-04（0d 拒绝裸升权 · arguments 级）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-04 @ e5291aa（基 77067fb），worktree /tmp/bot-wt/P5-04。2 文件 +316：guard.mjs（dfa 判定 +20，位于 NEVER_TOOLS 后、路径判定前，对任何工具生效）+ guard-escalation.test.ts（新 296）。

## 机制
任何工具 `arguments.sandbox_permissions === 'danger-full-access'` → deny，字面串 `escalation path not available`（PLAN v2.1 定死；P5-05②/P5-06 按此断言）。bash 在进 shell-ask 前就拦；不带参调用零改动。上游依据：bash-sandbox/index.ts:92-100（dfa 批准后直 execute 不进 wrapper）、escalation.ts:30-31（dfa 是 WIDER_MODES 终点）、tool-fs/sandbox.ts:22,90（write/edit 同参名且不受 fs-sandbox 约束）。

## 验收 ①-④（TDD 先红后绿，真实 launcher + fake LLM）
① dfa bash 读哨兵：deny+字面原因+asked 0+标记不存在；红基线=同调用产生 approval/asked（escalate sandbox to danger-full-access: P5-04 dfa 探针）证明拦的是真实审批路径
② dfa write/edit 工作区外：deny 且 dfa 字面串（红基线=P5-02 masked area，证明先于路径判定）；无副作用
③ 差分 stock：同 bash 出卡恰 1，批准后 leak-dfa-stock.txt === 哨兵内容——dfa 批准后是真实无沙箱执行（读到 wrapper 遮蔽的 $HOME/.ssh 文件）
④ 普通不带参 bash 照旧出卡+批准执行；既有 approval e2e 全绿

## 自验
sdk 29 files/231 全绿（前值 28/227，+4 用例；无首跑红）。

## 未完成（不扩范围，转 P5-04.f1）
PLAN 行 ④（DSH_PERMISSION_MODE=danger-full-access 启动态 write/edit 会话级拒绝——bash 已由 P5-05 never 拒）与 ⑤（guard 排 shell-ask 前的顺序组合格）不在派发 ①-④ 内。
