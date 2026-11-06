# T9af：guard 的 extraNeverTools 归 apply 闭包——后一次 apply 不再改写先前实例

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：Sol 审查 `work/tickets/review/T7c-T9a-security.md` C2（经理核实 CONFIRMED，见该文件「## 经理核实」）；T9ac「未配置重置空 Set」修法的副作用
> **在等：feat/T16 合并到主线。** T16（/tmp/bot-wt/T16）正在改同一文件 `guard.mjs:38`（NEVER_TOOLS 加 apply_patch）与 `:255`（拒绝原因串），本单改 `:40-41`、`:239-247`，相距 1-2 行。T16 合并后从合并后的主线切 feat/T9af，挪回 `open/`。须在 T9b 之前合并（T9b 也改 guard）。
> 分支 / 作业目录：feat/T9af（T16 合并后从主线切）；小改动，可不建 worktree
> claimed：
> accepted：

## 目标
同一进程里 `apply` 多次（热重载、测试里多个上下文）时，每个监听器只按自己那次 `apply` 的 `config.extraNeverTools` 判定。

## 根因（经理实测）
`guard.mjs:41` 的 `let extraNeverTools` 是模块级变量，`:244`/`:246` 每次 apply 都整体重赋，监听器 `:258` 读的是这个模块变量而不是自己的闭包。经理探针（真 `apply`、假 ctx）：
- `apply(A,{extraNeverTools:['grep','glob']})` → A.grep 原因 `not available in ssh mode`；再 `apply(B,{roots})` → **同一个 A 的 grep** 原因变成 `filesystem resolution service unavailable`（ssh 拒没了，接上 fs 服务就放行）。
- 反向：`apply(C,{roots})` 后 `apply(D,{extraNeverTools:['grep']})` → 本机实例 C 的 grep 被按 ssh 模式拒。
生产里一个 dsh 进程通常只 apply 一次、旧上下文 dispose 时监听器即撤，所以影响面限于重载重叠窗口与测试；但这是策略状态串实例，修法只有几行。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/sdk/src/policy/guard.mjs:38-41`、`:236-260`（以 T16 合并后的行号为准）
3. `app/sdk/tests/unit/guard.test.ts:36-46`（`listener()` 助手）、`:221-237`（T9a extraNeverTools describe）

## 边界
1. 只动：`app/sdk/src/policy/guard.mjs`、`app/sdk/tests/unit/guard.test.ts`、回执。
2. 先写失败测试（下面照抄），**先不改产品代码跑它，看红**。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。
4. 只在 feat/T9af 提交；合并等经理验收。

## 第 1 步：先红（照抄进 `guard.test.ts` 的 `describe('T9a extraNeverTools')` 里，放在「非数组 → 加载抛错」之后）

```ts
  it('T9af 后一次 apply 不改写先前实例（两个方向）', async () => {
    const grep = { name: 'grep', arguments: { pattern: 'x' } }
    const allow = async () => ({ kind: 'allow' })
    const a = listener({ roots: configRoots(), extraNeverTools: ['grep'] })
    listener({ roots: configRoots() })
    const oa = await a(grep, allow) as { kind: string; reason?: string }
    expect(oa.kind, 'ssh 实例 A 在本机实例 B apply 之后仍拒 grep').toBe('deny')
    expect(oa.reason).toContain('not available in ssh mode')
    const c = listener({ roots: configRoots() })
    listener({ roots: configRoots(), extraNeverTools: ['grep'] })
    const oc = await c(grep, allow) as { kind: string; reason?: string }
    expect(oc.reason ?? '', '本机实例 C 不因 ssh 实例 D 的 apply 按 ssh 拒').not.toContain('ssh mode')
  })
```

预期红：第一条 `expect(oa.reason).toContain('not available in ssh mode')` 失败，实际是 `filesystem resolution service unavailable`（`kind` 那条两边都是 deny，过；不要删 reason 断言）。

## 第 2 步：修
1. 删 `guard.mjs:40-41`（模块级 `let extraNeverTools` 与它的注释）。
2. `apply` 里 `:239-247` 整段换成：

```js
  // T9a/T9af（审查 C2）：extraNeverTools 归本次 apply 的闭包——模块级 Set 会被后一次 apply
  // 整体改写，连带改掉先前实例的策略（热重载 / 同进程多上下文）。校验仍在监听器注册前。
  if (config.extraNeverTools !== undefined
    && (!Array.isArray(config.extraNeverTools) || !config.extraNeverTools.every((t) => typeof t === 'string' && t.length > 0))) {
    throw new Error('p2sdk-fs-guard: config.extraNeverTools must be an array of non-empty tool names')
  }
  const extraNeverTools = new Set(config.extraNeverTools ?? [])
```
监听器里 `extraNeverTools.has(exec.name)` 一行不用动（名字相同，现在读闭包）。

## 验收（写命令，不写感觉）
```bash
T=$(mktemp -d /tmp/bot-T9af-XXXX); mkdir -p $T/tmp $T/home
cd <feat/T9af 工作目录>/app/sdk
E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
V="pnpm --config.verify-deps-before-run=false exec vitest run"
```
1. 先红：改产品代码前 `$E $V tests/unit/guard.test.ts -t 'T9af'` → 1 failed，失败在 reason 断言（贴原样）。
2. 修后：`$E $V tests/unit/guard.test.ts` → 全绿（T16 合并后的基线 + 1，贴数字）。
3. 无模块级可变状态：`grep -nE "^let " src/policy/guard.mjs` → 无输出。
4. 回归（单套顺跑）：`$E $V tests/e2e/guard-plugin-manager.test.ts` → 全绿；`$E $V tests/e2e/ssh-product.test.ts` → 3 passed，之后无本单残留 dsh。
5. 变异 M1：把 `const extraNeverTools = …` 挪回模块级 `let` 并在 apply 里赋值 → `-t 'T9af'` 红（贴原样），还原。
6. 改动面：`git diff --stat <起点>..HEAD` 只含 `guard.mjs`、`guard.test.ts`、`receipts/T9af.md`。

## 为什么这样验收
要保住的是「一个 guard 实例的策略只由它自己的配置决定」。测试断言 reason 而不只是 kind：没有 fs 服务时 A 的 grep 两种情况下都是 deny，只看 kind 是空断言——必须证明拒的理由仍是 ssh 模式。反向那条防止修成「只防清空、不防串入」。

## 产出
- `app/sdk/src/policy/guard.mjs`、`app/sdk/tests/unit/guard.test.ts`
- `work/tickets/receipts/T9af.md`
