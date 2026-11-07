# T17：产品启动器 `app/launcher/hivebot`（一条命令拉起 SDK + Electron，退出无残留）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：`work/product-launcher/DESIGN-launcher.md` §2–§3（用户目标：本机日常使用；当前唯一阻塞 = 没有生产启动入口）
> 分支 / 作业目录：feat/T17 @ /tmp/bot-wt/T17
> claimed：2026-11-06 23:5x main (GLM 5.3) @ 集成分支（bash 脚本，无新依赖）
> accepted：

## 目标
一条命令 `app/launcher/hivebot` 拉起全链：SDK（`start.ts` 默认 patch 链、真实 provider）→ 等 ready → 带 `PBOTS_DSH_HANDOFF` 起 Electron；关窗口即全部退出、无残留进程和 handoff 目录；双开聚焦已有窗口；凭证只进 SDK 进程。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（尤其 2026-11-06 T9ab「launcher 的 dsh 是 detached」、T9ac「孤儿≠ppid 1，先收 pid 集合」两条）
2. `work/product-launcher/DESIGN-launcher.md` §2 全文——路径表、流程 0–7、凭证规则照它实现，偏离要在回执写理由
3. `app/sdk/src/start.ts:61-136`（env 约定、validateStart）、`:932-1012`（main：锁、dsh pid 行、信号转发、ready）
4. `app/sdk/profile/plugins/handoff.mjs`（ready 行在两个文件写完之后）
5. `app/ui/main/index.ts:180-221, 304-307`（单实例锁、handoff 读取、window-all-closed→quit）
6. 现成测试件：`app/ui/tests/support/{creds.ts,sdk-env.ts,tmp-sweep.ts,ui.ts}`、`tests/e2e/journeys/d1-real-model.spec.ts`（真模型旅程写法）、`tests/e2e/shell/single-instance.spec.ts`

## 边界
1. 只动：新建 `app/launcher/hivebot`（bash，可执行位）、新建 `app/ui/tests/e2e/launcher.spec.ts`；如需 pid 树 helper 可新建 `app/ui/tests/support/proc.ts`。**不改** `app/sdk/**`、`app/ui/main/**`、任何 patch 文件、其他测试。超出就停下写进回执存疑项。
2. **启动器不加任何 `--patch` / `P2SDK_PATCH`**（不叠 orchestration.yml / presets.yml——P6-14b 开闸未过，叠了就是绕闸）。用户环境里已有的 `P2SDK_*` 原样透传给 SDK（测试靠它传 `P2SDK_PROVIDER=mock`）。
3. 先写失败测试：先提交 `launcher.spec.ts`（启动器文件不存在）跑一次看 ①–⑥ 全红，贴输出；再写脚本。
4. 进程：不用 pkill / killall / 进程组负数 pid；只杀自己记下的 pid（dsh pid 杀前核 `/proc/N/cmdline` 含 dsh `bin.js`）。施工中清残留用 `~/bot/scripts/bot-reap <PID>`。
5. 测试走隔离 HOME / XDG_* / TMPDIR（`tmkdir('bot-T17-…')`），e2e 经 `scripts/run-e2e.sh`（Xvfb + 死 DBus），不弹真实桌面。与 T11 的 sdk e2e、T7bd 的 ui e2e 错开，同一时刻一套。
6. 凭证不进代码、文档、日志、命令行参数；测试里 key 只在内存里用来做「日志不含 key」的比对，不打印。
7. 只在 feat/T17 提交；合并等经理验收。

## 验收（写命令，不写感觉）
前置（作业目录内）：`pnpm --config.verify-deps-before-run=false -C app/sdk setup`、`pnpm --config.verify-deps-before-run=false -C app/ui setup`、`pnpm --config.verify-deps-before-run=false -C app/ui build`。本机 LiteLLM（127.0.0.1:4001）在跑，key 在 env `LITELLM_MASTER_KEY` 或 `app/ui/.env`。

1. `bash -n app/launcher/hivebot && test -x app/launcher/hivebot` → exit 0
2. `cd app/ui && pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/launcher.spec.ts` → **6 passed**，格子：
   - **①** mock 生命周期（`P2SDK_PROVIDER=mock`）：spawn 启动器（`--disable-gpu --remote-debugging-port=<空闲端口>`）→ `chromium.connectOverCDP` → `waitProductReady` → 关窗前收启动器后代 pid 集合，断言非空且含 electron 主进程、`start.mjs`、dsh `bin.js` 三类 → `page.close()` → 启动器 ≤30s 退出且码 0 → 集合内 pid 全不在 → 本次 handoff 目录已删、`$TMPDIR` 下无 `p2sdk-handoff-*` → `$XDG_STATE_HOME/hivebot/logs/{sdk,ui}.log` 存在、`$XDG_STATE_HOME/hivebot/dsh` 存在（不是 `app/sdk/.dsh`）
   - **②** 双开：① 同款第一实例 ready 后，同 env 再起一个启动器 → ≤20s 退出码 0；期间没有第二个 `start.mjs` 进程（按第一实例启动前后的进程差集）；第一实例页面仍能 `session/list` 成功；收尾同 ① 无残留
   - **③** 拒启动两种：(a) 无任何 key、无 env 文件、real 模式 → ≤20s 退出码≠0、stderr 含 `P2SDK_LLM_API_KEY`、本次运行没有 electron 进程出现（`ui.log` 未生成）、handoff 已删；(b) env 文件含 key 但 mode 0644 → 退出码≠0、stderr 含 `chmod 600`、`sdk.log` 未生成
   - **④** SIGTERM：① 同款 ready 后 `kill -TERM <启动器 pid>` → ≤30s 退出，pid 集合全不在、handoff 已删
   - **⑤** 凭证不外泄（与 ⑥ 同一次运行）：key 写进隔离 `$XDG_CONFIG_HOME/hivebot/env`（0600），**不**经 env 传；electron 主进程 `/proc/<pid>/environ` 不含五个键名（`P2SDK_LLM_API_KEY LITELLM_MASTER_KEY DEEPSEEK_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY`，只比键名）；`start.mjs` 进程 environ 有 `P2SDK_LLM_API_KEY` 键名（正对照）且 `P2SDK_SANDBOX_MASK` 值含 `$XDG_CONFIG_HOME/hivebot`；退出后 `sdk.log`、`ui.log` 全文不含 key 值
   - **⑥** 真模型一轮：real 模式、**不叠 presets.yml** → `createBots(page, [{ title: 'Real-L' }])`（不传 preset = 默认 standard）→ `openBot` → `send` 一句中文 → 流式行出现 → 定稿非空 → `turnEnded` 为 true、`chunkCount ≥ 2` → 关窗 → 无残留（同 ①）
3. 变异（各改一处、跑对应格、贴原样输出、还原）：
   - M1 删收尾里「TERM SDK」那一步 → ① 或 ④ 红（残留）
   - M2 删 Electron 那行的 `env -u …` → ⑤ 红
   - M3 删 flock 分支（拿不到锁也照常起 SDK）→ ② 红
   - M4 删 env 文件权限检查 → ③(b) 红
4. 跑后 `pgrep -af 'bot-T17-'` 无输出（施工期残留先 bot-reap 再跑这条）
5. 回执 `work/tickets/receipts/T17.md`：贴 1–4 原样输出（尾部即可）；写明 ⑥ 用的模型名与耗时；列「与 DESIGN §2 的偏离」（没有就写无）

## 为什么这样验收
- 用户要的是「能天天用」：⑥ 是唯一证明「生产默认链 + 默认 preset + 真模型」完整一轮可用的证据——现有真模型 e2e 都叠了 presets.yml 夹具，默认链从没被这样跑过。⑥ 若因默认 preset 本身红，不准在启动器里补 patch，写进回执存疑项交经理开单。
- 退出无残留是日常使用的底线：dsh 是 detached 的，launcher 退不代表 dsh 退。所以按 pid 集合（关窗前收、先断言非空）判，不按 ppid==1 或进程名计数。
- 「退出」用关窗口，不用 playwright 的 `app.close()`：要验的是用户真实的退出路径（window-all-closed → quit → 启动器收 SDK）。
- ⑤ 带正对照（SDK 侧确实有 key 键名），否则「Electron 侧没有 key」可能只是 key 根本没传进来。
- 变异 M1–M4 保证每格真咬住它声称保护的那一行。

## 产出
- `app/launcher/hivebot`（脚本头注释写清用法、env 文件格式、路径表——不另写 README）
- `app/ui/tests/e2e/launcher.spec.ts`（+ 可选 `app/ui/tests/support/proc.ts`）
- `work/tickets/receipts/T17.md`
