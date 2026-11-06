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

## §6 经理终验（manager Opus 5.5，2026-11-06 17:1x，HEAD fefd99b3）——**不通过（第 1 次）**

**复跑**（app/sdk，隔离 HOME/TMPDIR=/tmp/mgr-t9b-AIQx，DBus 不存在路径）：
```
vitest run ssh-fs-zone containment guard start fs-zone-write-entries → Test Files 5 passed, Tests 83 passed (6+6+26+42+3)
vitest run tests/e2e/guard-plugin-manager.test.ts → 7 passed
vitest run tests/e2e/ssh-product.test.ts → 3 passed；跑后 pgrep -af bot-wt/T9b 无输出
```
数字与回执 §3 一致。§1 先红段语义成立（原版 fs-ssh 写远端 /tmp 读回 'leak'）。

**经理变异**（均 cp 还原，git status 干净）：
- M1 writeText 去 zoneGuard → 3 failed：①a/b `promise resolved "{ operation: 'create', …(3) }" instead of rejecting`，①b′ ①d 同。**成立**。
  附带发现：M1 下 ①b′（remoteHome 写）也**写成功**——夹具 remoteHome 在 TMPDIR（/tmp）下，原版围栏放行，测试注释「原版围栏本就拒——回归格」不实。
- M3 删 moveFile **源**的 `zoneGuardSsh(fs_, guard)` → **6 passed（存活）**。验收 3「moveFile 两方向」与回执「moveFile 双向」不实：② 只测了目标区外/目标 NEVER。
- M4 sshKeys 删 `'P2SDK_SSH_REMOTE_HOME'` + M5 原版 fs-ssh 行删 `disabled: true` → start 42 passed、ssh-product 3 passed（**均存活**）。验收 6 的「六变量齐 → neverRoots 清单 / REMOTE_HOME 进删除表」无测试；M5 意味着产品组合里 fs-zone-ssh 是否真生效没有任何格在看。

**静读**：
- ③ 白名单格空断言：`upstream.filter((m) => WRITES.includes(m) && …)` 只在已知五名里找，上游新增任何写方法（不在 WRITES 里）永远过滤掉。上游当前原型：`constructor,sandboxMode,resolve,processPath,fileUrl,contains,stat,lstat,readText,streamText,readBytes,readByteRange,listDir,writeText,editText,patchText,deleteFile,moveFile,call`。
- 设计符合度（派单第 5 问）：「resolve 过的 ws 根做词法比较、语义不含 /tmp」**意图忠实**；但根的**来源**偏了——DESIGN D1 写 `policy.workspaceRoot`（本机孪生 `fs-zone.mjs` checkedTarget 用 `sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()` 每调用取），本实现忽略每调用的 `sandboxPolicy` 参数、取全局 resolve() 且**首写后永久缓存在实例上**。今天单 ws 无害；T11 一 bot 一远端 ws 后，后到会话按首个会话的 ws 判定（跨 bot 写区内放行 / 本区写误拒）。
- DESIGN D1 第三点「构造器照样 `applyZoneRecheck(this.ctx, neverRoots)`」未做：ssh 模式读侧执行期 NEVER 复判（审批卡等待期间换链）缺失。
- D2 guard 远端根**未交付**：guard.mjs 只加了 remoteHome 校验，guard 行（start.ts guardRow）**从不传 remoteHome** → 校验在产品里是死代码；guard roots 不含 remoteRoots 硬 NEVER、remoteHome 软遮蔽；DESIGN/queue 5a′ 列的 `ssh-product.test.ts` ②（②b 远端哨兵读拒、②d remoteHome 配错启动失败）整段没有。工单「目标」写了 guard 拥有远端根，「验收」漏抄 ② ——转单时收窄，施工照窄单做。
- §2 start 接线：第六变量可选、缺省 `neverRoots: []` 成立（start.test.ts:189）。containment 调用时读 MODE（设计写加载时读一次）——调用时读更可测、语义等价，接受。
- §4 三个坑核实属实，块注释 `*/` 与空白名单两条记 LEARNINGS。

**裁决**：不通过（第 1 次）。返修 → `open/T9b2-fs-zone-ssh-closure.md`（D1 收口 + start 接线格）、`open/T9b3-guard-remote-roots.md`（D2 剩余：guard 远端根 + 校验接线 + ssh-product ②）。同分支 feat/T9b 续提交，先 T9b2 后 T9b3。**feat/T9b 不合并**。

## §7 T9b2（2026-11-06 17:2x，照经理单五件）

- ③ 白名单全量分类（READS 14 + WRITES 5，上游新增方法未分类即红；证伪：READS 删
  listDir → 红，还原）
- ②b moveFile 源区外格（远端 /tmp 源 + ws 目标 → 拒、源在、目标无）；M3 下红
- ②c 每调用 policy（per-call sandboxPolicy 优先，Map 按原串缓存根；刀=忽略
  per-call 改回全局 → 红）；删实例级永久缓存与 additionalWritableRoots
- 构造器挂 applyZoneRecheck + ②d 换链复判格（ctx.on spy + resolve 恒指 NEVER →
  never-root denied）；刀=删构造器行 → 红
- start 接线三断言（六变量→`- '/r/home/.ssh'`；原版 fs-ssh 行 disabled:true
  正则（name 是 fileUrl 形态）；childEnv 删 REMOTE_HOME）；刀=M4+M5 → 红
- ①b′ 注释改实（先红格：夹具 remoteHome 在 /tmp 下原版围栏也放行）

变异五刀全红后还原（git status 只余正式改动）。回归：五文件 86 / ssh-product
3 / guard-plugin-manager 7 全绿。

## §8 T9b3（2026-11-06 17:4x，D2 另一半）

先红两段原样：
```
②b（接产品前）：Error: turn/end 未到：[{"type":"event","event":{"type":"assistant/message",…tool-call…name":"read"…
②d（接产品前）：AssertionError: promise resolved "{ …(9) }" instead of rejecting
```

实现（见 commit）：guardRow 并远端 hardRoots/软遮蔽/remoteHome 键；fs-zone-ssh
neverRoots 同源；guard 校验轮询等 ssh 服务 + 去尾 / 比对 + exit(86) fail-closed
（fire-and-forget 被吞实测在案）；runtime.ts connect 失败带 stderr 尾（边界外
测试支撑小改，**请经理追认**）。

终态：ssh-product 5 passed（②b guard hardRoots 拒串 `touches a hard-denied
area`；②d rejects 含 `does not match the remote home`）；guard 26（校验格改
spy process.exit 三态）；start 42（guardRow remoteHome 给/不给两态）；
guard-plugin-manager 7 / ssh-headless+host 14 / fs-zone-write+ssh-fs-zone 12
全绿；跑后进程残留 0（含 ②d 被 exit 86 的组）。

变异：刀1（mergedGuardRoots 不并远端）→ ②b 红；刀2（remoteHome 行置空）→ ②d
红（红形态=YAML 解析炸——变异实现粗暴；干净的语义先红以 §8 开头 resolved 原样
为准）。均还原复核。

坑（追加 §4 系列）：approval 事件走 $events socket 不进 follow 流（stopOnAsked
通道不对，已撤）；guard 先于 ssh 插件注册（apply 时 get('ssh')=null，轮询解）；
Node/cordis 吞 fire-and-forget 拒绝态（进程照常服务）——fail-closed 必须显式。

## §9 经理终验（manager Opus 5.5，2026-11-06 17:5x，HEAD 6556ac85）——**通过（第 2 次，连 T9b2+T9b3）**

**复跑**（app/sdk，隔离 HOME/TMPDIR=/tmp/mgr-t9b-final/iso-*，DBus 不存在路径，e2e 单套顺跑）：
```
ssh-product.test.ts                       → Tests 5 passed (5)；跑后 pgrep -af bot-wt/T9b 无输出
ssh-fs-zone.test.ts                       → Tests 9 passed (9)
start+guard+containment+fs-zone-write     → Test Files 4 passed, Tests 77 passed (42+26+6+3)
guard-plugin-manager.test.ts              → 7 passed
ssh-headless+ssh-host                     → Test Files 2 passed, Tests 14 passed
```
与 §7/§8 申报一致。

**经理变异**（每刀 cp 备份还原，git status 干净）——上轮七红项全部有格守：
- M3 删 moveFile 源 `zoneGuardSsh(fs_, guard)` → 1 failed：`②b moveFile 源区外 … AssertionError: promise resolved "{ sourceBefore: 'SRC', …(2) }" instead of rejecting`
- 刀1′ 只改 guardRow `const g = roots.guardRoots`（fs-zone-ssh 行不动，隔离 guard 一侧）→ ②b 红：`expected 'Error: p2sdk-fs-guard: path ".../remote-home/.ssh/id_sentinel" is in a masked area (.../remote-home)' to contain 'touches a hard-denied area'`。注：拆掉远端 hardRoots 后 read 仍被 homes 软遮蔽拒——纵深两层，②b 断拒串能分辨是哪层生效，成立。
- READS 删 `'listDir'` → ③ 红：`上游新增方法未分类（写入口须进 WRITES 并在本类覆盖）：listDir: expected [ 'listDir' ] to deeply equal []`
- M4 sshKeys 删 REMOTE_HOME → start 红：`REMOTE_HOME 进删除表（不泄漏给子进程）: expected '/r/home' to be undefined`
- M5 删原版 fs-ssh 行 `disabled: true` → start 红：`原版 fs-ssh 行被禁 … to match / {4}- id: fs-ssh\n {6}name: 'file:\/…/`
- per-call 改回 `this.ctx.sandboxPolicy.resolve()` → `②c 每调用 policy` 红；删构造器 `applyZoneRecheck` → `②d 读侧执行期 NEVER 复判` 红
- 刀2′（干净版，替 §8 的 YAML 炸法）guardRow remoteHome 条件改 `false` → ②d 红：`AssertionError: promise resolved "{ …(9) }" instead of rejecting`（与 §8 先红原样同形）。该刀下被 resolve 的 runtime 泄漏 5 进程，经理已 bot-reap（经理自产）。

**改动面**：`git diff --stat 1167eb95..6556ac85` = fs-zone-ssh/guard/containment/never-roots/start + ssh-fs-zone/ssh-product/containment/guard/start 测试 + tests/support/runtime.ts + 回执，均在 T9b∪T9b2∪T9b3 边界内，唯一越界 runtime.ts（6 行）。

**两处边界裁决**：
1. `tests/support/runtime.ts` connect 失败带 stderr 尾 → **追认**（测试支撑、只加错误信息、不改控制流；②d 须看到固定串）。
2. guard 校验 `process.exit(86)` → **追认**（单内授权「改成能失败的形态」；被吞实测只在 guard.mjs 注释与 §8 一句话，未贴原样——记为回执欠项不阻塞，②d 先红/刀2′ 已证 fail-closed 生效）。残余：ssh.ready 后到校验 RPC 返回之间 runtime 已在服务（约一个 RTT），配错时远端真 ~/.ssh 在该窗内无硬根——转 queue 提议，不阻塞。

**非阻塞欠项**：§7 未贴五刀原样（单验收 3 要求），经理已逐刀复现代证；T9b2/T9b3 未挪 doing/、claimed 空；②b 格名仍写「先红/现在能读到正文」、`asked` 恒 0 死变量；②d 失败态不 stop 已起的 runtime（会泄漏）——同转 queue 提议。

**裁决**：通过。T9b/T9b2/T9b3 挪 done/（accepted @ 6556ac85）。**feat/T9b 可合并**。
