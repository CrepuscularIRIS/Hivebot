# T12a：ssh 断连的专用通知「可能已执行」（只认出 + 告知，不重启）

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：queue 5d（T12 计划行）；DESIGN-ssh-composition D7；T4 回执 §5-1；Q-034（「重新连接」按钮要不要做，默认 C = 本单不做按钮）
> 分支 / 作业目录：feat/T12a @ /tmp/bot-wt/T12a（两个包各一处小改，worktree 防撞后台验收）
> claimed：2026-11-07 21:1x main (GLM 5.3) @ feat/T12a（起点 f0c31c54）
> accepted：（经理验收通过时填：日期、HEAD）

## 经理立项探针（纯读文件，2026-11-07）
1. **现状文案**：`app/ui/renderer/session/reduce.ts:132-139` `endNotice` 对任何 error 都是 `回复失败：<message>`（tone danger）。断连时用户看到「回复失败：SSH connection is closed」，没说那一步可能已经做了。
2. **这条 notice 是活路径**：产品 renderer 是 renderer-grok，shim `data.ts:15` 用 `reduceFollow`，`turn-fold.ts:102` 原样透传 reduce 的 notice，`entries.ts:133` 变成 transcript notice 的 `content`。只改 `endNotice` 一处即全链生效。
3. **两个下游按 notice 形状判定，改文案时不能动**：`turn-fold.ts:73-76` 按 `id=end-<turn>` + `tone==='danger'` 判回合 error；`shim/src/workers.ts:60` 去掉 `回复失败：` 前缀取 worker 失败摘要（断连串没有这个前缀，摘要会是整句专用文案——可接受，不改 workers.ts）。
4. **触发串上游锚点**（rc.1 装包）：`app/sdk/node_modules/@deepseek-ai/dsh-ssh/lib/index.js:243` `"SSH connection is closed"`、`lib/protocol.js:224` `"SSH helper disconnected; outcome is unknown"`。
5. **web 组合下 turn/end 的 reason 真实形状没人见过**：T4 测的是 headless（事件名 `final`/`turn_end`，`ssh-headless.test.ts:236-266`），产品走 web 的 `session/follow`。串落在 `reason.message` 还是 `reason.error.message` 还是别处，没有原样证据——所以第 1 步先抓真帧，单测喂真帧，不喂自己编的形状。
6. **main 侧没有 turn/end 消费者**：main 的 `$events` 常驻订阅只入账审批/提问（`main/dsh/ledger.ts:11-14`、`main/m2-mux/index.ts:200-214`）；turn/end 只在 renderer 的 follow 流里。DESIGN D7「main 在事件流里看到固定串」与代码不符——本单在 renderer 认串，不碰 main。
7. **不做全局离线态**（DESIGN D7 原写「各 bot 发送按钮进入离线态」）：断开的只是远端工具，LLM 在宿主、聊天照常能用；把所有 bot 置离线会挡掉还能用的功能。之后每个 bot 碰远端时各自会报错。

## 目标
ssh 断连那一轮结束时，通知换成专用文案，告诉用户「上一步可能已执行」和怎么恢复；其他失败照旧「回复失败：…」。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（变异刀先提交教训；detached 子进程；断言载体）
2. `work/p9-dsh-integration/DESIGN-ssh-composition.md` D7 节
3. `app/sdk/tests/e2e/ssh-headless.test.ts:238-266`（T4 ② 杀 ssh 客户端的写法：`server.clientPids()` 基线差 + 等远端 `started` 文件）
4. `app/sdk/tests/e2e/ssh-bash.test.ts:58-160`（beforeAll 起法、`driveBash`、`approveAll`）
5. `app/ui/renderer/session/reduce.ts:132-139`、`app/ui/tests/unit/session/reduce.test.ts:42-46`、`app/ui/tests/unit/grok-shim/entries.test.ts:55-58`

## 边界
1. 只动：`app/sdk/tests/e2e/ssh-bash.test.ts`（文件末尾加一个 describe）、`app/ui/renderer/session/reduce.ts`（`endNotice` + 一个导出常量）、新建 `app/ui/tests/unit/session/end-notice-ssh.test.ts`、`work/tickets/receipts/T12a.md`。别的不碰；超出就停下写回执存疑项。
2. **不碰** main、shim、overrides、launcher、start.ts；不做按钮、不做重启、不做离线态（Q-034）。
3. 先红：第 2 步的新单测在 reduce.ts 未改时跑，贴红的原样输出。
4. 测试走隔离 HOME / TMPDIR（TMPDIR 照 T10b 口径），DBus 指不存在路径；只跑下面列的文件；e2e 同一时刻只跑一套（后台还有验收在跑，先 `pgrep -af vitest` 看一眼）。
5. 新 describe 自己 `launchRuntime` 一套（**不复用 beforeAll 的 rt**——杀了它的 ssh 会害后面的格），`try/finally` 里 `rt.stop()`；格末从 `rt.readStderr()` 解析 `p2sdk: dsh pid N`，断言 `/proc/N` 不存在（5a⁗″ 的教训：别留孤儿 dsh）。
6. 凭证不进代码、文档和日志。只在本单分支提交。

## 要做的事
1. **抓真帧（SDK e2e，新 describe `T12a ⑦`）**：
   - replay 脚本：`bash {command:'printf go > started; sleep 30'}` → `bash {command:'printf x > after-cut.txt'}` → `textCall('T12a')`。
   - follow 该会话，循环里 `approveAll`；等远端 ws 出现 `started`（≤45s）→ 按 T4 写法 SIGKILL 本格基线之后新增的 `server.clientPids()` → 等 turn/end（≤60s）。
   - 断言：① 有一条 `tool/result` 的 `isError===true` 且正文含 `outcome is unknown`；② turn/end 事件 `JSON.stringify(event.data.reason)` 含 `SSH connection is closed`；③ 远端 ws 没有 `after-cut.txt`（断连那一轮之后的调用没执行，也没被重放）。
   - `console.log('[T12a-raw]', JSON.stringify(f))` 打出那条 tool/result 和 turn/end 两个**整帧**（`{type:'event', event:{…}}`，正是 ui `reduceFollow` 吃的形状，第 2 步直接粘贴）。
   - 再在同一 rt 上建第二个会话发一轮（一个 bash），等 turn/end（≤60s，只断言「到了、不挂」），同样打 `[T12a-raw-2]` 两类事件全文。这一格只为看清「断开之后别的 bot 碰远端是什么形态」，回执如实写：串出现在 turn/end 还是只在 tool/result。
2. **先红（ui 单测）**：新建 `end-notice-ssh.test.ts`，把第 1 步打出的 turn/end 事件**原样粘贴**进测试（注释写「来源：receipts/T12a.md 第 1 步，ssh-bash.test.ts T12a ⑦ 实测」），照 `reduce.test.ts:8` 的 `run()` 写法经 `reduceFollow` 喂进去：
   - 断言 notice = `{ kind:'notice', id:'end-<turn>', tone:'danger', text: SSH_LOST_NOTICE }`；
   - 普通错误事件（`reason:{kind:'error', message:'boom'}`）仍是 `回复失败：boom`（正对照）；
   - 再过一遍 `foldTurns` → 该段回合判 error（notice `source:'reduce'`、tone danger 不变），证明 `turn-fold.ts:73-76` 没被文案改动绕过。
   - 跑一次看它红（`SSH_LOST_NOTICE` 还不存在 / 文本仍是「回复失败：…」），贴原样。
3. **实现**：`reduce.ts` 导出
   `export const SSH_LOST_NOTICE = '电脑连接已断开。上一步可能已执行，也可能没执行——先看看结果再决定要不要重试。重新打开 Hivebot 即可重新连接。'`
   `endNotice` 在通用 error 分支之前：`JSON.stringify(reason)` 含 `SSH connection is closed` 或 `outcome is unknown` → 返回 `{ kind:'notice', id, tone:'danger', text: SSH_LOST_NOTICE }`。用 stringify 整体找串而不是取某个字段：第 1 步若证明串固定在某个字段，也照样用整体找（字段位置上游可能变，串是上游固定的）；写一行 `ponytail:` 注释说明上限（误认：用户自己的报错里恰好含这两串）。
   - 如果第 1 步 ② 证明 web 下 turn/end 里**没有**这两串（只在 tool/result 里）→ 停下写回执贴原样帧，经理改方案；不要改去匹配 tool/result 凑绿。
4. 回执 `receipts/T12a.md`：第 1 步 `[T12a-raw]`/`[T12a-raw-2]` 原样、先红原样、各验收命令原样尾部、变异原样。

## 验收（写命令，不写感觉）
（隔离 HOME / TMPDIR / DBus；sdk 命令在 `/tmp/bot-wt/T12a/app/sdk`，ui 命令在 `/tmp/bot-wt/T12a/app/ui`，都带 `pnpm --config.verify-deps-before-run=false exec`）
1. `vitest run tests/e2e/ssh-bash.test.ts -t 'T12a'` → `1 passed`（其余 skipped）；输出含 `[T12a-raw]` 两行、`[T12a-raw-2]` 两行。跑后 `pgrep -af 'bot-wt/T12a' | grep -v pgrep` → 空。
2. `vitest run tests/e2e/ssh-bash.test.ts` → 施工前基线条数 +1 全过（回执贴前后两次的 `Tests` 行）。
3. `vitest run tests/unit/session/end-notice-ssh.test.ts tests/unit/session/reduce.test.ts tests/unit/fold/turn-fold.test.ts tests/unit/grok-shim/entries.test.ts` → 全过（回执贴 `Tests` 行）。
4. 变异（cp 备份、先提交绿版再动刀，还原后 `git status` 干净）：
   - M1：`endNotice` 里删掉新分支 → `end-notice-ssh.test.ts` 的真帧格红；
   - M2：匹配串只留 `outcome is unknown` → 若真帧 turn/end 只含 `SSH connection is closed`，真帧格红（回执写明真帧里各含哪串；两串都含则此刀预期绿，如实写）；
   - M3：新分支返回 `tone:'muted'` → fold 判 error 的那条断言红。
5. `git diff --stat <起点>..HEAD` 只含边界第 1 条的四个文件。
（不要求覆盖率数字：ui 包没装 `@vitest/coverage-v8`，改动是一个分支 + 常量，M1/M3 两刀即覆盖它的两个出口。）

## 为什么这样验收
要保住的是「真断连时用户看到的确实是这句话」。最容易出的假绿是：单测喂一个自己编的 `reason:{message:'SSH connection is closed'}`，产品里串其实在别的字段或根本不在 turn/end 上，测试全绿、用户照样看到「回复失败」。所以第 1 步先在 web 组合里杀一次 ssh 拿真帧，单测原样喂真帧（验收 1 + M1）。第 1 步的 ③ 同时钉住 D7 的「不重放」：断开那一轮后面的调用没执行。M3 防止为改文案改坏回合状态（error 回合被当成 stopped/completed）。不截图：只换了既有 notice 卡里的文字，没有新视觉元素；0.78.1 也没有对应卡（box 重连由服务端管，`evidence/T5/d7-disconnect-copy.txt`）。

## 产出
- `app/sdk/tests/e2e/ssh-bash.test.ts`（末尾 describe `T12a ⑦`）
- `app/ui/renderer/session/reduce.ts`（`SSH_LOST_NOTICE` + `endNotice` 一个分支）
- `app/ui/tests/unit/session/end-notice-ssh.test.ts`（新）
- `work/tickets/receipts/T12a.md`
