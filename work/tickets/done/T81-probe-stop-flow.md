# T81：取证——原版文字聊天里「停下 bot」的整条交互链（只取证，不改码）

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3) 派 `reverse-engineer`
> 来源：work/persona-stop-gap/BRIEF.md §2（用户：「stop 和实际体验下来是完全不一样的」）
> 分支 / 作业目录：不动 app/，在集成分支只写 work/**
> claimed：
> accepted：2026-11-13 84fc8d32（经理任务 B）

## 目标
弄清原版用户怎么让一个正在干活的 bot 停下、停下时看到什么，和我们逐项对比，出一张差距清单。改法另开单。

## 经理已知线索（是线索，不是结论，要证实或推翻）
1. 0.78.1 的 `## When they talk over you` 是**语音通话**专用（`main-app.cjs` 的 `interruptedLines()`，`[Interrupted mid-reply after: … Unheard remainder: …]`），不是文字聊天的 stop。
2. 0.78.1 renderer 资源里英文 `Stop …` 文案只找到 dictation / recording / import / update 类，**没找到「Stop generating」一类**；我们恢复的原版 `composer.tsx` 也只有 `Stop dictation`。我们的停止钮是自加的：`app/ui/renderer-grok/overrides/modules/chat-header.tsx:13` `StopButton`（P5-27，走 `shim/src/data.ts:879` `session/cancel`）。
3. 0.18 系统提示暗示原版的交互是「干活时用户随时再发消息，bot 先回一句再继续」（`repos/grok-bot-0.18-reconstructed/source/host/runner/system-prompt.ts:84`、`:105`「pings again while you're mid-task」）——可能原版就是靠发消息叫停，没有按钮。

## 要取证的项（每项给锚点：文件 + 搜索串 / 偏移，或截图）
1. 原版有没有「停止当前回合」的 UI 入口：composer、会话头、消息行、侧栏行右键 / 菜单、快捷键（Esc？）。查 `dist/renderer/assets/*.js` 英文 locale 包与组件，0.79.3 参照 `work/grok-0.79.3-re/RE-FULL-0.79.3.md`。
2. 回合进行中用户再发消息时原版怎么处理：排队、打断当前回合、还是并入（host 侧：0.18 `source/host/runner/` 里 turn / stream / settle 相关文件，0.78.1 `main-app.cjs` / `node-agent-coordinator`）。
3. 被停下后 transcript 呈现：已流出的半截文字留不留、有没有「Stopped」/「Interrupted」标记、工具卡状态、bot 下一回合会不会被告知「上回被打断」（提示词里的 interrupted 注记）。
4. 主 bot 停 worker（原版 StopAgent，我们的 `stop_bot`）在 UI 上的呈现。
5. 我们这边逐项实测同一行为（演示实例或隔离起的 app，截图 DPR2），写成对照。

## 边界
1. 只写 `work/persona-stop-gap/RE-STOP-0.78.1.md` 与 `work/persona-stop-gap/evidence/T81/`；不改 app/、repos/。
2. 产物只读：`/tmp/t78-asar/`、`~/Downloads/grok-bot_0.78.1_amd64.deb`、`repos/grok-bot-0.18-reconstructed`。不读 `~/.grokbot` 等凭证目录。
3. 截图走隔离 HOME / TMPDIR，不弹前台。

## 验收（写命令，不写感觉）
1. `test -s work/persona-stop-gap/RE-STOP-0.78.1.md` 且文件含「差距清单」表：列 = 项 / 原版（锚点）/ 我们（锚点或截图）/ 差异 / 建议改法。
2. 上面 1–5 每项在清单里有一行，每行原版列都有可复查锚点（`grep -c` 能在产物里复现的搜索串，或截图路径）；查不到的写「产物内未找到 + 搜过的串」，不留空。
3. 线索 1–3 每条明确写「证实 / 推翻」。

## 为什么这样验收
用户说「完全不一样」但没说哪里不一样；改法要从证据来，不从猜。锚点必须可复查，经理验收时抽 3 条重跑 grep；「没找到」也是结论，但要写搜过什么，防止搜一下没有就当原版没有。

## 产出
- `work/persona-stop-gap/RE-STOP-0.78.1.md`、`work/persona-stop-gap/evidence/T81/`、`work/tickets/receipts/T81.receipt.md`

## 经理终验（2026-11-13）——**通过**
锚点抽查（重跑）：
- `grep -rl 'Stop generating' /tmp/t78-asar/dist/renderer/assets/` → 0 个文件 ✓
- `ygCKqB`="Stop"：`onStopControl` 唯一在 `chunk-box-desktop-modal-CN4iwwJC.js` ✓（其余命中均为 chunk-core-* 语言包定义，不是消费点）
- `grep -rl 'session/cancel' /tmp/t78-asar/dist/` → 0 ✓
- 0.18 `send-turn-dispatch.ts:129-132` `runner.interrupt("superseded by a new user message", { carriesRecovery })` 原文在 ✓
- 小误差：回执写 `isAgentRunningAtSendStart` 10 处，`grep -o | wc -l` = 9（`grep -c` = 3 行）；不影响结论。
- 工单 5「我们侧实测截图」未做（RE 局限 4 已自报）；验收 2 只要求「锚点或截图」，我们侧代码锚点齐全，接受。线索 1–3 全证实。

## 经理定的修法（后续单建议）
按「原版即规格」，原版叫停 = 再发一条消息（supersede），没有停止钮。拆三件，前一件不依赖用户：
1. **T81a supersede（先做，不等用户）**：bot 正在跑时用户再发消息 → 打断当前 turn（半截已流出文字保留在 transcript，不删）→ 新 turn 立刻开跑并看到完整 transcript（含半截）。第一步先写失败测试钉住我们现在的行为（运行中发消息是被挡、排队还是并发），再改。只动 SDK 的 turn 调度 + 对应测试；不碰 StopButton。验收：e2e「长任务进行中发第二条 → 旧 turn ≤5s 结束为 cancelled/aborted、半截文本仍在、新 turn 回复里回应第二条」。新 turn 的「先回一句再继续」话术已由 T80 的 How a turn works 段覆盖，不另加。
2. **T81b 停止回执**：被打断（无论 supersede 还是按钮）在 transcript 落一条 muted 标记，口径照原版 `messaging.turnStopped`「Your Bot stopped what it was doing.」（中文对应译文）。依赖 T81a。
3. **T81c StopButton 去留**：产品决策，已写 `work/QUESTIONS.md` Q-059。答 A（删）→ 删 `chat-header.tsx` StopButton + 对应 e2e 改断言；答 B（保留）→ 按钮改走 T81a 同一条打断路径（只停 turn，不杀进程树），并补 T81b 回执；答 C → 不动。
- 不做：原版 `interruptAgentRun` 只用于「更新/重置电脑」前批量停，我们没有这个场景，不搬。
