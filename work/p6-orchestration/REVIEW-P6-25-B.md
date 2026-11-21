# REVIEW P6-25 · 方向 B（并发与状态一致性）

- 范围：`60e8b02..be37484`，产品代码 `app/sdk/src/policy/shell-ask.mjs`（审时 HEAD `be37484`）
- 上游：已装 dsh 0.2.2-alpha.2（参考仓 `repos/deepseek-harness@ce7073d`）
- 探针：`/tmp/vfy-r-p625-b/toctou.test.mjs`（副本 `work/p6-orchestration/evidence/P6-25-rvw/toctou.test.mjs`），输出 `evidence/P6-25-rvw/toctou.out.txt`（6/6 pass，断言的就是下面观察到的行为）
- 运行：`HOME=/tmp/vfy-r-p625-b/home node --test toctou.test.mjs`
- 做法：确定性接缝，不靠循环碰运气。真实组件有 shell-ask 的 pre-execute 判定、dsh-tool-fs 的 `write`/`edit`/`read` 的 execute、dsh-fs-sandbox `SandboxedFileSystem`（fence 二次校验，加上 fs-local 原子写）、fs-observation-policy。替身只有 ctx 外壳。在 `preExecute()` 返回放行之后、`tool.execute()` 调用之前插一个钩子：`rename ws/sub → ws/sub.orig`，再 `symlink ws/sub → <区外目录>`。
- 门状态：policyStatePaths 指向从未存在的文件，也就是 L-7 R6 的「从未 provision」，文件工具门开。这是当前生产默认态。

## 结论

CONFIRMED 2 条（major 1 条，范围外 major 1 条）。问题 2 的「判定缓存」REFUTED。

| # | severity | file:line | 触发条件 | 实际表现 | 证据 |
|---|---|---|---|---|---|
| B1 | major | `app/sdk/src/policy/shell-ask.mjs:328-343`（判定）；执行层 `dsh-tool-fs lib/index.js:606/610`（write）、`:750/758`（edit）；`dsh-fs-sandbox lib/index.js:153-165` checkedTarget；`dsh-sandbox lib/index.js:239-246` writableRoots | `write`/`edit` 的路径在 pre-execute 判定时位于工作区内。之后、execute 之前，路径上某一级工作区目录被换成指向区外的符号链接，且链接目标在宿主 `/tmp` 或 `os.tmpdir()` 之下 | shell-ask 放行。execute 按路径字符串重新 resolve，跟随了新链接。fence 的 checkedTarget 再 realpath 一次，但只对照 `writableRoots`（工作区 + 宿主 `/tmp` + `tmpdir()`），于是放行，文件落到区外。write 新文件成功：`result.path=…/outside/race.txt`，区内 `sub.orig/race.txt` 不存在。read+edit 两步各在判定后换链，区外已有文件被改写，`outside/victim.txt="PWNED\n"`，区内诱饵不变。P6-25 要堵的「无卡写宿主 /tmp」经时序窗口重新可达。影响面与 P6-25 原缺陷相同：限于宿主 /tmp 和 tmpdir，换到其他区外路径会被 fence 拒 | `toctou.test.mjs` 用例「Q1 write」「Q1 read+edit」；`toctou.out.txt` 行 `[Q1-write]` `[Q1-edit]` |
| B2 | major（范围外，P5-21 起存在，归口 P5/P6 policy） | `shell-ask.mjs:333-336`（workspace-read）；`dsh-tool-fs lib/index.js:192`（read 重新 resolve）；fs-sandbox 头注「Reads pass through untouched」 | 同一接缝，用在 `read`（以及同属 workspace-read 档的 glob/grep/present，但只测了 read）。判定后换链，链接目标是任意区外目录，不要求在 /tmp 下 | 无卡读到区外内容：读不经 fence，`readOut` 的 ASK 被绕过。探针把链接指向 `/home/lingxufeng/bot/app/sdk`，读回了真 `package.json` 第 2 行 `"name": "p2sdk",`，没读到区内诱饵 | 用例「旁支 read」；`toctou.out.txt` 行 `[side-read]` |

### 执行层有没有第二道校验（问题 1 后半）

- 有，但口径不同，所以没有关闭这个窗口。
  - `tool-fs` 在 execute 时用 `ctx.fs.resolve(input.filePath)` 重新解析（`lib/index.js:606/750`）。
  - `SandboxedFileSystem.checkedTarget` 写盘前再 realpath 一次，并且用 fresh target 去写（`:158/165`），这是上游设计的「checked identity = mutated identity」。
  - 但这道校验对照的是 fence 可写根（`writableRoots`），不是「本会话工作区」。宿主 `/tmp` 就是可写根，所以换到 /tmp 的写会通过。
- 上游自己承认在「fresh 重解析」和 rename 之间还有一个残余 TOCTOU 窗口，并接受了它（`fs-sandbox src/index.ts:15-18` "residual TOCTOU … accepted for this threat model"）。这是第二个更窄的窗口，本次没测。
- `fs-local` 的 `writeFileAtomic`（`dsh-fs-local lib/index.js:525-574`）对祖先目录不使用 `O_NOFOLLOW`：`mkdir -p dirname`、在目标目录建 staging、再 `rename`，全程按路径字符串跟随祖先链接。
- 要真的把 B1 跑起来，需要一个能与 file-tool 调用并发改工作区目录的行动方，例如先前启动的后台进程，或同轮的并行工具调用。工作区对 bash 是 rw bind，链接的目标字符串 `/tmp/x` 由宿主侧解析，指向的是宿主 /tmp。门关（ASK writeGate）时，这个窗口会覆盖整个人工审批等待期：用户批的是一张区内路径的卡，执行时路径已经指向区外。这一段没有在真实 runtime 里实测，本 review 只按要求跑了确定性接缝。

### 问题 2：判定结果有无缓存 → REFUTED

- shell-ask 每次调用都重跑 `resolveTargets` → `fs.resolve`（realpath），没有任何目标或结论缓存。进程内唯一的 latch `everProvisioned` 只管门状态，不管路径。fs-local 的 `resolve` 每次都 realpath（`lib/index.js:793-800`）；`locks` 是按 targetKey 的串行锁，不是缓存。
- 测试「Q2 无缓存」：第一次 `write sub/one.txt` 放行，并且确实写在区内。两次调用之间把 sub 换成区外链接。第二次 `write sub/two.txt` 被 deny，原因串为 `write-outside-workspace denied`，区外没有文件。用与第一次完全相同的参数再写一次，同样 deny。

### 对照（证明探针能区分）

- 不换链：文件写在 `ws/sub/a.txt`，即区内。
- 判定前就已经是区外链接：shell-ask deny，区外没有文件（即 P6-25 格④）。

## 修复建议（B1/B2 同根：判定在路径字符串上做，执行再解析一次）

1. **首选，小改动、能堵住影响面**：p2sdk 自带一个 fs 后端，继承 `SandboxedFileSystem`，覆写 `writeText`/`editText`。在执行时 fresh resolve 之后，用 `workspaceWritableRoots(policy)`（dsh-sandbox 已导出，不含 /tmp）再判一次「在本会话工作区内」，不在就抛 `FS_SANDBOX_DENIED`。读类同样覆写 `readText`/`stat`/列目录等入口，对 workspace-read 做执行时复判；区外读本应走 ASK，执行层查到区外时应当拒，不能静默读。这样换链后的 fresh target 一定在区外，于是被拒，B1/B2 的窗口在执行层关闭。剩下的只有上游已接受的「fresh 重解析 → rename」微窗，而且要第二次换链才能利用。
2. `O_NOFOLLOW` 只管最后一个路径分量，本例被换的是祖先目录 `sub`，用它不解决问题。要彻底关闭，需要从工作区根 dirfd 逐级 `openat(O_NOFOLLOW|O_DIRECTORY)`，再 `renameat`。Node 原生不提供，属于大改，暂不建议。
3. 内核级方案：让文件工具的变更和 bash 跑在同一个 bwrap mount namespace 里（宿主 /tmp 不可见），可以和 P6 PLAN §12.7 的「worker 交付路径」一起考虑。
4. 回归：把本探针的「Q1 write / Q1 read+edit / 旁支 read」三格改写进 `app/sdk/tests/unit/`，断言改成「区外文件不存在 / 内容不变 / 读被拒」。修复前它们应当是红的。

## 验证清单

- [x] P6-25 diff 只改了 shell-ask 的 3 处返回值（:326、:342，加原因串），没有引入新的状态或缓存
- [x] 确定性接缝 write 新文件：CONFIRMED（B1）
- [x] 确定性接缝 read→edit 已有区外文件，含真实 observation-policy 记账：CONFIRMED（B1）
- [x] 执行层二次校验代码阅读：有，但口径是 fence 可写根，不是工作区
- [x] 判定缓存：REFUTED
- [x] 旁支 read 到非 /tmp 区外目录：CONFIRMED（B2，范围外）
- [ ] 未测：guard.mjs 的 NEVER（凭证路径）判定同在 pre-execute，属于同一接缝。为不读凭证路径，本次没有探测，建议立任务用假凭证 HOME 验证
- [ ] 未测：真实 runtime 中模型能否获得并发行动方（后台进程或并行工具调用）
- 清理：探针不 spawn 子进程；`bot-reap --dry-run --match vfy-r-p625-b` 结果见回报
