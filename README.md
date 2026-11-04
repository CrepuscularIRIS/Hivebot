# Hivebot

A desktop multi-bot personal agent built on **[dsh (deepseek-harness)](https://github.com/deepseek-ai/deepseek-harness)** and **[dsh-superagent](https://github.com/deepseek-ai/dsh-superagent-prototype)**. The goal is feature and UI parity with Grok Bot.

> Hivebot is an independent project. It is not affiliated with or endorsed by xAI. "Grok" is a trademark of its owner and is mentioned here only to name the parity target.

## Goal

- **One main bot, many workers.** The main bot routes and orchestrates; the worker bots it creates stay hidden by default and can be shown in a Cowork-style sidebar while they run.
- **Cross-session orchestration.** The main bot dispatches work to workers, collects results, and keeps a human-in-the-loop queue for approvals and questions.
- **The agent decides on its own and asks only when needed.** Safety comes from OS-level enforcement (bubblewrap sandbox, network off by default, per-call network grants) instead of a click-through approval for every action.
- **1:1 UI parity** with Grok Bot 0.18, checked side by side against a running reference in light and dark themes.

## Architecture

```
Electron shell (electron-vite)
  └─ renderer (Grok Bot 0.18-parity UI) ─ shim (window bridge)
       │  M1 /api passthrough · M2 mux MessagePort · M3 bots-meta store
       ▼
  dsh runtime ─ sessions · presets · MCP connectors · ask-user
       │  tools/pre-execute → policy guard (NEVER / ASK tiers, standing grants)
       │  runnerCommand → bwrap (no network, credential roots masked) ─→ slirp4netns on request
       ▼
  LLM gateway (Anthropic-compatible, e.g. LiteLLM)
```

## Status

| Phase | Scope | State |
|---|---|---|
| P1 | Reverse-engineering map of the reference app | in progress |
| P2 | SDK on dsh (presets, connectors, market) | done |
| P3 | Frontend ⇄ SDK contract | done (v1.x) |
| P4 | Electron shell + UI | done |
| P5 | Parity: sandbox, approval model, visual 1:1 | fix chain in review |
| P6 | Main-bot orchestration (superagent) | planning (G2 review) |

Tests on `main`: about 690 in total. UI: 384 unit + 68 e2e. SDK: 305.

## Source

The source is not public yet. The repository will be populated once a per-file license review is done, separating original code from third-party and reference-derived assets.

## Built with

- [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (MIT): agent runtime
- [dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) (MIT): orchestration reference
- [electron-vite](https://github.com/alex8088/electron-vite), [Playwright](https://playwright.dev), [react-markdown](https://github.com/remarkjs/react-markdown)
- [bubblewrap](https://github.com/containers/bubblewrap), [slirp4netns](https://github.com/rootless-containers/slirp4netns)

---

**中文简介**：Hivebot 是一个基于 dsh 和 dsh-superagent 的桌面多 bot 个人助手，目标是功能和界面都与 Grok Bot 1:1 对齐。主 bot 负责编排，worker bot 默认不显示，可以在侧栏里展开查看。安全不靠逐条弹窗审批，而是靠 OS 层面的沙箱来拦截。源码要等许可证逐项审查完才会公开。
