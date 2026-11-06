# 回执 T9ae：runtime patch 插值 yamlScalar + 本机清继承 P2SDK_SSH_MODE（审查 C3+C4）

> 施工：main (GLM 5.3) | feat/T9ae @ /tmp/bot-wt/T9ae | 2026-11-06 15:4x
> 工单：doing/T9ae-start-yaml-scalar-ssh-mode.md（代码照 manager 单逐字落地）

## 1. 先红（验收 1，2 failed 与单预期逐字同形）

```
AssertionError: 本机模式不继承 MODE: expected '1' to be undefined
AssertionError: expected '- insert:\n    - id: llm-replay\n    …' to contain '        host: 'true'\n'
```

## 2. 修（验收 2-4）

- C4：`start.ts:209-211` sshKeys 末尾加 `'P2SDK_SSH_MODE'` + 注释两行。
- C3：15 处替换——工单列的 14 处 `'${…}'` + `:444` 裸 `host: ${ssh.host}`
  （`:445` flow mapping 内 node 同步换 `launch: { kind: node-script, node: ${yamlScalar(ssh.node)} }`）。

```
$ vitest run tests/unit/start.test.ts → Tests 42 passed（基线 40 + 2）
$ grep -nF "'\${" src/start.ts   → 仅 :229 yamlScalar 定义一行
$ grep -nE "^\s+host: \\$\\{ssh" src/start.ts → 无输出
$ node $T/c3.mjs（js-yaml 4.3.2 真解析）
"true" "/srv/O'Brien/work" "/remote/n'ode" "/srv/O'Brien/work"
```

## 3. 回归（验收 5）

```
ssh-headless + ssh-host → 14 passed
ssh-product → 3 passed（跑后 pgrep 'bot/app/sdk' 无本单残留）
guard-plugin-manager → 7 passed
```
注：收尾时发现并清掉 16 个**上会话 H7b 泄漏**的主仓 runtime 孤儿进程
（bot-reap，非本单引入；本单 e2e 跑前在场、与 bot-wt/T9ae 无关）。

## 4. 变异（验收 6，各红后 cp 还原）

| 刀 | 原样红 |
|---|---|
| M1 删 sshKeys 里 'P2SDK_SSH_MODE' | `AssertionError: 本机模式不继承 MODE: expected '1' to be undefined` |
| M2 workspace 行还原裸拼 | `AssertionError: … to contain '        workspace: '/srv/O''Brien/…'` |

## 5. 覆盖（验收 7）

```
start.ts | 42.23% Stmts | 40.95% Lines | Uncovered: （全量清单见运行输出，
均 ≥ :510 段 launch 主函数——unit 不可达面）
```
`git diff -U0` 改动行 18 行（:209-211 + 15 插值行）∩ 未覆盖 = ∅ →
**改动行覆盖 100%**。

## 6. 改动面（验收 8）

`git diff --stat <起点>..HEAD`：start.ts、start.test.ts 两文件（+回执）。
