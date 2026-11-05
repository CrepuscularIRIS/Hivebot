# VERIFY · P6-05 preset 段落接入默认链

verdict: **PASS**
commit: 3bc01d3f9768bb92426ff0241eca8629c115d3f2（feat/P6-05，基 main 6abbbc0；验收期间 head 未漂移）

verifier 证据目录：`work/p6-orchestration/evidence/P6-05-vfy/`（sha_check.py / live_default.mjs / mutation_test.py / outputs.md）；builder 证据在 worktree 内 `evidence/P6-05/`。

| 验收项 | 结果 | 证据 |
|---|---|---|
| ① approval.yml 只动 preset-standard persona prefix 一个字符串（+注释），p6-reply insert 未动；段落与 P6-02 定稿逐字节一致 | PASS | `git diff main...HEAD --name-only` 恰 5 文件（merge-base=6abbbc0；两点 diff 里出现的 `evidence/D3-orch/prompts.json` 是 main 侧 bba98bb 新增的假象，非本分支删除）。approval.yml 仅 2 个 hunk：+5 行注释、prefix 裸标量→literal block，无其他改动。p6-reply-style.yml 不在 diff 中（未动）。独立重算（sha_check.py，自写提取逻辑非复用探针）：段落 sha256 = c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356 = D3 run-meta.json presetSectionSha256 = 报告值；approval.yml standard prefix 与 p6-reply prefix **逐字节一致**（base 句 + 空行 + 637 字符段落）。 |
| ② 探针独立复跑：默认链会话系统提示含段落全文、agentPreset=standard、p6-reply 未挂 | PASS | `node evidence/P6-05/probe.mjs` 复跑 PASS（静态 PASS；spawn start.mjs，P2SDK_PATCH 仅挂 recorder，session/create 不带 agentPreset → preset=standard，llm/stream 记录系统提示 6148 字符含段落全文）。另自写 live_default.mjs：**完全不设 P2SDK_PATCH** 起默认链 → 默认会话 agentPreset=standard；显式 `agentPreset: p6-reply` 被拒 `agent-preset/not-found`（available=[standard, ptc, minimal, cordis]，无 p6-reply）→ insert preset 不在默认链。 |
| ③ sdk 全量绿，计数 ≥305 | PASS | 干净环境（`env -u P2SDK_PROVIDER HOME=/tmp/... pnpm test`）：**37 文件 / 305 测试全过，exit=0**，Duration 88.5s。计数 305 = 基线（builder 改动前后均 305）。注：verifier 第一次全量误带外层 `P2SDK_PROVIDER=mock`，致 security ⑥ 红（stub requests seen: 0，⑥ 不自设 provider、boot 继承外层 env）——系验收方法污染，非产品问题，干净重跑即绿。 |
| ④ 豁免面最小（见偏离节） | PASS（偏离：接受） | 变异矩阵 mutation_test.py：M1 persona name 漂移→红、M2 agent-instructions maxBytes 漂移→红、M3 cordis 块 disabled 漂移→红、M4 豁免值本身（base 句改动）→绿（豁免设计内）、M5 见偏离节。测试数不变：该文件仍 4 个 it（单跑 4/4 绿），diff 未增删 it。 |
| ⑤ 既有 flaky（sandbox-hardened ④ 并发偶红、单跑恒绿）单跑确认 | PASS | `pnpm vitest run tests/e2e/sandbox-hardened.test.ts` → 9/9 绿，40.9s。本次干净全量中该文件亦绿。记录在案，不立修复任务。 |

坏路径（额外）：默认链显式 `agentPreset: p6-reply` → `agent-preset/not-found`（preset 白名单不含未挂载的 insert preset）；drift 用例对 3 类字段变异照红（M1–M3）。

## 偏离节：drift 用例为 standard persona prefix 加豁免（改 guard-plugin-manager.test.ts，超出「只改 approval.yml」字面）

**结论：接受。**

- **必要性**：persona prefix 追加段落后，drift 用例（approval.yml 覆盖块 vs 上游 standard.patch.yml 逐行比对）必然红；PLAN P6-05 验收 ② 要求「drift 与 sdk 全量绿」，两者互斥，豁免是唯一解法。builder 在报告中如实申报并给理由。
- **豁免面实证（变异矩阵，每次改后恢复，终态 sha 与原文件一致、git status 干净）**：
  | 变异 | 结果 |
  |---|---|
  | M1 standard 块 persona `name` 改一字 | 红 |
  | M2 standard 块 agent-instructions `maxBytes` 65536→65537 | 红 |
  | M3 cordis 块 `disabled: true→false` | 红 |
  | M4 standard persona prefix 的 base 句改标点 | 绿（豁免值本身，设计内） |
  | M5 standard persona config 内 prefix 旁新增 `suffix:` 键 | 绿（见下） |
- **豁免面是否最小**：机制上豁免实现为「persona 的 `config:` 起到下一个 6 空格 `- id:` 兄弟行整段替换为占位（两侧同）」，只对 `preset === 'standard'` 生效；cordis/ptc 块与 standard 块内其余所有行仍逐字比对。**今天 persona config 只有 prefix 一个键，故实际豁免面 = 恰好这一个值**；所有现存其他字段的漂移实证全红（M1–M3）。
- **一处非阻塞观察（M5）**：cut 边界是「persona config 整段」而非「prefix 值结束处」——若将来上游或我方在 persona config 里长出第二个键（如 `suffix:`），其漂移会被同一豁免吞掉（M5 实证绿）。收紧办法是把 cut 终点从 `/^ {6}- id: /` 改为下一个 8 空格键行。属潜在加宽、今天无实体（无此字段），且段落内容另有探针 sha256 硬校验兜底，故不阻塞、不立修复任务；若后续任务触碰 persona config 结构，顺手收紧。

## 新问题

- 无阻塞问题。两条记录在案（均不立任务）：
  - sandbox-hardened ④ 全量并发偶红（既有 flaky，单跑恒绿；本次全量亦绿）——已知问题。
  - drift 豁免的 cut 边界潜在加宽（M5）——见偏离节，触碰 persona config 时顺手收紧。

方法记录（供 LEARNINGS 候选）：sdk 全量测试**不得带外层 P2SDK_PROVIDER**——security ⑥（real provider 哨兵）不自设 provider、boot 继承外层 env，外层 mock 会让它打不到 stub 而假红；全量只覆盖 HOME。
