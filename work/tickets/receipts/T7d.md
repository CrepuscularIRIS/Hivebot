# T7d 回执：bash 写 skill 根漏卡收口（预建 + wrapper ro-bind）（2026-11-07 20:3x–20:4x）

提交链（feat/T7d，先吸收主线 076e753e——T11 已合、workspace.mjs 可用）：
- `e92ef98c`（前轮 wip）：bwrap-wrap.py binds 派生 skill 根 ro-bind + mintWorkspace 预建
- `<远端预建 sha>`：workspace.mjs workspace_ensure 追加两目录 mkdir（幂等）
- `<测试 sha>`：wrapper 单测新 describe + approval.test.ts 新用例

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
