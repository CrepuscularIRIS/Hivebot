# PLAN · persona 语气 / stop 体验 / 系统性 UX 差距

> 立项：manager (Opus 5.5) 任务 A，2026-11-12。需求见 `BRIEF.md`。

## 经理核实结论（改了 BRIEF 的一处前提）

1. **BRIEF 引的 0.78.1 `## Role & Persona` 是语音通话 prompt，不是文字聊天 prompt。** 同一构造器出 `instructions` + `greeting.direction`（"Open the call in one short spoken line"），工具是 `send_task / recall_text_messages / stay_silent / end_the_call`（`/tmp/t78-asar/dist/electron-main/main-app.cjs`，搜 `live phone call` 与 `connectDirection`）。"stay on the line"、"spoken words only"、`## When they talk over you`（`interruptedLines()`：`[Interrupted mid-reply after: … Unheard remainder: …]`）都只属于语音通话，照搬到文字聊天会错。
2. **文字聊天的原版规格在 0.18 重构源码里**：`repos/grok-bot-0.18-reconstructed/source/host/runner/system-prompt.ts:77-130`（`buildSandBaseSystemPrompt`：开场 "You are Grok Bot, a warm, concise desktop assistant." + `## Tone` + `## Reply length and shape`，"Text like a person, not a memo"、"Lead with the result"）和 `system-prompt-assembly.ts:100-117`（`Agent profile:` 段，含 `Your agent name is "X"…`）。0.78.1 的文字 bot 底座在服务端（`grok_bot_system_prompt_override.basePrompt`，本地 fallback 为空），本地产物里没有，0.18 是现有最好的证据。
3. **三段式不是 DSH 上游的，是我们自己写的**：`app/sdk/profile/patches/approval.yml:62-76`（preset-standard 的 persona prefix，P6-05 定稿）与 `p6-reply-style.yml`（逐字节相同），sha256 钉在 `app/sdk/tests/e2e/config.test.ts:221-239`。所以 T80 只改产品 profile，不需要新开 section、也不碰 dsh。
4. 演示实例 session（`/tmp/hivebot-demo/.../session-099a49d1…`）实测：bot「新闻播报」的系统提示里**没有自己的名字**（只在名册里有一行 `(you)`），也没有任何语气段。
5. `You are an AI agent powered by DeepSeek Harness.` 是 dsh-system-prompt 的 order −1000 固定开场（`includeHarnessIdentity`，配置项）。T80 先不关，靠名字段压住；抽样里 bot 自称 Harness 再关（配置项，仍是产品层）。

## 任务表

| # | 项 | 依赖 | 状态 |
|---|---|---|---|
| P1 | **T80** 底座语气换成 0.18 文字聊天规格（persona prefix 重写 + 名字行），`done/T80-persona-reply-style.md` + `done/T80b-persona-greeting-pivot.md` | — | **done** 2026-11-13 @ b46c1c6c（T80+T80b 一起终验过，待合并 feat/T80） |
| P2 | **T81** stop 交互全链取证（只取证，不改码），`done/T81-probe-stop-flow.md` | — | done 2026-11-13 |
| P3 | **T82** 动效 / 微交互 / 行为流审计 → `work/grok-0.79.3-re/RE-MOTION-0.78.1.md` 对齐清单（只取证），`done/T82-audit-motion-behavior.md` | — | done 2026-11-13 |
| P4 | T81a supersede → T81b 停止回执 → T81c StopButton 去留（Q-059），见 `done/T81-probe-stop-flow.md` 尾部 | T81 | T81a **done** 2026-11-13 @ 5a30d45a（待合并 feat/T81a）；T81b 下一张 |
| P5 | T83 会话动效（P0）→ T84 浮层出入场（P0）→ T85–T87（P1），见 `done/T82-audit-motion-behavior.md` 尾部 | T82 | 计划 |
| P6 | bot 人格描述（原版 `Agent profile` 的 `Description:` 行 + 编辑入口） | Q-058 | 计划（等用户） |
