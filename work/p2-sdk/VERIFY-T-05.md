# VERIFY · T-05 D4 per-session 配置（含授权补丁）

verdict: PASS
commit: 4a157af7d3d6bc63bf2ed4671f97823c6c4191cb（feat/T-05，/tmp/bot-wt/T-05；两个 commit：149c58c 主任务 + 4a157af 授权补丁）
验收时间：2026-11-01 15:16–15:20 EST · verifier 于 worktree 干净状态（git status 空、`pnpm install --frozen-lockfile` 通过）自跑

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① 干净复跑全量 = 34/34 | PASS | `pnpm exec vitest run --no-file-parallelism --maxWorkers=1` → Test Files 5 passed (5), Tests 34 passed (34)，20.0s；evidence/T-05-full-suite.log |
| ① 单跑 config.test.ts | PASS | `pnpm exec vitest run tests/e2e/config.test.ts` → 1 passed，2.2s；evidence/T-05-config-only.log |
| ② 执行侧证据非回显（model 标识 + preset 派生指令/工具集合） | PASS | config.test.ts:235-266 主断言全部落在请求侧：双独立记录 = llm/stream waterfall（runtime 内 recorder.mjs，:118-150，记录每次 GenerateOptions 的 model/system 文本/tool names）× T-02 fake adapter 的 requests.jsonl（plugin.mjs:108-120，provider 实际收到的 options）；两处都穿过真实 dsh runtime。回显断言（:189/:198）仅为前置健全检查，:8-9 明示「只回显配置不构成通过依据」 |
| ② 两 session 记录逐项不同 | PASS | S1 两条记录 model=p2fake-m1 + system 精确 toEqual alpha persona（ALPHA-MARKER-7f3a）+ 工具不含 glob/grep；S2 一条 model=p2fake-m2 + beta persona（BETA-MARKER-c91b）+ 含 glob+grep（tool-fs-search 仅挂 p2-beta，presets.yml:36-41）；:258 `s1Tools.join(',') !== s2Tools.join(',')` 且 :257 工具名无重复 |
| ② S2 选模型后 S1 再发仍 M1（证伪覆盖） | PASS | config.test.ts:233 S1 第二问在 S2 selectModel（:228）之后；:242-245 for 循环断言 s1Streams **两条**记录都是 M1 + alpha persona；fake 侧交叉验证 :264 `[M1, M1]` |
| ③ 配置查询走 session/projections 且各自返回 | PASS | config.test.ts:269-284：S1 → agentPreset=p2-alpha、model=M1；S2 → agentPreset=p2-beta、model=M2（lastUsed ?? pending） |
| ④ 授权补丁正当（+6/-2，只按声明回填、无假通过路径） | PASS | `git show 4a157af`：listModels 仅从 config.providers 声明映射 `{provider,id,name}`，无硬编码/通配。上游 modelAvailable（repos/deepseek-harness packages/api/session-controller/src/catalog.ts:81-90，实读核对）用 `models.some(m => m.id === selection.model)` 判目录——**未声明模型仍被拒，校验未形同虚设**；且通过依据在请求侧记录，catalog 蒙混不了断言。红复现：checkout 149c58c 版 plugin.mjs 单跑 → `session/model-unavailable` `p2fake-m1`（与 commit 声称逐字一致），恢复 HEAD 后 git status 干净；evidence/T-05-red-repro.log |
| ④ patch 来源与 commit message 注记完整 | PASS | 4a157af message 含：来源（PLAN T-05 行 session/selectModel）、根因（catalog.ts:81-90 + llm index.ts:718+ INVALID_CATALOG，均已实读核实）、红证据（修复前 1 failed 具体错误）、复测（34/34）。149c58c 诚实注明本地 4 行验证补丁已 revert（T-02 区域） |
| ⑤ 区域检查：diff = presets.yml + config.test.ts + plugin.mjs | PASS | `git diff --stat 513dcf1..4a157af` 恰好 3 文件：presets.yml +41 / config.test.ts +288 / plugin.mjs +6-2，无其他改动 |

坏路径（额外一条）：补丁移除负对照 = 上表④红复现——selectModel 对 catalog 外模型真实拒绝，证明补丁不是让校验失效的绿通道。

新问题：无。

备注（不挡判定）：
- 全量日志中 `p2sdk: no ready line within 1ms` 来自 mock-demo.test.ts:71 超时负用例的预期 stderr，非异常。
- PLAN.md T-05 行 status 仍为 todo，主会话按本 VERIFY 更新即可。
