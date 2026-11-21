# REUSE · p5-parity（决策行索引）

v0 骨架 · 2026-11-03 · director（Opus 5.5）。汇总 `work/p5-parity/reuse/*.md` 与 PLAN v2 §0 的复用决策，builder 派发第 1 步读这里对应行；细节与证据以「来源」列指向的原文为准。
剩余 TODO 仅 R4b 行（等回报）。bwrap=LGPL-2+（dpkg copyright 实查）；0.18 仓=非官方重构、仅参照（私用不分发）。
阶梯：1 直接依赖上游 · 2 整仓集成 / 配置接缝 · 3 复制改造（文件头写 `来源: <url>@<sha>:<path>`）· 4 逆向 · 5 自建（须有 scout 反向确认）。

| 能力 | 决策 | 阶梯 | 候选 / 出处 | 许可证 · 维护 | 来源 | 承接任务 |
|---|---|---|---|---|---|---|
| bash 断网 + 目录遮蔽 | 集成 dsh `runnerCommand` 接缝 + 改造 R5 wrapper 为 `app/sdk/sandbox/bwrap-wrap.py` | 2 + 3 | `D/sandbox/sandbox-local/src/index.ts:46-63`；`/usr/bin/bwrap`；本仓 `evidence/r5-run-qXloBM/bwrap-wrapper.py` | dsh MIT；bwrap LGPL-2+（dpkg copyright 实查，2026-11-03） | `reuse/r5-sandbox-probe.md` 复用决策表；PLAN 决策 4 | P5-01 |
| 凭证根单一清单 | 自建 `app/sdk/src/policy/never-roots.mjs`（常量 + 运行时根，wrapper 与 guard 共用） | 5 | 无上游等价物（上游拒读清单不存在：R5 §③ 第 6 行「上游默认不支持该语义」） | 本仓 | PLAN 决策 6、13 | P5-01、P5-02 |
| 路径规范化 | 运行时服务 `ctx.fs.resolve` | 1 | 上游 read-target.ts / fs-sandbox `checkedTarget`（`N/…dsh-fs-sandbox…/lib/index.js:153-165`） | MIT · 已装 0.2.2-alpha.2 | PLAN 决策 3；G2-r1 A-M | P5-02 |
| 路径包含判定 | 复制 `isPathUnder` 到 `app/sdk/src/policy/containment.mjs` | 3 | `deepseek-ai/deepseek-harness@ce7073d5:packages/fs/fs-sandbox/src/containment.ts` | MIT（deepseek-harness@ce7073d5，repos/ 本地只读核实） | PLAN 决策 3（已装包入口不导出，lib/index.js:169） | P5-02 |
| 工具调用拦截 | dsh `tools/pre-execute` 扩展点，新插件 `guard.mjs` | 1 | `D/core/tools/src/contracts.ts:358-361` | MIT | `reuse/r4-tool-gates.md` §1；PLAN 决策 2 | P5-02、P5-03、P5-04 |
| 禁用 plugin_manager | preset `config.plugins` 按 id 覆盖 | 2 | `N/@deepseek-ai+dsh-web-app@0.2.2-alpha.2_*/…/presets/standard.patch.yml:1-3,122-124`（cordis:130、ptc:126 同） | MIT | PLAN P5-03；G2-r1 A-M | P5-03 |
| 子会话判定 | 改现有 `shell-ask.mjs` | 本仓 | 本仓 T-07 / T-12 | 本仓 | PLAN 决策 10 | P5-05 |
| 档位策略 | 改造现有 `shell-ask.mjs` 为查表 | 本仓 | 本仓 | 本仓 | `reuse/r4-tool-gates.md` §2 工具全表 | P5-21 |
| 常驻授权存储 | 自建最小精确键 schema + 复用 `app/ui/main/m3-meta/store.ts` 单写者模式 | 5 | 未选：opencode `permission/{saved,sql}.ts`、codex `execpolicy`、gemini-cli `policy`（逐级否决即反向确认） | 本仓 / Node 标准库 | `reuse/r6-grant-format.md` §1 | P5-24 |
| policy-state 通道 | 复用 store.ts 模式写文件，SDK 读 | 本仓 | 本仓 | 本仓 | PLAN 决策 16 | P5-21、P5-29 |
| MCP 稳定工具名 | 复制改造 `publicToolName` 及 3 个常量 | 3 | `deepseek-ai/deepseek-harness@ce7073d5:packages/mcp/mcp-client/src/tools.ts:44-54,68-86` | MIT · commit 2026-10-29 / release 2026-10-30；issue 回应未验证（`has_issues=false`） | `reuse/d2-mcp-meta.md` §4 | P5-23（任何 D-2 选项） |
| MCP 原始身份 / annotations 桥 | 自建（仅 D-2 选 ② 或 ③ 身份子集时） | 5 | 已装 mcp-client / dsh-tools / mcp-resources 均不暴露 | MIT | `reuse/d2-mcp-meta.md` §4–§5 | P5-23（等 D-2） |
| 提问协议与运输 | 集成 dsh `tool-ask-user` + `user-questions` + gateway | 1 | `@deepseek-ai/dsh-tool-ask-user`、`@deepseek-ai/dsh-user-questions` | MIT · commit 2026-10-29 | `reuse/r7-ask-user.md` 决策行 1–2 | P5-07、P5-28 |
| 提问 UI | 复制改造 QuestionComposer / QuestionReplyView | 3 | `deepseek-ai/deepseek-harness@ce7073d5:packages/client/ui-user-questions/src/client/{QuestionComposer.tsx,QuestionComposer.module.css,QuestionReplyView.tsx}` | MIT | `reuse/r7-ask-user.md` 决策行 3（整插件、timed 模式不选） | P5-33 |
| 0.78.1 视觉数值 / 动效 | 逆向结论直接作规格 | 4 | 本机 0.78.1 解包产物 | 私用不分发（CLAUDE.md §4） | `RE-visual-078-values.md`（R2，覆盖 R8 冲突项，PLAN §0.1）；`RE-visual-residual.md`（R8） | P5-11–P5-17、P5-31 |
| 0.18 视觉参照 | 只参照不搬码 | 3（参照） | R8 锚点（`view.css`、`sidebar.tsx`、`transcript.tsx` 等） | 无独立许可证（非官方重构仓）；仅参照不搬码，私用不分发（CLAUDE.md §4） | `RE-visual-residual.md`（非官方重构仓，仅参照不搬码；私用不分发 CLAUDE.md §4） | P5-11–P5-14 |
| 审批卡行为 / 文案 | 逆向结论作规格 | 4 | 0.78.1 chunk-Bbgcfm9R | 私用 | `RE-approval-model.md` §4（R1）；R2 §B9 | P5-31、P5-32 |
| 受控升权 | 待 D-1 | — | 候选见 PLAN §5 D-1 ①–⑤ | — | PLAN §5 | P5-22 |
| 中途打断 | 先测上游 abort 链路，不达标再改 | 1 | dsh 现有 abort（UI 走 session/cancel；TERM→KILL 宽限 3000ms） | MIT | reuse/r4b-interrupt.md 实测：全树退出 4.5-6.3ms、可续会话；P5-27 验收阈值 5000ms | P5-27 |
