# T7d 回执：bash 写 skill 根漏卡收口（预建 + wrapper ro-bind）（2026-11-07 20:3x–20:4x）

提交链（feat/T7d，先吸收主线 076e753e——T11 已合、workspace.mjs 可用）：
- `e92ef98c`（前轮 wip）：bwrap-wrap.py binds 派生 skill 根 ro-bind + mintWorkspace 预建
- `29388431`：workspace.mjs workspace_ensure 追加两目录 mkdir（幂等）
- `57c25afd`：wrapper 单测新 describe + approval.test.ts 新用例

## 先红（原样输出；时序说明：wip 先做了修复未留施工前红，用 Vk 态（删派生段）等价补跑）
```
$ pnpm exec vitest run tests/e2e/approval.test.ts   （Vk 态：bwrap-wrap.py 派生段替换为 pass）
  ❯ approval.test.ts (6 tests | 1 failed) 16795ms
  AssertionError: 批准后 .dsh/skills 仍写不进（ro-bind）: expected true to be false
  ——批准（allowed-once）后 cat > 写成：T7c 缺口（bash 形态逃 targets 零卡）的 e2e 级复现
还原后：Tests 6 passed (6)（原 D8 五段 + 新 T7d 用例）
```

## 用例语义（approval.test.ts 追加 it）
预建态（mkdir 两 skill 根=产品预建后世界）下，fake 模型发两个普通 bash 写根调用（cat heredoc 与 echo > 两个形态）——shell-ask 默认策略出卡 → 全部 allowed-once → **批准执行后两文件都不存在**（ro-bind 挂载点 Read-only）。与 write/edit 出卡同语义的保护强度，不依赖 targets 判定。

## wrapper 单测（sandbox-wrapper.test.ts 新 describe）
- 预建两根 → argv 含两条 `--ro-bind <ws>/.dsh|agents/<…>`，位置在 ws 重 bind **之后**（后挂载覆盖写权限）、再遮之前；前驱 flag 为 --ro-bind
- 目录缺失（旧工作区）→ 不追加、wrapper 照常出 argv
```
Vk 刀（Edit 删派生段）：Tests 14 tests | 1 failed（新 describe 红）→ 还原 → 14 passed (14)
```

## 回归（原样输出尾部）
```
approval.test.ts：Tests 6 passed (6)（D8 ①–⑤ 出卡链不变）
write-outside + tiers-policy + guard-fs：Test Files 3 passed (3) / Tests 25 passed (25)
```

## 本机/远端预建落点
- mintWorkspace（orchestrate.ts，e92ef98c）：两目录 mkdir
- workspace_ensure（workspace.mjs）：`mkdir -p` 幂等追加两目录（远端 mkdir 由既有 subprocess 通道）
- start.ts 未动：方案改为 wrapper 内从 binds 派生（无需 --ro-skill-root 参数）——工单方案 2 的更简实现

## 边界外记录
- ui 侧 skills-enable.spec 主动加验：卡 `.sand-agent-item` 60s（T26b gate 裸 launchShell 回归第 13 个受害者，T7bg 清单）——与 T7d 无关未修。T7d 的产品链验证由 approval e2e（真 dsh 会话 + 真 bwrap 沙箱）覆盖。
- 追加：退出码字面断言（requests.jsonl toolResults 含 `Read-only file system` ×2）→ 6 passed；T7c 出卡回归 skill-write-card **9 passed**（write/edit 出卡链不变）

## review 修复（2026-11-07 20:5x——Sol 高1/中1）
- **高1（fail-closed）**：isdir 跳过=旧工作区（restore 只恢复 preset 不补根，既有 bot 永久裸奔）+ bash 一条命令 `mkdir && echo >` 可自建绕过。修：派生段缺根**不跳过**——真跑先 `os.makedirs(exist_ok=True)` 再挂 ro-bind（dry-run 只报完整形状不落盘）。既有工作区首次沙箱启动即获保护。
- **中1（断言严谨）**：退出码断言改按 toolCallId 去重——两条写命令各自 text 含 `Read-only file system`（探针：一条 isError=true 一条 false——dsh 对 bash 非零退出可作正常输出回传，isError 非本单契约，回执记）。
- 新增高条 e2e 场景：legacy 工作区（无预建）`mkdir -p && echo >` 一条命令 allowed-once 后仍写不进（s2 独立 follow——首版误等 s1 流红在 turn/end #3，已修）。
```
Vk2 刀（删派生段）：✘ '批准后 .dsh/skills 仍写不进' expected true to be false → 还原 → approval 6 + wrapper 14 passed
回归五件（write-outside/tiers-policy/guard-fs/skill-write-card/sandbox-wrapper）：Test Files 5 passed / Tests 48 passed
approval 全量（含高条场景）：Tests 6 passed (6)
```

## T7db（2026-11-07 21:4x–21:5x——父目录改名绕过收口）

### 先红（7e205f91 上，原样）
```
AssertionError: 改名 .dsh 后仍写不进新根: expected true to be false（approval.test.ts:567）
——mv .dsh .dsh_x && mkdir -p .dsh/skills/y && echo > 写成：经理 bwrap 探针复现的绕过在 e2e 钉死
```

### 实现（bwrap-wrap.py 派生段，提交 7a47b9f4 + 注释补 01feab1f）
- 每 bind：`--bind <ws>/.dsh <ws>/.dsh` + `--ro-bind <ws>/.dsh/skills …`（.agents 同）——父目录自绑成挂载点（不可 mv/rm，内部照旧可写），根 ro-bind 后挂覆盖写权限
- `os.path.realpath(x) == x` 否则 `die()`（符号链接拒绝——防 makedirs 被引到工作区外）；makedirs OSError 走 `die()`（自带 bwrap: 前缀——T7d 终验 LOW 项顺带修）
- dry-run：不落盘、argv 报完整形状

### 验收（原样尾部）
```
approval：Tests 6 passed (6)（含改名场景四断言：新根写不进 ×2 + 父目录没被搬走 ×2）
sandbox-wrapper：Tests 15 passed (15)（新断言：挂载序 ws<父绑<ro-bind<再遮、dry-run 不落盘 .dsh 不建、符号链接→非零+bwrap: 前缀+目标下无 skills）
回归四件：Test Files 4 passed / Tests 34 passed
Vh 刀（删父目录自绑）：✘ '改名 .dsh 后仍写不进新根' expected true to be false → git checkout 还原 → 15 passed
```

### 施工事故记录（如实）
首次 Vh 刀跑在未提交实现上，`git checkout` 还原时把实现一并抹掉（T32c 同款——LEARNINGS「变异刀前本体先提交」再犯一次，已重放实现并先提交后重跑刀闭环）。事故不影响刀的有效性：两次 Vh 红输出一致、还原后复绿均在提交态验证。
