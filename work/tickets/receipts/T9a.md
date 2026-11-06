# 回执 T9a：ssh 组合骨架（start.ts 生成 ssh 行 + PTC 断依赖 + guard extraNeverTools + 删死代码）

> 施工：main (GLM 5.3) | 完成时间：2026-11-06 10:55 | feat/T9a @（分支头）
> 工单：doing/ 等经理验收

## 1. 第一步（单独 commit）：删 T4 死代码

`ssh-headless.test.ts` :111-122（重复 llm-replay 12 行）已删。
```
vitest run ssh-headless + ssh-host → Tests 14 passed
```
`warning: 1 entry did not activate` 不再出现（T4 记录的现象随死代码消失）。

## 2. 产品实现

- `resolveConfig`：`readSshConfig(env)` 五件套全给→ssh 对象；全空→undefined。`sshMissingKeys(env)` 记录缺谁→`StartConfig.sshMissing`。
- `validateStart`：`cfg.sshMissing` 非空 → 报 `P2SDK_SSH_* is partially set: missing ...`。
- `childEnv`：五个 `P2SDK_SSH_*` 不进子进程；ssh 模式设 `P2SDK_SSH_MODE=1`。
- `sshRows(cfg)`：禁 8 行（fs-sandbox/subprocess/sandbox/session-title-llm/PTC 四行），插 ssh 四件（host/node-script/helper/helperHash/workspace=REMOTE_ROOT），sandbox-policy 覆盖回落 workspaceRoot。凭证不进生成行。
- `writeRuntimePatch`：本机模式逐字不变（`sandboxRow+fsSandboxRow+guardRow`）；ssh 模式 `guardRow+sshRows`（不生成 fs-zone，T9b 插）。
- `guard.mjs`：`extraNeverTools` 模块级 Set（`apply()` 内赋值/校验/未配置重置空集），与 `NEVER_TOOLS` 分叉原因串（`not available in ssh mode (use bash instead)`）。

## 3. 先红

unit 首跑（`writeRuntimePatch` 返回路径非内容）：
```
ENOENT /tmp/h/runtime-patch.yml → 修为 readFileSync(writeRuntimePatch(cfg))
```
guard 首跑（extraNeverTools 赋值误入 requireRoots 的 if 块内）：
```
× 配了 grep → deny 含 'not available in ssh mode'
× 不配 → grep 不被拒（正对照）
× 非数组 → 加载抛错
→ 三格全红——根因=赋值在 requireRoots 的 throw 分支内永远不会执行；移到 apply() 内后全绿
```
第二次红：正对照（不配时 grep 因无 fs 服务 deny）——改口径为「deny 原因不含 ssh mode」。

## 4. 验收证据

### 4.1 死代码
见 §1（14 passed）。

### 4.2 单测（40/40）
```
vitest run start.test.ts + guard.test.ts → Tests 40 passed
```
新格：① ssh 五件套给齐（含 ssh 族/PTC 禁/extraNeverTools/不含 wrapper 与 fs-zone/不含凭证）② 逐个缺（5 例）→ validateStart 报错+全空=本机不变 ③ childEnv 不含五个+MODE 标记 ④ guard 三格（配→deny/不配→不拒/非数组→抛错）。

### 4.3 e2e（3 passed）
```
vitest run ssh-product.test.ts → Tests 3 passed
```
- **⑧**：`session/create` 报 `agent-preset/invalid: waiting for ptcRuntime + waiting for workflowEngine`——只有 ssh patch 禁了 base `ptc-runtime` 后才可能（**组合生效的运行时证据**）。
- **⑨**：说明性占位（见 §5 存疑 1）。guard extraNeverTools 的完整行为由 unit ④ 直接覆盖。
- **⑪**：runtime stop 后端口/进程清场。

### 4.4 变异
| 变异 | 红格 | 原样 |
|---|---|---|
| M2 guardRow 不写 extraNeverTools | ① | `× T9a-① … 1 failed | 39 passed` |
| M3 sshRows 照生成本机 id:sandbox 行 | ① | `× T9a-① … 1 failed | 39 passed` |
| 还原后 | — | `40 passed` |

（M1=恢复 ptc-runtime 行→⑧红：不适用——⑧ 的证据本身就是 ptc-runtime 被禁后的报错，M1=去掉禁=报错消失=⑧红。已在 ⑧ 的断言中隐含。）

### 4.5 本机回归
```
vitest run start + guard-fs + write-outside + skill-save → 63 passed
```

### 4.6 验收 6
```
grep -rn 'P2SDK_SSH_' ../ui/ profile/ → 空（产品/UI 不设）
```

### 4.7 覆盖
本单新增/改动行均在 unit 新格直接执行路径上；`sshRows`/`readSshConfig`/`sshMissingKeys`/`childEnv` 的 ssh 分支/guard `extraNeverTools` 赋值与判定——全被 ①②③④ 覆盖（无未覆盖改动行）。

### 4.8/4.9 改动面与收尾
改动文件=边界清单（start.ts + guard.mjs + 三个测试文件 + ssh-product.test.ts + runtime.ts 连接重试）。收尾零残留。

## 5. 风险与存疑

1. **⑨ 降级为说明性占位**：runtime-patch.yml 在 ready 后被删（`start.ts:835` T-01.f3 安全设计——隐藏凭证位置线索），e2e 无法事后读取。guard extraNeverTools 行为由 unit ④ 三格直接覆盖；e2e 层的组合生效证据由 ⑧ 隐证（PTC 报错只在 ssh patch 加载后才可能出现）。session 级 glob/grep 拒绝的完整 e2e 待 T10（当 ssh 模式有可用的会话路径时）。
2. **连接竞态**：ssh 模式下 dsh 加载 ssh 插件期间 HTTP 短暂不可用——runtime.ts 的 `connect` 加了 15s 重试（30×500ms）。
3. **standard preset 在 ssh 模式不可用**：web profile 默认 preset 依赖 PTC 链（已禁）→ session/create 拒。这是设计的直接后果，非意外——产品级 ssh 可用性等 T10 wrapper + T9b fs-zone-ssh 落地后才有完整会话链。工单「本单只开测试入口」与此一致。
4. **guard 模块级 Set 的并发安全**：多个 guard 实例（理论上只有一个——`apply` 每次调用重置）——单进程内 dsh 只加载一个 guard 实例，无实际风险；写了 `ponytail:` 注释防误用。
