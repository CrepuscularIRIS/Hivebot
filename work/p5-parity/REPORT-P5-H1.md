# REPORT · P5-H1 测试运行时清理

> 主会话代录（builder 报告），2026-11-03

分支 feat/P5-H1（基 92d0cc8），commits bae5a1c（tmp-sweep 登记簿+60 处 wrap，43 文件 +327/-120）+ f2831a8（handoff 三盲区）。

## 机制（与派发偏差有据）
stop() 不能立即删（restart 类用例要复用同一 home/handoff）→ 每包 tests/support/tmp-sweep.ts：tmkdir=mkdtemp+登记；sweep=递归删、失败只 warn；**只删登记过的，不扫 /tmp**（单测有「同前缀未登记兄弟必须幸存」对照）。vitest 5 worker 不跑 process exit 钩子 → setupFiles 文件级 afterAll；playwright worker 跑 exit 钩子 → import 副作用安装。

## 验收（私有 TMPDIR 隔离计数；公开 /tmp 被并行 agent 污染不可用）
sdk 32/32、253/253 绿，四类前缀残留全 0；ui 249/249 + 61 e2e 绿，私有 TMPDIR 完全零残留；tmp-sweep 单测 4+4 绿。

## 新问题（立任务）
1. zoo 前缀约 60 处 spec 级 mkdtemp 仍泄漏（单次全量 ~114 个；examples/min-client.mjs:28 子进程登记不可见）——同 tmkdir 机制机械 wrap 可清
2. start.ts:71 生产兜底 handoff（含 launch-token）无清理——产品侧问题
3. **H3 根因实锤**：沙箱系 6 文件 TEST_HOME 硬编码 /home/lingxufeng/bot/.test-homes/p5-0X（决策 8）→ 任意两个并行全量互踩哨兵即红；4 次红全与 P5-25/主仓并行重叠，安静窗口与纯基点全绿。另 TMPDIR 在测试 HOME 子树内致 T-01.f3 ① 假红
4. start.test.ts 用 import 边界 shim 登记兜底 handoff
