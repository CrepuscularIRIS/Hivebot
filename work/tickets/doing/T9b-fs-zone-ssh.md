# T9b：fs-zone-ssh（五写入口）+ guard 远端根 + containment 词法化 + remoteHome 校验

> 开单：main 照 DESIGN-ssh-composition D1/D2（r2+r3 已按 rc.1 更新）+ queue 5a′ 行转实体 | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：DESIGN-ssh-composition.md §D1 §D2（manager 多轮定稿）；前置 T9a/T16/T9af 均已合并
> 分支 / 作业目录：feat/T9b @ /tmp/bot-wt/T9b
> claimed：2026-11-06 16:5x @ f01eb580+（T9af 合并后主线）
> accepted：
> 终验：2026-11-06 17:1x manager **不通过（第 1 次）** @ fefd99b3——M3/M4/M5 三刀存活、③ 白名单空断言、每调用 policy 与 applyZoneRecheck 偏设计、D2 guard 远端根与 ssh-product ② 未交付（转单时验收漏抄）。返修 open/T9b2 → open/T9b3（同分支顺序施工），见 receipts/T9b.md §6

## 目标
ssh 模式的文件工具安全闭环：远端五写入口经 zoneGuard 拒区外/NEVER（P6-25 决策 37 的 ssh 版）；guard 拥有远端根（remoteHome 硬 NEVER + 软遮蔽 + helper 安装目录写保护）；containment 在 ssh 模式纯词法（宿主 stat 对远端路径无意义）；remoteHome 启动校验 fail loud。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md、DESIGN-ssh-composition.md §D1 §D2（全文，锚点已按 rc.1 更新）
2. `src/policy/fs-zone.mjs`（ZoneCheckedFileSystem 同款写法）、`src/policy/containment.mjs`、`src/policy/never-roots.mjs`、`src/policy/guard.mjs`、`src/start.ts`（fsSandboxRow/sshRows/五变量）
3. `tests/e2e/ssh-host.test.ts`（startSshHost 进程内组合）、`tests/unit/fs-zone-write-entries.test.ts`（本机五入口证明格）

## 边界
1. 只动：`src/policy/fs-zone-ssh.mjs`（新）、`src/policy/containment.mjs`、`src/policy/never-roots.mjs`、`src/policy/guard.mjs`、`src/start.ts`、对应测试（新 `tests/e2e/ssh-fs-zone.test.ts` + containment/start 单测）、回执。`runtime-patch` 生成与 `P2SDK_SSH_REMOTE_HOME`（第六变量）进 start.ts 的 sshKeys 删除表。
2. 先红：①b 先红法（DESIGN §D1 验证节）——先挂原版 fs-ssh 跑同一 writeText 到远端 /tmp 应**写成功**（远端围栏含 /tmp），再挂 fs-zone-ssh 应拒。
3. 测试走隔离 HOME/TMPDIR/DBus；ssh 夹具用 startSshHost；e2e 同刻一套。
4. 超出边界停下写回执。

## 验收（写命令，不写感觉）
1. 先红：①b 两段原样（原版 fs-ssh 写成功 + fs-zone-ssh 拒）。
2. ssh-fs-zone.test.ts：①a 区内成功且内容正确 / ①b 远端 /tmp 拒 WRITE_OUT 且文件不存在 / ①b′ remoteHome 拒（回归格）/ ①c ws 内指向 remoteHome 的链接拒 / ①d NEVER（danger-full-access 仍拒）/ 白名单防漂移格（枚举原型方法名 ⊆ 五入口白名单，上游新增写入口即红）。
3. 五入口：patchText/deleteFile/moveFile（源与目标）各一格拒区外（moveFile 两方向）。
4. 变异：去 writeText 的 zoneGuard → ①b/①d 红；去 editText 的 → edit 格红（贴原样，cp 还原）。
5. containment 单测：P2SDK_SSH_MODE=1 时 isPathUnder 纯词法（假路径不 stat）；未设时行为不变（宿主回退仍走）。
6. start 单测：六变量齐 → patch 含 fs-zone-ssh 行、不含本机 fs-zone 插入；REMOTE_HOME 进删除表；缺 REMOTE_HOME 可选（六选五也能起？——按 D13：remoteHome 可选，缺省=不做远端根）。
7. guard remoteHome 校验：配置 ≠ 远端实际（resolve('~')）→ 插件抛错（单测假 ssh.ready + 假 fs.resolve）。
8. 回归：ssh-product 3 / guard-plugin-manager 7 / guard+start unit / fs-zone-write-entries 3（本机侧不动）全绿。
9. 改动面：git diff --stat 只边界 1 清单。

## 为什么这样验收
D1 选 3（继承 provider）的真实收益是「provider 层兜底所有写入调用方」（不走 tools 管线的内部写入、T11 skill 复制）；先红法证明远端围栏确实放 /tmp（不是我们树稻草人）；白名单格防上游再新增写入口时静默漏盖；词法化与 remoteHome 校验是 D2 的 fail-loud 链（配错不静默失守）。

## 产出
- 新建：src/policy/fs-zone-ssh.mjs、tests/e2e/ssh-fs-zone.test.ts
- 修改：containment.mjs、never-roots.mjs、guard.mjs、start.ts、tests/unit/{containment,start}.test.ts（或并入既有文件）
- 回执：work/tickets/receipts/T9b.md
