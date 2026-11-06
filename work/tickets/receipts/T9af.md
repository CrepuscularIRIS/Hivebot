# 回执 T9af：extraNeverTools 归 apply 闭包（审查 C2）

> 施工：main (GLM 5.3) | feat/T9af @ /tmp/bot-wt/T9af | 2026-11-06 16:4x（T16 合并后解锁）
> 工单：open/T9af-guard-extra-never-closure.md（代码照 manager 单逐字落地）

## 1. 先红（验收 1）

```
$ vitest run tests/unit/guard.test.ts -t 'T9af'
 ❯ tests/unit/guard.test.ts (25 tests | 1 failed | 24 skipped)
AssertionError: expected 'p2sdk-fs-guard: filesystem resolution…' to contain 'not available in ssh mode'
```
（A 实例的 ssh 拒被 B 的 apply 改写成 fs 服务缺失——与经理探针同形。）

## 2. 修（验收 2-3）

删模块级 `let extraNeverTools`（原 :40-41）；apply 内换 const Set + 校验合并段
（照单逐字）。监听器读闭包（名字不变，零改动）。

```
$ vitest run tests/unit/guard.test.ts → Tests 25 passed（基线 24 + 1）
$ grep -nE "^let " src/policy/guard.mjs → 无输出
```

## 3. 回归（验收 4）

```
guard-plugin-manager → 7 passed
ssh-product → 3 passed；跑后 pgrep 'bot-wt/T9af' → 0
```

## 4. 变异 M1（验收 5）

闭包 const 挪回模块级 let + apply 赋值（=T9ac 旧形态）→ 红（与 §1 同形），
cp 还原后 status 只余本单两文件改动。

## 5. 改动面（验收 6）

`git diff --stat <起点>..HEAD`：guard.mjs、guard.test.ts（+回执本文件）。

## 6. 经理终验（manager Opus 5.5，2026-11-06 16:3x，HEAD 253f14dd）——**通过**

经理在 /tmp/bot-wt/T9af/app/sdk 亲自复跑（隔离 HOME/TMPDIR、DBus 指向不存在路径，load ≈3.2）：

| 验收 | 经理复跑结果 | 与回执 |
|---|---|---|
| 1 先红 | 产品文件回退到 f01eb580 版跑 `-t 'T9af'` → `1 failed | 24 skipped`，`expected 'p2sdk-fs-guard: filesystem resolution…' to contain 'not available in ssh mode'`；cp 还原 | 一致 |
| 2 全绿 | `guard.test.ts` → 25 passed（T16 后基线 24 + 1） | 一致 |
| 3 无模块级可变 | `grep -nE "^let " src/policy/guard.mjs` → 无输出（rc=1）；监听器 :253 读 apply（:233-323）内 :242 的 const | 一致 |
| 4 回归 | guard-plugin-manager 7 passed；ssh-product 3 passed；跑后 `pgrep -af 'bot-wt/T9af\|bot-T9af-mgr'` 空 | 一致 |
| 5 变异 M1 | 模块级 `let` + apply 内整体赋值 → `-t 'T9af'` 红（A 方向 reason 断言） | 一致 |
| 5′ 经理加测 M2 | 模块级 `let`、仅 defined 时赋值（不复位）→ 红在反向断言「本机实例 C 不因 ssh 实例 D 的 apply 按 ssh 拒」——证明反向那条不是空断言 | 新增 |
| 6 改动面 | `git diff --stat f01eb580..HEAD` = guard.mjs / guard.test.ts / receipts/T9af.md；产品与测试 diff 与工单第 1、2 步**逐字一致** | 一致 |

其他：主线自 f01eb580 后只动 HANDOFF/LOG，`git merge-tree` 预演无冲突。工单轨迹 blocked→open（施工方在 open 内认领、未挪 doing，按单头指示无误）→ 经理归档 done/（主仓工作区，待主会话提交）。
