# 归档：旧多 agent 编排（2026-10-28 ~ 2026-11-05）

2026-11-05 起停用。原因：subagent 开发太慢；额度主要耗在上下文重读（详见 `work/REPORT-2026-11-05.md`）。
现行架构见仓根 `CLAUDE.md`：主 agent（GLM 5.3）开发、`manager`（Opus 5.5）经理、`reviewer`（6.1 Sol）独立审查。

| 归档内容 | 原用途 |
|---|---|
| `agents/` | builder、verifier、verifier-flash、director、drafter、scout、ux-proposer、frontend-dev、judge |
| `skills/grok-orchestrate/` | 主会话一层派发编排手册；`references/roadmap.md` 有项目路线，仍可参考 |
| `commands/panel.md` | `/panel` 双席盲评 |
| `mm-review.js`、`build-lead.md` | 更早停用的多模型 review 与两层编排 |
| `PROTOCOL.md`、`REVIEW.md`、`MODELS.md` | 旧流程的闸门、review 设计、模型派发对照与画像 |
| `CLAUDE.bots-v2.md` | 更早的 Gas City 版主控文件 |

需要时可以 `git mv` 回 `.claude/` 重新启用。
