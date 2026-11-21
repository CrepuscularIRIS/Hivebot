# REVIEW P6-25（汇总）

对象：合并 commit `be37484`（父 `60e8b02`，产品代码 `app/sdk/src/policy/shell-ask.mjs`）。三方向：A、C 由 Sol / Opus，B 因 Sol 服务商内容策略拦截改派 Opus（确定性测试接缝）。原文 `REVIEW-P6-25-{A,B,C}.md`，证据 `evidence/P6-25-rvw/`。

| 方向 | critical | major | minor | 结论 |
|---|---|---|---|---|
| A 信任边界与输入 | 0 | 0 | 0 | 64 格对抗探针全 REFUTED；write/edit 仅 `file_path`，无字段别名绕过 |
| B 并发与状态一致性 | 0 | 2 | 0 | TOCTOU：判定后执行前换链，写落区外、读出区外（含范围外的读） |
| C 失败关闭与覆盖面 | 0 | 0 | 2 | 失败一律关闭；write/edit 外无通道能不出卡写到区外 |

**结论：FAIL（2 major）→ P6-25.f1**（执行层复判，进行中）。

minor：
- C1 `shell-ask.mjs:310`：档位表损坏时区外写走「tier table unavailable」卡而非硬拒（运维侧故障）→ 已 SendMessage 并入 P6-25.f1（同文件）
- C2 `guard.mjs:153/159/171`（范围外）：guard 拒绝文本带宿主绝对路径 → 记录，下次动 guard 时顺带脱敏（同 P6-10.f2 的 redact 先例）

C 的覆盖面结论：run_code、workflow、fork/subagent 子会话、working_directory、bash（含联网态，`/tmp` 仍是私有 tmpfs）均写不到宿主 `/tmp`；MCP 写类工具一律出卡（仅单测，未挂真实连接器端到端）；已装 dsh 无 notebook / patch 类工具。
