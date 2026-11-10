# 验收 T46cb：serve 锁冲突分流（经理任务 B）

> 经理 Opus 5.5 | 2026-11-10 | 被验：feat/T46cb @ 7d2aab58（worktree /tmp/bot-wt/T46cb）
> 结论：**通过** → `done/`，accepted @ 7d2aab58

## 1. 重跑验收 1（app/ui，run-e2e.sh / Xvfb）

```text
✓  1 tests/e2e/launcher-serve.spec.ts:57:5 › T46c hivebot serve：常驻/状态行/--status/TERM 清理 (4.8s)
1 passed (5.2s)
```
跑了三次（首跑、复跑、变异还原后），均 1 passed，与回执一致。绿跑本身不漏进程。

## 2. 变异（验收 2，回执未贴，经理补跑）

| 变异 | 结果 |
|---|---|
| M1：hivebot:73 `if [ "${1:-}" = "serve" ]` → `if false`（删定案 1） | ✘ `重复 serve exit 0`（spec:99） |
| M2：hivebot:83 `if [ "$SERVE_ALIVE" = 1 ]` → `if false`（删定案 2） | ✘ `桌面被 serve 挡：exit≠0`（spec:112），17.0s 落回 15s 双开分支 |
| 还原（`git checkout`，status 干净） | ✓ 1 passed |

## 3. 四条定案核对（读 app/launcher/hivebot:64-86、29-40）

1. 锁被占 + serve：serve.json 的 pid `kill -0` 活 → 同格式 printf 状态行 exit 0；否则 `die "已有桌面实例在跑…"`。两路都在 Electron 启动之前退出。✓
2. 锁被占 + 非 serve + serve 活 → `die "serve 模式在跑，先 TERM serve 进程再开桌面"`。✓（定案写了带 `<base_url>`，实现没带；文案级偏差，接受）
3. `--status` 两处 stderr 改为 `printf '%s\n' '…{"stale":true}'` / `{"running":false}`，合法 JSON；⑦ 格 JSON.parse 守住。✓
4. 不做共享 SDK：没碰 main / handoff 读取路径。✓

## 4. 手测反方向（验收 3：桌面在跑 → serve，经理实测）

隔离 HOME/XDG/TMPDIR、`P2SDK_PROVIDER=mock`、死 DBus、`xvfb-run -a` 起真桌面：

```text
--- electron-ish procs before (main, by out/main/index.js):
4049178 /tmp/bot-wt/T46cb/app/ui/node_modules/.pnpm/electron@44.7.0/node_modules/electron/dist/electron --disable-gpu /tmp/bot-wt/T46cb/app/ui/out/main/index.js
--- spec regex count:
1
--- $ hivebot serve
hivebot: 已有桌面实例在跑，serve 需先关闭桌面
rc=1
main electron before=1 after=1
（state/hivebot 下只有 dsh launcher.lock logs，没写 serve.json）
```
顺带证明：spec ①/⑥ 用的「零 Electron」正则对真 Electron 主进程确实计到 1——不是空断言。
收尾：bot-reap 桌面 launcher（4048967），trap 收走 SDK/Electron/Xvfb，隔离目录已删。

## 5. 改动范围（验收 4 之一）

`git log --stat 7d2aab58 -1`：只 `app/launcher/hivebot`（+25/-4）、`app/ui/tests/e2e/launcher-serve.spec.ts`（+42）。在边界内，未删弱既有断言。

## 6. 发现（不挡合并）

1. **红跑漏常驻 serve**（低-中）：spec 没有 try/finally，中途断言一红，第一个 `hivebot serve` 及其 SDK 常驻不收。经理两次变异各漏 1 组（已 bot-reap）；另有两组 00:53:27 / 00:53:42 起的 `bash …/T46cb/app/launcher/hivebot serve`（4008709、4010463 及子进程 4008722/4008755、4010469/4010486）是施工方变异遗留，**验收 4「ps 为空」现在不成立**，主 agent 自己 bot-reap。T46b 会反复跑这份 spec，修法写进 queue 提议。
2. **② 加强只查了一个面**（低）：工单要求 stdout、stderr、serve.json、--status 四个面都不含 launch-token 真值，spec 的 `for (const surface of [JSON.stringify(line)])` 只查状态行。读码确认 serve.json 写入（hivebot:179-181）与两处状态行都只 printf base_url/handoff/pid/时间，构造上不含 token，所以接受；随第 1 条一起补。
3. 回执缺验收 2、4 的原样输出——经理已补跑，记一笔：下次回执要把工单列的每条验收都贴上。
