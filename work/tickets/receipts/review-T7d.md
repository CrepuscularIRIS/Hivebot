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
