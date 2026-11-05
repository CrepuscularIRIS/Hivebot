# VERIFY P6-25.f1 · 文件工具工作区判定下沉到执行时

verdict: FAIL（只差文档：所有行为验收项都通过；唯一的 [FIX] 是 fs-zone.mjs 文件头，一处编辑就能改完）
commit: a6e5b8f8a4373473136f5b64069c8b17ecd6ba7a（worktree /tmp/bot-wt/P6-25f1，分支 feat/P6-25f1，基点 main@be37484，工作树干净）
验收人：verifier（Opus 5.5）。临时 HOME 用 /tmp/bot-p625f1-vfy*，假凭证目录建在临时 HOME 里，没有读真实凭证。所有探针都是确定性接缝，没有用竞态循环。
证据目录：work/p6-orchestration/evidence/P6-25f1-vfy/

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | REVIEW-B 确定性测试在新后端下全部拒绝 | PASS | 我独立改写了 REVIEW-B 的 toctou.test.mjs（不是 builder 的 fs-zone.test.ts），改写内容：后端换成 ZoneCheckedFileSystem，tools/execute 改为真实的链式 waterfall。结果：Q1 write 拒，区外无文件；Q1 read→edit 先正常读建立观察，edit 时换链，被拒，区外内容不变；Q1 read 拒且无内容；Q2 无缓存时 deny；旁支 read 换链到任意区外目录被拒；两条对照照常。`toctou-f1.test.mjs` / `toctou-f1.out.txt`，11/11 通过。builder 的 `tests/unit/fs-zone.test.ts` 与 policy.test.ts 共 85/85 通过（`unit-fszone-policy.txt`）。fs-zone.test.ts 一一覆盖了 toctou 的 6 格 |
| 2 | 凭证目录：判定后换链到临时 HOME 里的假凭证目录，读写都拒 | PASS | 单元层（pre 接缝）：read 被拒，原因为 never-root，没有读出 FAKE-CRED-MARKER；write 被拒，凭证目录里无新文件；先读后 edit 也被拒，内容不变（`toctou-f1.out.txt` 格 8）。真 Loader 层：builder 的 e2e「P6-25.f1 真 Loader」用 4 次换链实测，包括假 ~/.ssh 的读和写，全部拒绝（`write-outside-verbose.txt`） |
| 3 | C1：档位表不可用时，工作区外写直接拒、不出卡 | PASS | 真实 runtime，用 P2SDK_PATCH 把 write 的档位改坏（REVIEW-C 的同一构造）：区外写 0 张卡，返回 `write-outside-workspace denied`，宿主上没有文件；对照组区内写照旧出 `tier table unavailable` 回退卡，批准后落在区内；stderr 里有 tier invalid（`c1-e2e.json`）。修复前同一构造会出卡，批准后写到宿主 /tmp（REVIEW-C corrupt-tiers.out.txt） |
| 4 | 不误伤：区内读写照常；Q-013 区外读出卡、获批后可读；write-outside 7/7 不回退 | PASS | write-outside.test.ts 8/8：①–⑦ 加 f1 新格。② 的区外 read 出卡 1 次，allowed-once 之后读到，edit 被硬拒（`write-outside-verbose.txt`）。补测真 Loader 区内 glob、grep、read→edit：0 卡，全部成功（`noharm.json`）。单元层「区外读获批后照常读到」也通过 |
| 5 | 真接线：真 Loader 会话里文件工具确实走新后端 | PASS | 自写的探针插件 vfy-seam 由 Loader insert 加载：ctx.fs 的 constructor 为 `ZoneCheckedFileSystem`，instanceof 为 true；4 次调用的 exec 上都能取到 shell-ask 的判定记录（`allInside:true`），说明 exec 是同一引用。接缝插在区域包装之后（inner）时，区外和假凭证的 write 由后端 checkedTarget 拒绝（宿主 /tmp 本在上游 fence 可写根内，所以只可能是 zoneGuard 拒的），0 卡，没有落盘（`loader-e2e.json`）。两层都在真会话里生效 |
| 6 | 残余窗口评估 | 已评估，见下节（建议：本任务不阻塞；改正 ponytail 注释，另立跟进任务） | `toctou-f1.out.txt` 残余格 10/11、`loader-e2e.json` rows 2/3、`ptc-actor.json` |
| 7 | 回归 + 第 2 级搬运 + 文件头来源 | 部分 FAIL | 回归：按 builder 的同一条命令复跑（unit + guard-fs/escalation/plugin-manager/approval/write-outside/tiers-policy/w1ap0-matrix），**31 files / 518 tests 通过，exit 0，499s**（`regress.log`）。第 2 级：`class ZoneCheckedFileSystem extends SandboxedFileSystem`，探针里 instanceof SandboxedFileSystem 断言通过；只覆写 checkedTarget，存储实现全部沿用上游，没有新增依赖。**文件头没有写 `来源: <url>@<sha>:<path>`**，只有 commit 正文写了；另外 ponytail 注释对上限的描述与实测不符，见 [FIX] |

额外的坏路径：判定之后再换链，分三个位置测（pre / inner / lock），结果见第 6 节。

## 6. 残余窗口评估（读实现 + 确定性接缝实测）

- **写侧**：checkedTarget 中的 fresh realpath 和 zoneGuard 判定 → `withLock(targetKey)`（同一路径的 FIFO 队列）→ probe → readTextForDiff → writeFileAtomic：先 `mkdir(dirname)`，再建 staging 目录，再 open、fsync、rename。全程使用的是 targetKey 字符串，祖先目录如果被换成链接会被跟随。在 staging 建好之前换链都有效。窗口通常是微秒到毫秒级，但**模型可以先对同一路径排一个大写入来拉长锁队列**。我在 lock 接缝（checkedTarget 返回后）换链，新文件落到了区外，也落进了假 `.ssh`（`residual-write-* landed=true`）。这就是上游 fs-sandbox 头注里已接受的那个窗口。
- **读侧**：tools/execute 包装层做一次 realpath 判定 → next() → tool-fs 的 read **自己再 resolve 一次**。两次解析的结果互不比对，读侧也没有第二层。窗口从包装层判定开始，到 tool 的 open 结束。inner 接缝在真 Loader 中实测：区外文件和假凭证内容都**0 卡读出**（`loader-e2e.json` rows 2/3）。上游对读本来就不设防，所以源码注释「fresh resolve 到 syscall 的残余窗口，上游同样接受」用在读侧并不准确。
- **赢得竞态的后果**：读：本用户可读的任意宿主文件，包括 NEVER 根。写：在本用户可写的任意位置创建文件，包括 NEVER 根。两种情况都 0 卡。
- **并发行动方是否可得**：standard preset 下需要 bash 或后台 job，门未 provision 时要先经过一张审批卡。**ptc preset 的 run_code 默认 allow，不出卡**：实测在工作区内 rename 加 symlink 一次成功，宿主看到的链接目标就是脚本写的字符串 `/tmp/bot-p625f1-vfy-out`（`ptc-actor.json`，0 卡）。worker 是独立进程，和宿主的文件工具真正并发。ptc 可以在 UI 里选到：main 的 `agentPresets/list` 只过滤掉 p2temp-*。所以在 ptc 会话里，这个竞态无需任何审批就能由模型反复发起。成功率是概率性的；按 LEARNINGS 规则没有跑循环实测。
- **彻底关闭的做法**：O_NOFOLLOW 只管路径的最后一级，不够。逐级 openat 在 Node 里没有原生 API，Linux 上可以用 `/proc/self/fd/<dirfd>/<name>` 模拟，但那等于重写 fs-local 的读取和原子写，属于第 5 级自建，不在第 2 级范围内。
- **建议（明确）**：
  1. **本任务不阻塞。** PLAN 要求关闭的 B1/B2 窗口已在两层关闭，真 Loader 实测有效；这个窗口覆盖判定到执行的整段，ASK 门关闭时还覆盖整个审批等待期，是确定性可达的。剩下的是上游已接受的微窗口。
  2. **ponytail 注释必须改成实话**（见 [FIX]）。
  3. **另立跟进任务，建议 major，因为 ptc 可达，且 run_code 是无卡的并发行动方**。首选内核级方案：让文件工具的 I/O 跑在 bash 使用的同一个 bwrap mount namespace 里，宿主 /tmp 和 NEVER 根不可见，链接就指不出去。这是 REVIEW-B 的方案 3，可以和 P6 PLAN §12.7 一起做。过渡期可以先把读侧判定移进后端的 readText/readBytes/streamText/listDir（用 AsyncLocalStorage 承接包装层的判定记录），让读侧的窗口收窄到和写侧同级；收益有限，可选。

## 新问题
- [FIX] `fs-zone.mjs` 文件头缺 `来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:packages/fs/fs-sandbox/src/index.ts`（目前只在 commit 正文里）。ponytail 注释低估了上限：应写明 ①读侧是包装层判定之后 tool 再 resolve 一次，身份没有绑定，并不是「上游同样接受」；②赢得竞态可以读或写本用户可达的任意路径，包括 NEVER 根；③ptc 的 run_code 是无卡并发行动方；④升级路径是 bwrap namespace 内执行，不是自建 openat | 复现：`head -8 app/sdk/src/policy/fs-zone.mjs`；`evidence/P6-25f1-vfy/loader-e2e.json` rows 2/3 | 位置：app/sdk/src/policy/fs-zone.mjs:1-6 | minor（只改文档）
- [FIX]（跟进任务，不阻塞本任务）判定到 syscall 的残余竞态窗口：读写都能触及任意宿主路径，ptc 会话可以无卡驱动 | 复现：`toctou-f1.test.mjs` 残余格 10/11 的确定性接缝；`ptc-actor.json` | 位置：app/sdk/src/policy/fs-zone.mjs 与上游 dsh-fs-local writeFileAtomic；方案见第 6 节 | major
- [FIX]（minor，跟进）后端层拒绝时，tool-fs 把 FS_SANDBOX_DENIED 映射成通用的 `[sandbox: file access denied…]` 加「escalation available」提示，丢失了 p2sdk 的原因串，还诱导模型去申请升权。升权后 danger-full-access 仍会被 zoneGuard 拒，只多出一张无用的卡，不造成越权 | 复现：`loader-e2e.json` rows 0/1 | 位置：dsh-tool-fs lib/index.js:1177 mapError（上游）；可以在 fs-zone 抛出前另行处理 | minor
- 观察（不是缺陷）：guard-fs / w1ap0 的 stock 差分里去掉了真实 /etc/ppp/chap-secrets 的 stock 读写和 SHA，guard 拒绝格保留。为了不触碰真实凭证，接受这一覆盖面的缩减。

清理：自建的 /tmp/bot-p625f1-vfy*（含 -dsh-*、-out）已删除；`scripts/bot-reap --dry-run --match p625f1` 无输出（`evidence/P6-25f1-vfy/reap.txt`）；没有改动产品代码，worktree 仍然干净，HEAD 未变。
