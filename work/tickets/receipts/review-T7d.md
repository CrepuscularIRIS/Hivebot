# Review · T7d

Sol 审查（主 agent 转述，原报告未入仓）：**高1** 旧工作区缺根 isdir 跳过 → bash `mkdir && echo >` 一条命令绕过（restore.ts:30-36 只恢复 preset 不补根）——CONFIRMED；**中1** 退出码断言未按 callId 去重、isError 不严谨——CONFIRMED；workspace.mjs 两目录 mkdir 失败即 ensure 失败——REFUTED（fail-closed 认可）。修复提交 7e205f91。

## T7d 终验（经理 Opus 5.5，任务 B，2026-11-07 20:5x，HEAD 7e205f91）

**结论：不通过（第 1 次）→ 修复单 `open/T7db-skill-root-parent-rename.md`。** 已修部分全部核实成立，但 skill 根还有一条一行命令的绕过，正好违反 queue 7e 行写明的不变量「挂载点不可 rename/rm」。

### 1. 重跑验收（uptime load 5.2；隔离 TMPDIR、DBus 指向不存在路径）
| 命令 | 回执 | 实跑 |
|---|---|---|
| approval.test.ts | 6 passed | **6 passed** |
| sandbox-wrapper.test.ts | 14 passed | **14 passed** |
| write-outside + tiers-policy + guard-fs + skill-write-card | 34 passed | **34 passed** |

变异刀（跑完都 `git checkout` 还原，worktree 干净）：
- 刀1 删派生 ro-bind（`out += [...]`→`pass`）→ T7d 用例红：`批准后 .dsh/skills 仍写不进（ro-bind）: expected true to be false` ✓
- 刀2 恢复旧的 `if isdir` 跳过（撤 fail-closed）→ 红：`旧工作区 mkdir+写一条命令也写不进: expected true to be false` ✓——legacy 场景确实咬住高1。

### 2. 改动范围
e92ef98c + 076e753e..HEAD 只动 bwrap-wrap.py / orchestrate.ts / workspace.mjs / 三个测试文件（含新夹具 approval-legacy-ws.ts）/ 回执 / 工单头，在边界内。start.ts 没动：方案改成从 binds 派生，不再加 `--ro-skill-root` 参数。不用多一个参数，这样更省，**认可这个偏离**（验收 3「参数解析分支」由派生段的 dry-run 断言代替）。

### 3. Sol 意见核实
- **高1 已修，成立**：bwrap-wrap.py:360-365 缺根时真跑 `os.makedirs` 后挂 ro，dry-run 判环境变量不落盘（:363），刀2 证明 e2e 能抓到。
- **中1 已修，成立**：approval.test.ts 按 toolCallId 建 Map，取最终结果，再按 `Read-only file system` 过滤，要求 =2。isError 不当契约，靠「文件不存在」加「只读诊断」两样证据，可以接受。
- **workspace.mjs REFUTED，同意**：p2sdkRun 抛错就是 ensure 失败，方向是收紧。
- **宿主侧落盘先例**：真跑也写 resolv.conf、消耗 permit，dry-run 都不做，makedirs 同样规矩，没破约定。夹具只建 cwd、不建根，就是旧工作区的样子，合理。

### 4. 新发现（不通过的原因）
- **[HIGH · 已复现] 改名父目录绕过**：只有 `.dsh/skills` 本身是挂载点，`.dsh` 不是。bwrap 直测（同样的挂载序：ws `--bind` 加两根 `--ro-bind`）：
  ```
  mkdir .dsh/skills/x            → Read-only file system   direct=1
  mv .dsh .dsh_old               → mv=0
  mkdir -p .dsh/skills/x && echo hi > .dsh/skills/x/SKILL.md → write=0
  mv .agents/skills .agents/s2   → Device or resource busy
  HOST: <ws>/.dsh/skills/x/SKILL.md 存在
  ```
  一条 bash 就能写进宿主的 skill 根，`.agents` 同理。威胁模型和本单 e2e 一样（allowed-once 批准一条看着无害的命令）。
  **已验证的修法**（探针）：ro-bind 两根之前，先把父目录对自身 `--bind <ws>/.dsh <ws>/.dsh`、`--bind <ws>/.agents <ws>/.agents`，让父目录也成为挂载点。实测 `mv .dsh` 和 `mv .agents` 都报 `Device or resource busy`，`rm -rf .dsh` 删不掉 skills，`.dsh/other.txt` 照样能写，`ln -s` 进 skills 报只读。
- **[MEDIUM] 宿主侧 makedirs 会跟随符号链接**：`os.path.isdir`/`makedirs` 会跟着 bot 早先种下的 `.dsh` 或 `.agents` 符号链接走，在宿主任意可写位置建 `skills` 空目录，然后 ro-bind 挂到链接目标。旧工作区以前 bash 不受限，有这种可能。要求父目录和根都满足 `realpath == 自身`，否则 `die()`（加 bwrap: 前缀，fail-closed）。
- **[LOW] makedirs 抛错时没有 `bwrap: ` 前缀**（头部约定「一切自身错误 stderr 打 bwrap: 前缀」）；比如根的位置是个普通文件时，会出 FileExistsError traceback。方向仍是收紧，顺手改成 die。
- **[LOW] 测试缺口**：wrapper 单测没断言「dry-run 后 bare 下两根不存在」（只有代码层面，没有测试证据）；describe 标题还写着「缺失则不追加」，和现在的行为矛盾。
- **[NOTE，不修] 上限**：binds 等于 workspaceRoot 加 additionalWritableRoots。现在 app 里没用到额外可写根（grep 为空），以后启用了 wrapper 会在每个额外根里建两个空目录。真要启用时再按根种类区分。

## T7db 终验（manager Opus 5.5 · 2026-11-07 · HEAD 920b840f）——**通过**（T7d + T7db 整链）

### 1. 重跑验收（隔离 HOME/TMPDIR，DBus 指空；load 2.85）
| 命令 | 回执/派发声明 | 本次 |
|---|---|---|
| approval.test.ts | 6 passed | **6 passed** |
| sandbox-wrapper.test.ts | 15 passed | **15 passed** |
| write-outside + tiers-policy + guard-fs + skill-write-card | 34 passed | **34 passed** |

变异刀（先 `git log -1 -- app/sdk/sandbox/bwrap-wrap.py` = 1c1e7b8a，确认 islink 前查在提交里；python 精确替换 + `assert count==1`，跑完 `git checkout --`，`git status` 干净）：
- **Vi** 删 islink 前查 → wrapper 红：`链接目标下没建 skills（makedirs 前已拒）: expected true to be false`，1 failed | 14 passed ✓
- **Vh** 删父目录自绑（只留 `--ro-bind root`）→ approval 红 `改名 .dsh 后仍写不进新根: expected true to be false` + wrapper 挂载序格红 ✓

### 2. 改动范围
7a47b9f4..HEAD 只动 bwrap-wrap.py / approval.test.ts / sandbox-wrapper.test.ts / T7db 工单头 / 回执，在 T7db 边界内；无删弱断言（链接格是加强：新增「已存在 outside/.dsh」真场景 + 悬空态两条）。

### 3. Sol 复审中1 核实——**已修，成立**
- bwrap-wrap.py:368-372 islink 前查在 makedirs（:373）之前，`os.path.islink` 对悬空/非悬空链接都为真，两态都在落盘前 die；:378-380 创建后复查（islink 或 realpath≠自身）。实现序正确。
- 真探针（非测试）：`outside/.dsh` 已存在、`ws/.dsh` 链过去 → `bwrap: symlink refused ...` rc=1，`outside/.dsh` 下 0 个条目。
- 链接 realpath 比较依赖 binds 是规范路径：已核 dsh-sandbox `workspaceWritableRoots` 用 `canonicalPath`=`realpathSync.native` 派生 `--bind` 根（dsh-sandbox lib/index.js:206-227，sandbox-local confine 再规范一次 :311），所以工作区经符号链接祖先的场景不会误杀。我手探「ws 本身走链接」确会 die，但生产路径到不了。

### 4. 裁定：dry-run 下 islink 前查照跑——**保留，合理**
dry-run 的约定是「只报形状、不产生副作用」（不 makedirs、不消耗 permit、不写 resolv.conf、fd 占位），不是「跳过一切检查」。前查是纯读、不落盘；同段之前的 `workspace contains HOME` die 也在 dry 下照跑。dry-run 对链接报错 = 如实预告真跑结果，比打印一个真跑根本到不了的 argv 更有用。后查在 dry 下跳过也对（没创建就没有「中途被换」可查）。探针：dry + 链接 → `bwrap: symlink refused` rc=1，目标下 0 条目；dry + 空 ws → argv 含 skills 两根、ws 下不落盘。

### 5. 回归抽查：.dsh 内非 skills 可写（Sol REFUTED，同意）
真跑 wrapper（非 dry）一条 bash：`.dsh/config.json` 覆写 OK、`touch .dsh/newfile` OK；`.dsh/skills/evil.md` → Read-only file system；`mv .dsh .dsh2` 拒；`rm -rf .agents` 后 `.agents/skills` 仍在；`.agents/skills/e.md` → Read-only。宿主侧 config.json=new、skills 下 0 条目。

### 6. 存留（不阻塞，写进 queue 当提议）
- **[LOW] TOCTOU**：前查→makedirs→bwrap 挂载之间，同工作区另一条并发沙箱 bash 可把 `.dsh` 换成链接；后查只兜到 makedirs 后，挂载时 bwrap 仍会跟随。窗口毫秒级、需要并发两条且第一条已获批；根治要 openat/O_NOFOLLOW 或 bwrap 侧拒链接，代价不值，等出现并发 bash 场景再议。
- **[NOTE] 红态提交**：fa59d8ec 只带测试、实现缺失（回执已如实记），分支上有一个不可 bisect 的点；`merge --no-ff` 保留历史，不重写。施工方以后刀/replace 后先 `git diff --stat` 再 commit（LEARNINGS 已有根治条）。
