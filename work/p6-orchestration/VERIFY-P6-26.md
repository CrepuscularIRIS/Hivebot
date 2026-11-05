verdict: FAIL
commit: b2fce24e799406939fddf49463622f9365217f93   # feat/P6-26，基点 main@75267c6；head 变了这份证据作废

验收员：verifier（Opus 5.5），2026-11-05 05:10–05:30。证据目录 `work/p6-orchestration/evidence/P6-26-vfy/`。
做法：另起两个 detached worktree（base=75267c6、head=b2fce24，node_modules 软链到 builder 树，只读），用**自己的接缝**差分跑，不改 builder 树（结束时 `git status` 干净、HEAD 未变）。全程 HOME=/tmp/bot-p626v-home，假凭证只在 /tmp/bot-p626v-*/home/.ssh。

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 正对照 → 修复（独立接缝） | PASS | `seam-out.txt`。接缝和 builder 的不一样：S1 在 tools/execute 的 next() 里、工具 resolve 之后换链；S2 用上游自带的 `internals.inspectReadBytesAfterStat`（上游 stat 之后、上游按路径打开之前）。base：readText/readBytes/streamText/listDir/stat 五种全部读出区外 `OUTSIDE-MARKER`，S2 读出区外 `OOOOO`。head：S1 五种都返回 `FS_PERMISSION_DENIED read-outside-workspace`；S2 读到的是已打开的区内对象（len=300000 `bbbbb`），不是区外内容 |
| 2 | 身份绑定是否闭合 | PASS | 代码：`openReadTarget` 执行 `open(fresh.targetKey)` → `readlink('/proc/self/fd/N')` → 拿 actual 判 NEVER、工作区和审批 → 把 `targetKey: /proc/self/fd/N` 交给上游。strace 实证见 `strace-window.txt`：`openat(".../ws/sub/a.txt", O_RDONLY\|O_NONBLOCK)=20` → `readlink("/proc/self/fd/20")` → `statx("/proc/self/fd/20")` → `openat("/proc/self/fd/20")=21`。fd 20 之后**没有第二次按路径字符串打开**。上游 readFile、createReadStream、readdir 用的都是 targetKey（fs-local lib/index.js:384/404/436/466/312） |
| 3 | 假凭证目录 | PASS | S5（换链发生在工具 resolve 之前或之后）：base 两格都读出 `FAKE-CRED-P626V`；head 两格都返回 `never-root denied at execution time`。真实凭证没碰 |
| 4a | 区内读、内部读不误伤 | PASS | N1 区内 readText、N2 列工作区根、N3 无 scope 的内部读区外、N4 stat 缺失文件返回 undefined，head 上都和 base 一致 |
| 4b | 已批准区外读的精确匹配 | PASS | S4a 批准 A 后读 A 成功；S4b 用软链写法批准，按 realpath 匹配，成功；S4c 批准 A 之后把 A 的父目录换链到 B：base 读出 `SWAPPED-OTHER-OUTSIDE`，head 拒绝；S4d 审批快照是 B、读的是 C：base 读出 C，head 拒绝。shell-ask 存的是 `resolveTargets` 返回的 realpath targetKey，两条分支都存（正常分支 :363，tiers 损坏回退分支 :321-324） |
| 4c | stream 中途 abort 后 fd 关闭 | PASS | S7：base=22，中途 24，abort 后不再调用 next，fd 回到 22 |
| 4d | 1000 次混合读，fd 不涨（复跑） | PASS | S6 每 8 种一轮循环（readText、超限 readBytes、listDir、区外拒绝、缺失文件、stream break、stream abort、stat+readByteRange），fd 22→22。builder 的同名用例在回归里也是绿的 |
| **4e** | **工作区根是别名（软链写法）时不误伤** | **FAIL** | 单元接缝 N5：base 读出 `INSIDE-OK`，head 返回 `read-outside-workspace denied`。**真 Loader e2e**（`vfy-alias.tail.ts` 接在 write-outside 的 harness 头部之后）：会话 `cwd` 设成指向 WS 的软链，区内 read（别名路径或真实路径都试了）和 present 三格在 head 上全部硬拒，0 卡（`alias-P6-26v-head.log`）；同一个文件在 base 上 1 passed（`alias-P6-26v-base.log`）。cwd 用真实路径时 head 正常。见 [FIX]-1 |
| 5 | 日志与模型文本里没有 `/proc/self/fd/N` | PASS | seam 的所有结果和 1000 次循环的 500 条错误消息里命中 0 次；回归日志命中 0 次；本轮和 builder 各次 e2e 留下的 runtime home（10 个 P2SDK_HOME，共 274 个文件，包括会话 jsonl）grep 命中 0 次 |
| 6 | glob/grep 移交 P6-27 的说明属实 | PASS | 已装 lib：`dsh-tool-fs-search/lib/index.js:166-187` 的 runRipgrep 直接同步调用 `ctx.subprocess.spawn`，注释原文是 "The spawn is unconfined"；apply（:1254 起）的配置只有 caps 和 timeout，没有 spawn、provider、confine 的注入点。参考仓 `repos/deepseek-harness@ce7073d` 里 `search-core.ts:222` 和 `sandbox/src/index.ts:192`（`abstract confine(...): Promise<ConfinedArgv>`）与报告引用一致。不能在本层插接缝的理由成立：同步句柄和异步 confine 对不上，绕过只能全局替换 subprocess。报告里也没有说已经关闭搜索窗口 |
| 7 | 回归 | PASS | 和报告 A 的范围相同（unit + guard-fs/escalation/plugin-manager + approval + write-outside + tiers-policy + w1ap0-matrix）：`Test Files 32 passed, Tests 539 passed, exit=0`（`regression.log`）。builder 报的是 536，多出的 3 条是报告 C 段说的「A 之后补强」的用例，数目吻合 |
| 8 | 合并提示（shell-ask.mjs） | 信息 | 本分支对 shell-ask.mjs 只改两处：**@@ -321 +321,4**（tiers 损坏回退分支：`noteZoneVerdict` 前先 `resolveTargets`，记下 `targets`），**@@ -360 +363**（正常分支：`noteZoneVerdict` 加 `targets: [...targets]`），见 `shell-ask.P6-26.diff`。P6-26t 工作树（未提交快照）只改 **@@ -259 +259,8**，两边 hunk 不重叠。以 75267c6 为基点试做 `git merge-file`：0 冲突，`node --check` 通过（`shell-ask.trial-merge-with-P6-26t.mjs`）。合并时仍按 SKILL §7.3 三方合并，不能整文件 checkout |

新问题：
- [FIX] 读侧 fd 核对只按字面前缀比较 `scope.workspaceRoot`。会话 cwd（header.cwd，上游 `resolveWorkspaceRoot` 不做 canonical，sandbox-policy lib:68-71）只要经过软链或别名，**所有区内 read/read_image/present/listDir 都会被硬拒**，0 卡也没有提示，属于 P6-25.f1 之前没有的回归。写侧 `zoneGuard` 用了 `canonicalPath(policy.workspaceRoot)`，读侧没有对齐。NEVER 根同样只做字面比较：调用方传入的是 canonical，暂时不出问题，但应该一起处理 | 复现：`symlinkSync(WS, alias)`，`session/create {cwd: alias}` 后 read WS 内文件 → `read-outside-workspace denied`（`evidence/P6-26-vfy/vfy-alias.tail.ts`，接在 write-outside.test.ts 前 240 行之后跑） | 疑似位置：`app/sdk/src/policy/fs-zone.mjs` 的 `openReadTarget` 里 `under(scope.workspaceRoot)`（建议在 applyZoneRecheck 放进 scope 之前先做 realpath / `canonicalPath`，失败按 fail-closed 处理；回归格用别名 cwd） | major（fail-closed，没有安全暴露，但功能回归）
- [FIX] 模型读一个缺失文件时，提示从上游的 `cannot read "X": not found` 变成了 `cannot read "X": file access failed`。code 仍是 FS_NOT_FOUND，模型拿到的语义变弱了 | 复现：seam S6 的 sampleErr 里，base 是 "not found"，head 是 "file access failed" | 疑似位置：`fs-zone.mjs` 的 `readError`，ENOENT/ENOTDIR 时应保留 "not found" 措辞 | minor
- （既有问题，不计入本任务）write-outside.test.ts 的 `launchWo` 用 `mkdtempSync('bot-p626-dsh-')` 建的 P2SDK_HOME 没有交给 trackTmpDir，每跑一次在 /tmp 留 4 个目录。本轮我自己留下的已删除，builder 05:09 的 4 个还在。P6-25 时就是这个写法 | minor

清理：两个 detached worktree 已 `git worktree remove`；自己建的 /tmp/bot-p626v-* 和 05:17/05:19 的 P2SDK_HOME 已删除；`bot-reap --dry-run --match p626` 输出为空，P6-26t 的进程没动（本轮只结束了 vitest 自己 spawn 的 runtime）。
