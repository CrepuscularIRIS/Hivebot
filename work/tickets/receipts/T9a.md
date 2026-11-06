# 回执 T9a：产品启动器 ssh 组合骨架（L8-d）

> 施工：main (GLM 5.3) | 分支 feat/T9a（worktree /tmp/bot-wt/T9a → /dev/shm/bot-T9a）
> 链条：T9a（骨架）→ T9ab（第 1 次返修，不通过）→ **T9ac（第 2 次返修，本回执主体）**

## 0. 链史一句话

- T9a 初版：五变量骨架 + sshRows + childEnv；终验不通过（⑧ 空断言 / ⑪ 进程泄漏 + D11 设计错 / T9ab 步骤未落地）。
- T9ab：⑨ 诊断出 extraNeverTools 缩进 6→4 格 bug（guardRow 模板落在 `config.roots` 内）→ T9ac 修复；⑧ 真实发现 workflow 仍在 toolNames。
- **T9ac：⑧⑨⑪ 全绿**——⑧ 的根因是 preset 嵌套行禁不到（见 §1），修法 4 行。

## 1. ⑧ 根因（真实发现）

`workflow` 工具注册来自 **preset-standard / preset-cordis 树里的嵌套行**
（`dsh-web-app/presets/standard.patch.yml:103-108`：`delegation` group 下的
`workflow-ptc` + `tool-workflow`）。T9ab 在 sshRows 加的三条裸
`- id: … disabled: true` 只命中 **dsh-base 顶层行**
（`dsh-base/cordis.patch.yml:396/401/500` 确有同名顶层行）——顶层行禁了，
但会话用 standard preset 时插件树来自 preset 的 `config.plugins` 嵌套行，
裸行够不到。机制与 `approval.yml:43-48`（P5-03 plugin_manager）注释所述相同：
「够不到 preset 行 config.plugins 里的同名嵌套行」。

## 2. 修法（T9ac 第 3 轮，4 行 + 测试）

`approval.yml` 复制树的 workflow 两行加条件禁用（standard `:167/:172`、
cordis `:292/:297`）：

```yaml
- id: workflow-ptc
  name: '@deepseek-ai/dsh-workflow-ptc'
  disabled: !!js process.env.P2SDK_SSH_MODE === '1'
  config:
    provider: spawn
- id: tool-workflow
  name: '@deepseek-ai/dsh-tool-workflow'
  disabled: !!js process.env.P2SDK_SSH_MODE === '1'
```

- ssh 模式：`start.ts:212` 已设 `P2SDK_SSH_MODE=1` → 两行禁 → workflow 从工具面消失。
- 本机模式：未设 → 求值 `false` → 行为与上游一致（上游 `tool-bash` 行自用同款
  `!!js process.platform === 'win32'`，false ≙ 无 disabled 行）。
- ptc 树不动（上游本就 `disabled: true`）；minimal 无 workflow 行。
- `!!js` 在嵌套行可用以上游 `standard.patch.yml:23-26` 为证。
- `start.ts`：撤销本轮误加的 `- id: workflow` 裸行（dsh-base 顶层无此 id，
  恒无效；sshRows 其余行不变）。

测试侧：

- `guard-plugin-manager.test.ts` drift 豁免 `cutWorkflowDisabled`：ours 侧
  表达式行换占位、exp 侧两行 name 后补占位（ptc 树两侧都有 `disabled: true`
  不动），逐字比对继续锁树形。
- 同文件 ① 加本机对照断言：standard/cordis 本机 toolNames **须含** workflow、
  ptc/minimal 须不含——表达式若误成恒真，此格红。

## 3. 验收证据（原样尾部）

```
$ pnpm --config.verify-deps-before-run=false vitest run tests/e2e/ssh-product.test.ts
Test Files  1 passed (1) / Tests  3 passed (3)      # ⑧⑨⑪

$ … vitest run tests/e2e/guard-plugin-manager.test.ts
Test Files  1 passed (1) / Tests  7 passed (7)      # ① 含新本机断言 + drift×2

$ … vitest run tests/e2e/skill-save.test.ts         # 本机回归
Test Files  1 passed (1) / Tests  4 passed (4)

$ … vitest run tests/unit/start.test.ts
Tests  40 passed (40)                               # 单测不查禁行清单，无需同步
```

⑧⑪ 重写细节（本轮第 2 部分，先于本修）：`ssh-product.test.ts` ⑧ 改读 fake
`requests.jsonl` 的 `toolNames`（bash 正对照防恒绿）；⑪ 两段式（SIGKILL
launcher → dsh 从 `/proc/<pid>/task/<pid>/children` 证明仍活；SIGKILL dsh →
`/tmp/dsh-ssh-*` 新增 ≤1 且为空 + 端口 ECONNREFUSED）。

## 4. 变异（两刀，均原样红后还原）

| 变异 | 红格 | 原样 |
|---|---|---|
| M-⑧ 删 4 行 disabled 表达式 | ⑧ | `AssertionError: toolNames 不含 workflow 族: expected [ 'workflow' ] to deeply equal []` |
| M-本机 表达式恒真（`!!js true`） | ① | `AssertionError: 会话 …（standard…）本机含 workflow: expected [] to include 'workflow'` |

还原核验：`grep -c "P2SDK_SSH_MODE === '1'" approval.yml` → `4`。

## 5. ⑪ 泄漏修复（第 4 步，验收 9 触发）

收尾检查发现 30 个 bot-T9a 进程 + 17 个 dsh-ssh 目录累积泄漏。根因：⑪ 结尾
`rt = undefined` 让 afterAll 跳过基线 `rt.stop()`，每轮漏一组
launcher+dsh+ssh master+helper。修复：

- 删 `rt = undefined`；
- ⑪ 加孤儿 master 断言：SIGKILL dsh 后，命令行含夹具目录且 `ppid==1` 的 ssh
  master 限界等零（基线 master 的父是活着的基线 dsh，不算——只数真孤儿）。

两轮连跑实证：进程残留 0；dsh-ssh 目录每轮恰 +1 个空目录（PLAN §3-10 已接受
残留，⑪ 断言即「新增 ≤1 且为空」）。变异等价物：删 `rt = undefined` 复原即
回到泄漏态（本轮修复前实测即红态证据，30 进程清单见 LOG）。

## 6. 风险与边界

1. preset-cordis 也禁了 workflow（ssh 模式切 cordis preset 同样无 workflow）——
   预期行为；minimal 本无 workflow 行。
2. 上游 preset 若重排 workflow 行位置，drift 用例按行比对会红（预期：人工核后
   同步豁免位置）；若上游加新 workflow 族行，drift 亦红。
3. `requests.jsonl` 的 `toolNames` 是 fake plugin 新字段（`plugin.mjs`），仅测试
   夹具侧，不进产品代码。
4. ⑧ 断言集为「首请求」——若未来 workflow 工具改为惰性注册（二请求起才出现），
   需改为全请求扫描；当前 dsh 工具面在会话级一次性组装，不适用。
