# P6-05 verifier 运行记录（2026-11-04 04:56–05:06，worktree /tmp/bot-wt/P6-05 @ 3bc01d3）

## sha_check.py（独立重算）
base 句        : 'You are a coding agent powered by the {{model}} model.'
段落长度       : 637 字符
段落 sha256    : c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356
D3 run-meta    : c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356
approval.yml standard persona prefix == p6-reply prefix（逐字节一致，含 base 句 + 空行 + 段落）
RESULT: PASS
exit=0

## probe.mjs 复跑
$ node work/p6-orchestration/evidence/P6-05/probe.mjs
[p6-05] 静态：PASS
[sdk] [p2sdk] ready http://127.0.0.1:40217
[p6-05] 默认会话 session-ce9d3695-011d-40f2-9e58-15c9621d5687 preset=standard llm 记录 1 条，系统提示 6148 字符
[p6-05] 动态：PASS
probe PASS
exit=0
## live_default.mjs（无 P2SDK_PATCH 默认链 + p6-reply 拒绝）
$ node live_default.mjs  # 注：探针本体见下方输出，此处为 verifier 自写脚本
A. 默认会话 session-ae914e85-809c-47d7-81ce-be5b44b9b82e agentPreset=standard
B. agentPreset=p6-reply 被拒=true 原因=session/create failed: {"code":"agent-preset/not-found","message":"Unknown agent preset: p6-reply","details":{"agentPreset":"p6-reply","available":["standard","ptc","minimal","cordis"]}}
live_default PASS  exit=0

## guard-plugin-manager.test.ts 单文件
$ HOME=/tmp/bot-p6-05-vfy-t1 pnpm vitest run tests/e2e/guard-plugin-manager.test.ts
Test Files  1 passed (1) / Tests  4 passed (4)  Duration 9.39s

## 变异矩阵（mutation_test.py，每次改后恢复，最终 sha 核对一致）
M1 persona name 漂移（standard）: 期望=RED 实际=RED => OK
M2 agent-instructions maxBytes 漂移（standard）: 期望=RED 实际=RED => OK
M3 cordis 块 disabled 漂移: 期望=RED 实际=RED => OK
M4 standard persona prefix base 句漂移（豁免值本身）: 期望=GREEN 实际=GREEN => OK
M5 persona config 新增 suffix 键（豁免面边界）: 期望=观察 实际=GREEN => OK
恢复核对: 一致 (d1ca78d391eb7cad...)
RESULT: PASS

## sdk 全量（污染环境，仅供记录：外层 P2SDK_PROVIDER=mock 导致 security ⑥ 红）
$ HOME=/tmp/bot-p6-05-vfy-full P2SDK_PROVIDER=mock pnpm test  →  Tests 1 failed | 304 passed (305)，红 = security.test.ts ⑥（requests seen: 0）

## sdk 全量（干净环境：仅覆盖 HOME）
$ env -u P2SDK_PROVIDER HOME=/tmp/bot-p6-05-vfy-full2 pnpm test
 Test Files  37 passed (37)
      Tests  305 passed (305)
   Duration  88.48s (tests 99%)
exit=0（见 /tmp/bot-p6-05-vfy-full2.log，临时，固化于此）

## sandbox-hardened 单跑（验收项 5）
$ env -u P2SDK_PROVIDER HOME=/tmp/bot-p6-05-vfy-sh pnpm vitest run tests/e2e/sandbox-hardened.test.ts
Test Files  1 passed (1) / Tests  9 passed (9)  Duration 40.88s
