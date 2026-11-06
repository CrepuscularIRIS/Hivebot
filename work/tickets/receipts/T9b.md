# 回执 T9b：fs-zone-ssh 五写入口 + D2 远端根/词法化/校验

> 施工：main (GLM 5.3) | feat/T9b @ /tmp/bot-wt/T9b | 2026-11-06 16:5x-17:1x
> 工单：doing/T9b-fs-zone-ssh.md（DESIGN D1/D2 r3 转实体）

## §1 D1：fs-zone-ssh（先红 + 六格 + 两变异）

先红（①b 先红段，原版 fs-ssh）：
```
$ vitest run tests/e2e/ssh-fs-zone.test.ts → ①b 先红段 1 passed
```
（原版写远端 /tmp/x 成功且读回 'leak'——远端围栏 writableRoots 含 /tmp 坐实。）

产品（`src/policy/fs-zone-ssh.mjs`）：五入口 `resolve(displayPath)`（一次 RPC）
→ zoneGuardSsh（NEVER 任意 mode / 可写根词法判定）→ super（远端再 resolve）。
moveFile 源与目标各判。

六格全绿：①a 区内成功 / ①b /tmp 拒+文件不存在 / ①b′ remoteHome 拒 /
①c ws→remoteHome 链接拒 / ①d NEVER 升权（组合级 danger-full-access）仍拒 /
② patch-delete-move-edit 拒区外（moveFile 双向）/ ③ 白名单防漂移格。

变异：M1（writeText 去 guard）→ ①b `promise resolved "{operation:'create'…}"
instead of rejecting`；M2（editText 去 guard）→ edit 格 `expected … got
'[{ "expected": "boolean"…'`（RPC 已发出=没拦在本地）。均 cp 还原。

## §2 D2：containment 词法化 + remoteRoots + guard 校验 + start 接线

- `containment.mjs`：`P2SDK_SSH_MODE==='1'`（调用时读）→ 词法不中直接
  false（不落宿主 stat）。单测三态：本机别名等价根回退仍真 / ssh 纯词法假 /
  ssh 词法命中仍真。6 passed。
- `never-roots.mjs`：`remoteRoots()` 纯函数（非通配凭证项拼 remoteHome；
  policyRoots=helper 安装目录缺省空）。
- `guard.mjs`：remoteHome 校验（ssh.ready → fs.resolve('~') 比对，不等抛
  `does not match the remote home`；fire-and-forget 拒绝态）。单测三态 26 passed。
- `start.ts`：第六可选变量 `P2SDK_SSH_REMOTE_HOME`（sshKeys 删除表 +1）；
  sshRows 插 `p2sdk-fs-zone-ssh`（neverRoots=远端硬 NEVER；缺省 ` []`）并
  禁原版 fs-ssh 行；T9a-① 断言更新（`fs-zone.mjs` 不含 + `fs-zone-ssh.mjs`
  含 + `neverRoots: []` 缺省）。

## §3 回归（隔离 HOME/TMPDIR/DBus）

```
start 42 / containment 6 / guard 26 / ssh-fs-zone 6 /
guard-plugin-manager 7 / fs-zone-write-entries 3（本机五入口不动）/
ssh-product 3（跑后进程残留 0）
```

## §4 施工坑（记 LEARNINGS 候选）

1. **块注释里的 `*/`**：注释写 `.config/**/credentials*` 把块注释提前关闭
   → 裸 token SyntaxError（never-roots 追加段）。
2. **python heredoc `\\n`**：再犯一次（start.ts 模板串嵌真换行断字符串），
   本次改 sshNeverList helper + Edit 工具修。
3. FileSystem 基类构造器 `super(ctx,'fs')` 只收 ctx；`resolve()` 收 string
   非 descriptor（用 displayPath）；cordis 插件包装与 `#私有` 方法相斥。

## §5 改动面

`git diff --stat <起点>..HEAD`：fs-zone-ssh.mjs（新）、ssh-fs-zone.test.ts（新）、
containment.mjs、never-roots.mjs、guard.mjs、start.ts、start/guard/containment
.test.ts（+回执）。
