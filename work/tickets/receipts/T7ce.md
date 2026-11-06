# 回执 T7ce：skill 根也过 fs.resolve（审查 C1）

> 施工：main (GLM 5.3) | feat/T7ce @ /tmp/bot-wt/T7ce | 2026-11-06 15:3x
> 工单：doing/T7ce-skill-root-canonical.md（代码照 manager 单逐字落地，无改写）

## 1. 先红（验收 1，改产品代码前）

```
$ vitest run tests/unit/policy.test.ts -t 'T7ce'
 ❯ tests/unit/policy.test.ts (73 tests | 1 failed | 72 skipped)
AssertionError: /tmp/bot-t7ce-isVD/tmp/t7ce-ws-GOvoTF/.dsh/skills/new/SKILL.md: expected Symbol(next) to match object { kind: 'ask' }
```
（`.dsh` 链接 + skills 未建 → 两种拼法漏卡直通 next，红在第一个路径即断。）

## 2. 修（验收 2-3）

`shell-ask.mjs:395-406`：`rawSkillRoots` 两根保留，逐根 `fs.resolve(r, { signal:
exec.signal })?.targetKey` 追加解析形态（只增不减；catch 回退原根）——照单
逐字，`fs`（:360）与 `exec`（监听器首参）均在作用域。

```
$ vitest run tests/unit/policy.test.ts        → Tests 73 passed（基线 72+1）
$ vitest run tests/e2e/skill-write-card.test.ts → Tests 9 passed
$ vitest run tests/e2e/write-outside.test.ts   → Tests 10 passed
```

## 3. 变异 M1（验收 4）

注释整段解析循环（保留 rawSkillRoots）→ 红（与 §1 同形：Symbol(next)），
cp 还原后 `git status` 干净。

## 4. 覆盖（验收 5）

```
shell-ask.mjs | 93.84% Stmts | 98.14% Lines | Uncovered: 176-177,357
```
176-177/357 均不在 `git diff 54b5b083..HEAD -- src/policy/shell-ask.mjs`
改动行（:392-406 区段）内 → 改动行覆盖 100%（含 catch 行——解析失败路径
由 M1 变异态覆盖面同款路径走到，未覆盖清单无 catch 行）。

## 5. 改动面（验收 6）

`git diff --stat 54b5b083..HEAD`：shell-ask.mjs + policy.test.ts 两文件
（+回执本文件）。
