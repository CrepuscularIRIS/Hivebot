# BRIEF · persona 语气 / stop 体验 / 系统性 UX 差距（2026-11-12，用户看 T73c-T75 合并后的新 build）

## 用户原话（2026-11-12 晚，看完最新演示实例）

> 感觉UI上还是差别很大啊, 例如stop和实际体验下来是完全不一样的. 是REA还不够充分吗? Opus 5.5和6.1 Sol也没有吧所有都要对齐的部分列出来, 还有很多动画等等大量的配置. 比如这个回复的内容, 一大堆文字, persoanl agent肯定不是这样的. 去找一找这块的配置. DSH有Bot的, 去看看这块怎么做的.

## 主 agent 取证（已到手，2026-11-12 晚）

### 1. 回复风格（「一大堆文字」）——根因实锤

实测演示实例 session（/tmp/hivebot-demo/state/hivebot/dsh/sessions/*/session.v4.jsonl.zstd 解压，`system/message` 行）：

我们现在的 system prompt 底座 = **DSH coding agent prompt**：
- `You are an AI agent powered by DeepSeek Harness.` / `You are a coding agent powered by the glm-5.3-flash model.`
- `## Replying to the user — Reply in three parts... End the turn with the final result in at most 100 words`
- 之上叠我们的 main bot 编排段（app/sdk/src/orchestration/routing-prompt.mjs 的 ROUTING_PROMPT，经 `agent.ctx.systemPrompt.section({name:'pbots:orchestration-routing', order:getSectionOrder('TEAM_POLICY')})` 注入——p2sdk 有现成 section API）。

**原版 0.78.1 的 persona prompt**（解包 ~/Downloads/grok-bot_0.78.1_amd64.deb → app.asar → dist/electron-main/main-app.cjs，`## Role & Persona` 段）：

```
You are ${agentName}, on a live phone call with the person you work for. Nobody else is on this line.
[descriptionLines(描述定义 voice)]
Talk like a warm, sharp friend only when the description names no voice. When it does, drop that register and speak only in the named voice. Lead with the result.
This turn sounds like talk.
Default to talking. Small talk, a take, a recap of this call, a story, a joke, and anything you already have on this line need no tool.
[工具] only when they want something done or looked up that is not already here.
If they already have the words on this call, [dictation.use]. ...
If you are unsure whether they want work or just an answer, talk first.

## Conversation Flow / ## While work is in flight / ## When they talk over you
## Never claim it is done — Say something is finished only when what came back says so; started is not ended.
## Voice — Spoken words only: no stage directions, no ids or file paths unless they ask. Plain and warm.
CRITICAL INSTRUCTIONS — You ARE ${agentName}. Speak as yourself and in the first person...
```

差异本质：**原版=personal agent（电话感/warm sharp friend/Lead with the result/第一人称/人格由名字+描述定义）；我们=工程代理（三段式报告/Harness 自称）**。main bot 编排段（create_bot/send_to_bot/stop_bot）是用户定的主 bot 结构，保留；要换的是**底座语气段**。
修法路径（待经理定）：p2sdk `systemPrompt.section` 加 persona 段（order 前置或后置压过 DSH 底座三段式），文本按原版 Role&Persona 段适配（agentName=bot 名、descriptionLines=建 bot 时的人格描述）。

DSH 侧参照：repos/dsh-superagent-prototype/prompts/replies.md 有「100 words is a hard ceiling, not a writing target」等 IM 短回复风格段（superagent 原型，非 personal chat，但「简短硬顶」思路同源）。

### 2. stop 体验——待逆向

用户：原版 stop 与我们「完全不一样」。原版 prompt 有 `## When they talk over you`（语音电话感：说话即打断）——stop 可能同语义（即时打断+被打断话术），我们的是工具式 stop_bot/生成中停止按钮。具体交互差异（按钮形态/按下反馈/停止后 transcript 呈现/是否出「被打断」话术）需 REA 对 0.78.1 产物逐项取证。

### 3. REA 充分性——系统性差距清单缺失

现有 RE 报告（work/grok-0.79.3-re/）：CONNECTORS/CONNECT-PRESETS/FULL/UI-LAYOUT/CONNECTOR-GRANT/SETTINGS/BORDERS——**全是静态结构**，没覆盖：动画与过渡（transition/animation/easing/时长）、stop 等交互行为流、persona/prompt 配置（本次已补 prompt）、微交互反馈（hover/press/disabled 态的动效）、声音/通知。用户点名「很多动画等等大量的配置」。
