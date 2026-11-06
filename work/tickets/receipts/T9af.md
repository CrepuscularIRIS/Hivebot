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
