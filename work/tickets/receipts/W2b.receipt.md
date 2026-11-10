# 回执 W2b：launcher-serve.spec 红跑不漏常驻 serve；token 真值断言补齐五面

> 施工：main (GLM 5.3) | 完成时间：2026-11-10
> 分支 / 提交：`feat/W2b` @ 997308ad（worktree /tmp/bot-wt/W2b，基于 cf1a4733）
> 工单：`open/W2b-launcher-serve-finally.md`（机械单，直接做）

## 1. 做了什么

1. spec 主体（startServe 之后）整体包 `try { … } finally { … }`：finally 对未退 serve TERM→等 30s→KILL；状态行 dsh pid 残留 `/proc` 在则 KILL（本测试自己起的）；最后 `rmSync(home)`。③ 原有 TERM+断言保留在 try（finally 对已退 child 无操作）。
2. `startServe` 返回 `allOut: () => out`（累积 stdout+stderr getter）；② 真值断言补到五面：`JSON.stringify(line)`、serve 全部输出、`serve.json` 内容、`--status` 输出、⑤ 重复 serve 输出。

## 2. 验收证据

### 2.1 验收 1（绿）

```text
✓ 1 passed (5.3s) / (5.4s)
```

### 2.2 验收 2（注入红→漏不漏，修改前后对照）

**修改前**（注入 `expect(1).toBe(2)`）：`1 failed`，随后
```text
ps：4147427 …dsh/lib/bin.js web --patch …bot-t46c-CznVbW/state/hivebot/dsh/runtime-patch.yml…
```
（漏常驻 dsh + serve bash——bot-reap 手工收掉，回执 PID 留档。）
**修改后**（同注入）：`1 failed`，随后 `ps | grep bot-t46c | wc -l` = **0**。

### 2.3 验收 3（变异：状态行 printf 后临时 `cat "$HANDOFF/launch-token" >&2`）

```text
1 failed   ← 81 行 tokenVal 断言：serve 全部输出面抓到（状态行本身没变，新面有判定力）
```
还原复绿 `1 passed (5.2s)`、ps 0。

### 2.4 验收 4（跑完残留）

```text
ps -eo cmd= | grep -F bot-t46c- → 0
```

## 3. 产出

- `app/ui/tests/e2e/launcher-serve.spec.ts`（try/finally + allOut + 五面）
