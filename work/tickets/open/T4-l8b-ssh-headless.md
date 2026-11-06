# T4：L8-b dsh headless + ssh 族真组合（llm-replay 驱动，工具调用经 ssh 落到夹具主机）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：work/p9-dsh-integration/BRIEF.md 目标 3、L8，验收第 1 条的「工程 bot 在 ssh 主机上改代码跑测试」前半段；PLAN.md §3（十条事实）、§5 第 1 条
> 分支 / 作业目录：feat/T4 @ **/dev/shm/bot-T4**（不能放 /tmp/bot-wt：helper.js 在 node_modules 里，会落进 bwrap 私有 /tmp，PLAN §3 第 5 条）
> claimed：（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）

## 目标
T2 证明了「手搭的 dsh ssh 族能连上夹具 sshd」。本单证明**真实 dsh 进程**（`dsh headless` profile，不是测试进程里手搭的 Context）换上 ssh 族后，**模型发起的工具调用**（bash、write）确实经 ssh 在夹具主机上执行；ssh 断开后工具报错，不悄悄回落到本机。

范围只到「进程级 ssh 组合 + 上游 headless profile」：
- 不带我们的 approval.yml / fs-zone / guard / shell-ask——它们怎么和 ssh 组合是 T5 的设计题（PLAN §2 fs-zone 行）。
- 按 preset 隔离（只给部分 bot 远端电脑，PLAN §5 第 1 条）留给 T5。
- 真实远程主机怎么装 helper（PLAN §5 第 4 条）不在本单。
- `src/**` 不接产品。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（尤其「ssh 本机测试的四个坑」）、work/p9-dsh-integration/PLAN.md §3 全部十条
2. 已合并的夹具：`app/sdk/tests/support/ssh-host.ts`、`app/sdk/tests/e2e/ssh-host.test.ts`，以及 `work/tickets/receipts/T2.md` §5、`receipts/T2b.md`、`receipts/T2c.md`（断连判据、pdeathsig、`ssh-client.pids` 登记簿）
3. headless profile：`app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-headless@*/node_modules/@deepseek-ai/dsh-headless/cordis.patch.yml`（**改 sandbox-policy 行时必须带上 `additionalWritableRoots: !!js ctx.headlessStartup.additionalWritableRoots` 并 `inject: [headlessStartup]`**，否则 runner 拒跑——见同目录 README §Supervising implementation tasks）；`--json` 事件形状见同 README §Machine-readable output
4. base 行 id：`@deepseek-ai/dsh-base/cordis.patch.yml` 里的 `fs-sandbox`（:520）、`subprocess`（:234）、`sandbox`（:240）、`sandbox-policy`（:243）、`session-title-llm`（:67）、`ptc-runtime`（:393）、`workflow-ptc`、`tool-workflow`、`tool-executor-ptc`
5. ssh 族配置：`repos/deepseek-harness/packages/ssh/ssh/README.md` §Deployment prerequisites（PTC 段：script 部署没配 bootstrap 时 PTC 不可用）
6. 行写法照抄 `app/sdk/src/start.ts:332-366` `writeRuntimePatch`：插入行一律**绝对 file URL**（`$DSH_HOME` profile 没有 node_modules）；llm-replay 用 `file: /p2sdk/unused-session-fixture.jsonl` + `overrideFile`（裸 `ReplayEntry[]`，每个元素是主会话的一次模型调用）；模型路由照 `profile/patches/p2sdk.yml:38-44` 指到 `mock/mock`
7. tool-call 的 chunk 形状照抄 `app/sdk/tests/e2e/write-outside.test.ts:170-195`（`toolCall()` / `textCall()`）

## 边界
1. 只动：`app/sdk/tests/support/ssh-host.ts`（推广）+ 新建 `app/sdk/tests/e2e/ssh-headless.test.ts`。`src/**`、`profile/**`、`package.json`、`ssh-host.test.ts` 都不碰（依赖 T2 已装齐；要加包就停下写存疑）。
2. 夹具推广：把 `startSshHost()` 拆成两段——`startSshServer()`（密钥、私有 sshd、ssh_config、`bin/ssh` 包装、helper realpath+sha256、`ssh-client.pids`、`stop()`，**不建 in-process Context、不改 `process.env.PATH`**）和原 `startSshHost()`（= server + 现有的 in-process 组合）。`ssh-host.test.ts` 不改一字，必须仍 10 passed。
3. ssh patch（测试运行时生成在夹具目录下，**不进 profile/**；产品形态等 T5）：
   - `disabled: true`：`fs-sandbox`、`subprocess`、`sandbox`、`session-title-llm`（否则标题生成会吃掉一次 replay 调用）
   - PTC 行（`ptc-runtime`、`workflow-ptc`、`tool-workflow`、`tool-executor-ptc`，以实际加载报错为准增减）一并禁用：本机 node PTC 在 ssh 模式下是一条回落本机的执行路，而 script 部署未配 bootstrap 时上游 PTC 不可用。禁了哪些写进回执；接 `ctx.ssh.ptcLaunch` 是 T5 的事
   - `insert`：`ssh`（host 别名、`launch: { kind: node-script, node: <process.execPath> }`、helper realpath、helperHash、`workspace` = 夹具 `ws`）、`fs-ssh`、`subprocess-ssh`、`sandbox-ssh`，绝对 file URL 指 `app/sdk/node_modules/@deepseek-ai/dsh-*/lib/index.js`（以包 `exports` 实际入口为准）
   - 覆盖 `sandbox-policy`：`workspaceRoot` = 夹具 `ws`（**不是** `process.cwd()`），保留 headless 的 `mode` 与 `additionalWritableRoots`
   - replay patch 单独一个文件（llm-replay 行 + `agent-default-model` 指 mock/mock）
4. headless 子进程：`setpriv --pdeathsig TERM <process.execPath> <dsh>/lib/bin.js headless --patch <ssh.yml> --patch <replay.yml> --permission-mode workspace-write --approval-policy never --json "<task>"`。
   - cwd = 夹具下**空的** `host-cwd/`（与 `ws` 分开，用来抓「回落到宿主 cwd」）
   - env **显式白名单**构造，不展开 `process.env`：`PATH`=`<夹具>/bin:<原 PATH>`、`HOME`/`TMPDIR`=隔离目录、`DSH_HOME`=夹具下新目录、`DBUS_SESSION_BUS_ADDRESS`=不存在路径、`DSH_TELEMETRY_MODE=DISABLED`。**env 里不得出现 `PBOTS_SSH_MARK`**（测试里断言），否则 marker 证明不了执行位置
5. 先写失败测试：先建 `ssh-headless.test.ts` 全部格子，`startSshServer` 尚未导出时跑一次看红（贴原样输出），再实现。
6. 遇到下列情况**停下写回执存疑，不要换证明方式**：dsh 加载 ssh 插件报 cordis 双实例 / peer 解析错（插件按 file URL 装进 dsh 进程，和 T2 在测试进程里 import 不是一回事）；bash 在 `workspace-write + never` 下被判需审批而拒绝；正常退出后 `/tmp/dsh-ssh-*` 有新增。
7. 测试走隔离 HOME / TMPDIR（`/tmp/bot-T4-*`），DBus 指不存在路径；只跑 ssh-host 与 ssh-headless 两个文件，不跑全量。
8. 只杀本测试自己 spawn 的 child handle 与 `ssh-client.pids` 里**本次运行新增**的 PID（用跑前的行数切分）；不按名字/模式杀。

## 验收（写命令，不写感觉）
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T4-XXXX); mkdir -p $T/tmp $T/home
ls -d /tmp/dsh-ssh-* 2>/dev/null | sort > $T/dsh-ssh.before
cd /dev/shm/bot-T4/app/sdk
env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent \
  pnpm --config.verify-deps-before-run=false exec vitest run tests/e2e/ssh-headless.test.ts tests/e2e/ssh-host.test.ts
```
1. 上面命令 → **2 files passed，ssh-host 10 passed + ssh-headless 4 passed**，exit 0。ssh-headless 四格：
   - **① 正路**：一次 headless 运行，replay 三次调用：(0) `bash`：`printf %s "$PBOTS_SSH_MARK" > bash-mark.txt`；(1) `write`：`write-proof.txt` 写入每轮随机串 R；(2) 文本收尾。断言：exit 0；`--json` 流的 `final.reason.kind === 'completed'`；流里两条 `tool_result` 均无 `error`；`ws/bash-mark.txt` 内容 === 本轮 mark（只有经 sshd 会话起的进程才有它）；`ws/write-proof.txt` === R；`host-cwd/` 仍为空；传给子进程的 env 对象不含 `PBOTS_SSH_MARK`。
   - **② 断连不回落**：第二次 headless 运行，replay：(0) `bash`：`printf go > started; sleep 30`；测试轮询到 `ws/started` 后 SIGKILL 本次运行新增的 `ssh-client.pids`（含 master）；(1) `bash`：`printf x > after-cut-bash.txt`；(2) `write`：`after-cut-write.txt`；(3) 文本收尾。断言：调用 (0) 的 `tool_result` 带 `error`，且在 kill 后 **15s 内**到达（不是等 sleep 30 跑完）；`ws/after-cut-bash.txt`、`ws/after-cut-write.txt`、`host-cwd/` 下都不存在任何新文件；子进程 60s 内退出。调用 (1)(2) 是「报 error 的 tool_result」还是「运行已整体终止、没有执行」，两种都算过，但回执必须写明实际是哪种并贴对应 `--json` 行（这是 T5 设计「结果未知在 UI 怎么表达」的输入，PLAN §3 第 7 条）。
   - **③ 真实 `~/.ssh` 未动**：两次运行前后对 `os.userInfo().homedir + '/.ssh'` 做 lstat 元数据快照（相对路径|mode|size|mtimeMs|ctimeMs|ino，不读内容），相等。
   - **④ 收尾归零**：`stop()` 后 `/proc/*/cmdline` 没有含夹具目录的进程；sshd 端口 connect 只认 `ECONNREFUSED`（照抄 ssh-host.test.ts `portRefused`）。
2. 变异各红一格（贴原样输出，改完还原，不提交）：
   - M1：ssh patch 去掉 `subprocess`、`sandbox` 两条 `disabled` 并删 `subprocess-ssh`、`sandbox-ssh` 两条 insert（bash 回到本机）→ ① 红（mark 不符）。
   - M2：去掉 `fs-sandbox` 的 `disabled` 并删 `fs-ssh` insert（文件回到本机）→ ② 红（`after-cut-write.txt` 出现）。
   - M3：子进程 env 里加 `PBOTS_SSH_MARK=<本轮 mark>` 且做 M1 → ① 的 env 断言红（证明 env 断言守住了 marker 证明）。
3. `/tmp/dsh-ssh-*` 无新增：`ls -d /tmp/dsh-ssh-* 2>/dev/null | sort | comm -13 $T/dsh-ssh.before -` → 空。
4. 无遗留进程：独立 shell 执行 `pgrep -af 'bot-T4' | grep -v pgrep` → 空。
5. 改动面：`git diff --stat <起点>..HEAD` 只含 `app/sdk/tests/support/ssh-host.ts`、`app/sdk/tests/e2e/ssh-headless.test.ts`。
6. 覆盖率：不改 `src/`，不适用。

## 为什么这样验收
要保住的是「**模型的工具调用**真的跑在 ssh 那头，断了也不会偷偷在本机执行」。同机同文件系统下，「文件写出来了」什么也证明不了，所以：bash 走 sshd 会话独有的随机 marker（并断言宿主进程 env 里没有它，堵住「本机进程也带 marker」的假阳性）；write 走断连差分（ssh 断了还能写出来 = 回落本机）；宿主 cwd 单独放一个空目录抓「相对路径落到宿主 cwd」。三个变异保证这些格子在被测性质不成立时真的会红，而不是恒绿。②要求 bash 在 kill 后 15s 内出错，是为了排除「其实没断，只是 sleep 跑完了」。PTC 与 session-title 必须禁，前者是另一条本机执行路，后者会吃掉 replay 调用让断言错位。

## 风险
- **cordis 双实例**：ssh 插件按 file URL 从 `app/sdk/node_modules` 装进 dsh 进程，若其 peer（cordis、dsh-sandbox-policy 等）解析到与 dsh 内部不同的实例，服务注入会失败。按边界第 6 条停下。
- headless 正常退出时 dsh 是否 dispose ssh 连接（删 `/tmp/dsh-ssh-*`）未实测；不 dispose 就是真发现，停下记录，不加启动期清扫（PLAN §3 第 10 条已裁不扫）。
- base 里其他可能直接碰宿主的消费者（`shell-env`、`tool-fs-search`、`attachment-local`、`spill-local`、`agent-instructions`、`skill-filesystem` 等）不在本单修，但请在回执存疑项列出「哪些行在 ssh 模式下仍读写宿主」（读包 README / 源码 grep `node:fs`、`child_process`），作为 T5 输入。
- 机器在跑 GPU 训练：load > 20 时等一等再跑；本单只两个 e2e 文件。

## 产出
- 修改：`app/sdk/tests/support/ssh-host.ts`
- 新建：`app/sdk/tests/e2e/ssh-headless.test.ts`
- 回执：`work/tickets/receipts/T4.md`（含先红输出、M1–M3 输出、② 里 (1)(2) 的实际形态、宿主直连消费者清单）
