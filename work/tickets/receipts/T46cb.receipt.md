# 回执 T46cb：serve 锁冲突按模式分流 + --status JSON 修 + token 真值断言

> 施工：main (GLM 5.3) | 完成时间：2026-11-10
> 分支 / 提交：`feat/T46cb` @ 7d2aab58（worktree /tmp/bot-wt/T46cb）
> 工单：`doing/T46cb-serve-lock-collision.md`（T46c 验收遗留）

## 1. 做了什么

`app/launcher/hivebot` 锁冲突分支按模式分流（T46cb 定案三条全落）：
1. 锁被占 + `$1=serve`：serve.json 活着（kill -0 pid）→ **幂等**：打同一行状态 `exit 0`；桌面在占 → `die "已有桌面实例在跑，serve 需先关闭桌面"`。两路都不起 Electron。
2. 锁被占 + 非 serve + serve.json 活着 → `die "serve 模式在跑…"` exit 1（不再弹 15s 空窗）。
3. `--status` stderr 两处改 printf 单引号格式串（合法 JSON `{"stale":true}`/`{"running":false}`）。
4. 不做共享 SDK（YAGNI，工单定案）。

## 2. 验收证据

### 2.1 七格全绿（⑤⑥⑦ 新格 + ②加强；Xvfb 隔离）

```text
✓ 1 tests/e2e/launcher-serve.spec.ts:57:5 › … (4.8s)
1 passed (5.2s)
```
- ⑤ 重复 serve：exit 0、stdout 含同 base_url、原实例 serve.json 在、零 Electron；
- ⑥ serve 在跑起桌面：exit≠0、stderr 含 serve、零 Electron（worktree 需先 build UI 产物，产物检查在锁前——测试前提照常）；
- ⑦ `--status` 停止态 stderr `HIVEBOT-SERVE {"running":false}` 可 `JSON.parse` 且 `.running===false`；
- ②加强：读 `<handoff>/launch-token` 真值断言状态行不含。

### 2.2 手测（桌面挡 serve 方向，工单边界 3）

```text
$ hivebot serve &    # → HIVEBOT-SERVE {"base_url":"http://127.0.0.1:42555",…}
$ hivebot            # 桌面：
hivebot: serve 模式在跑，先 TERM serve 进程再开桌面
桌面exit=1
```
（反方向「桌面在跑→serve exit 1」需真起 Electron 桌面实例——按工单留手测给经理或用户桌面实测。）

## 3. 产出

- `app/launcher/hivebot`（锁分流+JSON 修）
- `app/ui/tests/e2e/launcher-serve.spec.ts`（⑤⑥⑦+②加强）
