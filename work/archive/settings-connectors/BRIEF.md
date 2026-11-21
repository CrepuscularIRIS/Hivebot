# BRIEF · settings（API key 等）+ connected apps 复刻

## 用户原话（2026-11-11）

> 我们先把一些settings, 比如apikey, 还有一些connected app这块有bug也去处理一下. 继续rea, manager这样推进. 复刻完整的grok bot为第一个目的.

## 背景

- SSH 线（T46c→T46b）已实机收官；本需求是新阶段第一批，**第一目的 = 复刻完整的 Grok Bot**。
- 推进方式沿用工单制：REA 逆向探针 + manager 立项/验收。

## 现状侦察（主 agent 2026-11-11，供立项输入）

### settings
- `app/ui/renderer-grok/overrides/modules/settings-view.tsx`（11 行）：设置砍到只剩 General——P5-52 时因「Router（Cursor/Claude Code/Codex/OpenRouter 路由）没有实底，我们的 provider 在 dsh 配置里」整段剥掉。
- `settings-panels.tsx`（12 行）：General 再剥 Auto-review、Security Key、Execution on Local Computer 三组（全是桩原因）。
- **缺口**：原版 Settings 的 Router/provider/API key 配置段完全没有 UI；用户要的「apikey 设置」无处可配。dsh 侧 provider 配置现状（怎么配、配了没、能否从 UI 触达）待立项探明。

### connected apps
- onboarding `ConnectStep`（overrides/modules/onboarding-steps-0793.tsx）：Gmail/Google Calendar 两个连接器，Connect 按钮**恒 disabled**（title="Connector sign-in isn't wired in this build yet"）。
- 主界面侧栏有「Connect apps」入口（Win11 VM 实机截图 OCR 见过）；其落地组件与 bug 形态待探明。
- 市场面板（market-store）是「安装」不是「账号连接」（queue.md 既有结论）。

## 原版锚点

- 产物：`~/Downloads/grok-bot_0.78.1_amd64.deb`（闭源，行为以它为准）
- 既有逆向工作区：`work/grok-0.79.3-re/`（RE-FULL-0.79.3.md、RE-UI-0.79.3.md、onboarding-0793-extract.json）
- 0.18 复刻源码：`repos/`（行号锚点用）

## 要求

1. 先 REA 逆向 0.78.1 的 Settings（Router/API key 段全貌：provider 列表、key 输入/校验/存储、路由切换）与 Connected apps（入口、连接流、状态存储、Grok Bot's Computer 关联），产出规格锚点。
2. manager 任务 A 立项拆单：分清「复刻缺失」与「现存 bug」，按复刻完整 Grok Bot 的目标排优先级；要用户拍板的进 QUESTIONS.md。
3. 行为与语义按「原版即规格」：先查 0.78.1 产物与既有提取，按原版定，写明锚点。
