# VERIFY · T-06 D5 重启存续 + 断线重连

verdict: PASS
commit: e1d45c885a06cd4f5e291c686656cb18cd19c719（e1d45c8 + 3873d0b，基点 513dcf1 = main）
worktree: /tmp/bot-wt/T-06 · 验收后 worktree 仍 clean，HEAD 未动
验收人环境：本机 pnpm exec vitest 5.0.5，串行执行（GPU 训练期约束），负载 ~5

## 验收项判定

| 验收项（PLAN T-06 原文） | 结果 | 证据（命令 / 文件 / 截图路径） |
|---|---|---|
| ① 2 个 session 各聊 1 轮 → `kill -9` → 用同一条 start 命令重启 → list 返回这 2 个 session，events 取回历史 | PASS | `restart.test.ts` ①（L189-217）：2 session 各 runTurn → killTree9(SIGKILL) → `bootHome(home, patch)` 同一 argv/env/P2SDK_HOME 再 spawn（= package.json `"start": "node scripts/start.mjs"` 原命令）→ list 恰 2 个且 `agentAvailable` 全 false（冷启动）→ 逐 session events 断言 prompt/reply/`['completed']`。复跑证据：`evidence/t06-two-files-run.txt`（3/3）、`evidence/t06-full-suite.txt`（36/36）。独立印证 2 份：① 磁盘解码 `evidence/t06-ondisk-decode.txt`（zstd 会话文件直读出两条 prompt+reply+completed）；② vitest 外手动重启 `evidence/t06-badpath-restart.out`（冷 list 2 个、冷 events 有历史） |
| ② 流式输出中途 `kill -9` 再起：已完成的回合都在，中断的回合已被收尾（dsh-sessions.md:50） | PASS | `restart.test.ts` ②（L219-264）：turn 1 完成后，turn 2 用 gate `t06-mid` 把 fake 挂在首 delta 之后（真流式中），`waitForDelta('子')` 确认客户端已收到才 kill。两层断言都在：冷读 `turnEndReasons == ['completed','interrupted']`（L242）＋ 续聊一问后 `['completed','interrupted','completed']`（L258）。磁盘解码独立得到同一三层序列（`evidence/t06-ondisk-decode.txt` 第 3 行）；fake 请求日志（`/tmp/p2sdk-t06-r2-*/fake/requests.jsonl`）显示重启后模型调用携带全部三轮历史、且 runtime context 中 Web GUI URL 端口由 46877 变 35135（进程确为重启后的新进程） |
| ③ 关掉 mux socket → 重新 `/connect` → 重新 follow → snapshot + cursor 补齐断线期间已持久化的事件；旧 cookie 被拒（dsh-api.md:84）；不断言 transient chunk 会重放 | PASS | `reconnect.test.ts`（L90-151）：`client.close()` 关 socket → `waitForCookieRejection` 轮询旧 cookie 直至 HTTP 401（5s 仍被接受即 FAIL，L76-88）→ 断线期间 operator B 完成第 2 轮（`['completed','completed']`）→ 新 `/connect` + re-follow，首帧 snapshot：`cursor > cursorBefore`、records 含 PROMPT_B 与 PIECES_B 拼接文本（L135-140）；代码中无 transient chunk 重放断言且 L141-143 注释显式声明不主张。跑通见 `evidence/t06-two-files-run.txt` |

## 步骤项判定

| 步骤 | 结果 | 证据 |
|---|---|---|
| 干净复跑：两文件单跑（3 测试） | PASS | `pnpm -C app/sdk exec vitest run tests/e2e/restart.test.ts tests/e2e/reconnect.test.ts --no-file-parallelism` → Test Files 2 passed, Tests 3 passed（9.25s）。`evidence/t06-two-files-run.txt` |
| 全量（--no-file-parallelism，应 36/36） | PASS | `pnpm -C app/sdk exec vitest run --no-file-parallelism` → 6 files / 36 tests 全过（27.14s）。`evidence/t06-full-suite.txt`（输出中「no ready line within 1ms」为单测超时错误路径用例的 stdout，非失败） |
| 跑后 pgrep 无孤儿 | PASS | 跑前基线 `evidence/t06-proc-baseline-before.txt`；跑后差分：0 个 `bot-wt/T-06` 进程、0 个 dsh 残留。窗口内新增的 `node parent.mjs`（cwd=/tmp/lkdbg2）经 /proc 核实为他人调试进程，非 T-06 产物，未动 |
| kill 进程定位方式（应 pgrep 拿 PID） | PASS | `restart.test.ts` L38-45 `childPids()` 用 `pgrep -P <pid>` 取直接子进程，L83-92 `killTree9` 逐 PID SIGKILL；两文件 grep 无 pkill 调用（仅 L14/L37 注释声明纪律）；reconnect 走 harness `rt.stop()`（SIGTERM→SIGKILL 兜底） |
| 区域：diff 仅两个新测试文件 | PASS | `git diff --name-status 513dcf1..e1d45c8` = 仅 `A tests/e2e/reconnect.test.ts`（151 行）、`A tests/e2e/restart.test.ts`（264 行），无其他改动；验收后 `git status --short` 为空 |

## builder 新发现复核

| 发现 | 复核结论 | 证据 |
|---|---|---|
| llm-replay 按 live session 绑定，一个 runtime 驱动不了 2 session → 两测试改走 T-02 fake | 属实，处理正确 | `dsh-llm-replay/lib/index.js` 头注自述「binds fresh live sessions to parent/child scripts」（按录制 session 谱系绑定）。两测试 provider 均为 `p2fake`：restart.test.ts `fakeOverlay()` 指向 `tests/support/fake/plugin.mjs`（与 harness overlayEnv() 逐行同构）；reconnect 直接用 harness `launchFakeRuntime()`。fake plugin 按 `$P2SDK_HOME/fake/scripts/<sessionId>.json` 取脚本（plugin.mjs L96-98），遗留 home 的 `fake/requests.jsonl` 记录同一 runtime 两个不同 sessionId 的调用（provider=p2fake），实证单 runtime 多 session 成立 |
| wire 事件形状：user/message 平铺 vs assistant/message 嵌套，测试过滤据此写 | 属实，且与上游语义逐字一致 | dsh-agent-loop `lib/index.js:949` `append("assistant/message", {turn, step, message, …})`（嵌套 `data.message`）；`:862-866` `append("user/message", message)`（message 对象平铺进 data）。session-controller `index.js:2656/3837` 上游自身即用 `event.data.source.kind === "user"` 识别真实 prompt——与测试 `realUserTexts` 过滤同款；本人磁盘解码脚本用同一形状成功解析真实 zstd 文件（`evidence/t06-ondisk-decode.txt`） |

## 额外坏路径（verifier 自选：重启后恢复 + 错误输入）

`evidence/t06-badpath-restart.mjs/.out`（vitest 之外，同一条 start 命令重启遗留 home）：
- 错误 token `/connect` → HTTP 401 拒绝；
- bogus sessionId 调 `session/events` → 干净 RPC 错误 `session/not-found`，随后 `session/list` 仍正常（runtime 存活，无挂起无崩溃）；
- 顺带第三次独立复验 ①（冷 list 2 个、events 有历史）；
- 脚本进程按 PID 清理（1775817/1775830），`ps` 复核已消亡。

## LEARNINGS 合规

- 测试路径一律 `mkdtempSync(join(tmpdir(), …))` 从临时根派生：合规。
- 无 pkill -f、无 sqlite：合规。未触碰 `~/.grokbot`、凭证未进日志（解码脚本只打路径与文本）。

## 新问题（每条一行，可直接成为修复任务）

- [FIX] 机器遗留 5 组 runtime 进程（`node scripts/start.mjs` + dsh，指向 /tmp/bot-wt/T-03 与 /tmp/t03dbg，PID 见 evidence/t06-proc-baseline-before.txt） | 复现：`pgrep -a -x node | grep t03dbg` | 疑似位置：T-03 builder 调试会话未清 | 严重度：low（非 T-06 产物，不影响本次判定，但占训练机负载）
- [FIX] /tmp 下 T-06 测试 home 不清理，builder 开发期已积 9 对（/tmp/p2sdk-t06-r{1,2}-*，各含 zstd 会话文件与 fake 日志） | 复现：`ls -d /tmp/p2sdk-t06-*` | 疑似位置：tests/e2e/restart.test.ts（无 afterAll 清理；harness 系的 p2sdk-runtime-/p2sdk-fake-patch- 同样累积） | 严重度：info（/tmp 自清，非阻塞；如需可给测试加 afterAll rmSync）

## 结论

①②③ 全部 PASS，语义、区域、kill 纪律、孤儿检查、两项 builder 新发现复核全有真实环境证据。T-06 可合并。
