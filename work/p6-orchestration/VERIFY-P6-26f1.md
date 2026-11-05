# VERIFY P6-26.f1（P6-26 整体终验）

> 转正自 evidence/P6-26/VERIFY-f1.txt。P6-26 整体判定：PASS（读侧 fd 身份绑定 + 根目录规范化；与 P6-26t 同文件不重叠，三方合并通过）。

verdict: PASS
commit: d09a48fcae067a1628eb0084ebd011a0982c1a76
P6-26 整体判定: PASS
branch: feat/P6-26
worktree: /tmp/bot-wt/P6-26
日期: 2026-11-05

依据 /home/lingxufeng/bot/work/p6-orchestration/VERIFY-P6-26.md 的两条 [FIX] 复验；本轮独立执行，不采用 builder 输出替代运行。报告按本会话禁止写报告 .md 的约束落到用户指定的 TXT 备用位置。
以下证据目录 E = /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-26/。

| 验收项 | 结果 | 真实环境证据（命令/文件） |
|---|---|---|
| FIX-1：软链/别名 cwd 下区内 read / read_image / present 不误伤；真实 cwd 仍正常 | PASS | E/alias-f1-vfy.test.ts 复用上次 write-outside 真 Loader harness 和原 vfy-alias.tail.ts；额外逐格验证 alias/real cwd × read（别名及真实路径）/read_image/present，必须存在 tool result、isError=false、0 审批卡，文本 read 必须含 VFY-F1-CONTENT。E/alias-f1-vfy.log：1 file / 2 tests passed，exit=0；547 项回归中的 builder alias Loader 用例也独立通过。 |
| FIX-1：软链/别名 cwd 下 listDir，包含根目录与子目录 | PASS | E/seam-f1-vfy.mjs 的 N6 在 alias workspace scope 中依次 listDir(alias root)、listDir(real root)、listDir(alias/sub)，断言真实目录项；E/seam-f1-vfy-expanded.log:20–22 返回 ["sub"]、["sub"]、["a.txt","big.txt"]。N2 真实工作区根列目录也正常；unit 中 5 种别名根后端读取全部绿。 |
| fd 身份绑定不回退：区外与假凭证仍拒，打开后保持原对象 | PASS | 复用独立 seam，S1 的 readText/readBytes/streamText/listDir/stat 五格全部 FS_PERMISSION_DENIED；S5 两种换链时点全部 never-root；S2 上游 stat 后换链仍读到已打开区内对象 len=300000 head=bbbbb。E/seam-f1-vfy-expanded.log:1–8。定向 write-outside 真 Loader 内层接缝也通过。 |
| 审批按真实路径匹配；批准 A 后换链到 B 仍拒 | PASS | 独立 S4a/b 批准 A、批准 A 的别名均读到 APPROVED-OUTSIDE；S4c A→B、S4d 快照 B/实际 C 都 FS_PERMISSION_DENIED，E/seam-f1-vfy-expanded.log:9–12。unit 对 before-execute 和 inside-execute 两格均通过。 |
| stream 中止及时关闭 fd；1000 次混合读不涨 fd | PASS | 独立 S7：base=21，during=23，中止且不再 next 后=21；S6：1000 次混合读 base=21 after=21，500 次预期异常，procLeak=0。E/seam-f1-vfy-expanded.log:18–19。 |
| FIX-2：缺失文件为 not found 类，FS_NOT_FOUND 不变 | PASS | 独立 S6 实际缺失消息为 cannot read "…/missing": not found；额外 Loader matrix 在 alias/real cwd 分别读 missing-vfy-file，均断言 isError=true、not found、0 卡；unit 实际运行断言 ENOENT / ENOTDIR 的 code=FS_NOT_FOUND 与对应消息。E/alias-f1-vfy.test.ts、E/seam-f1-vfy-expanded.log:19、E/regression-f1-vfy.log。 |
| 定向 + unit 全绿 | PASS | 本轮亲自运行 tests/unit + guard-fs / guard-escalation / guard-plugin-manager / approval / write-outside / tiers-policy / w1ap0-matrix：32 files / 547 tests passed，exit=0，耗时 97.85s。E/regression-f1-vfy.log。没有跑全量回归或全套 e2e。 |
| shell-ask 与已合并 P6-26t 改动不重叠 | PASS | 以 75267c6 为 base，本分支旧侧 hunk 为 @@ -321 +321,4 与 @@ -360 +363；已提交 P6-26t@62f94c3 为 @@ -259 +259,8。git merge-file -p 两侧对同一 base 试合并 exit=0，node --check 合并输出 exit=0。E/merge-f1-vfy.log、E/shell-ask-merged-vfy.mjs。主会话仍须三方合并，不能整文件 checkout 覆盖 P6-26t。 |
| HEAD / 产品现场 / 进程清理 | PASS | 结束时 HEAD 仍 d09a48fcae067a1628eb0084ebd011a0982c1a76，git status --short 为空；bot-reap --dry-run --match p626 exit=0，输出为空，E/cleanup-f1-vfy.log。 |

主要复现命令（本轮已执行）
1. HOME=/tmp/bot-p626f1-vfy-home pnpm -C /tmp/bot-wt/P6-26/app/sdk exec vitest run tests/unit tests/e2e/guard-fs.test.ts tests/e2e/guard-escalation.test.ts tests/e2e/guard-plugin-manager.test.ts tests/e2e/approval.test.ts tests/e2e/write-outside.test.ts tests/e2e/tiers-policy.test.ts tests/e2e/w1ap0-matrix.test.ts
   输出尾部：Test Files 32 passed (32)；Tests 547 passed (547)；exit=0。
2. HOME=/tmp/bot-p626f1-vfy-home node /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-26/seam-f1-vfy.mjs /tmp/bot-wt/P6-26 f1
   输出尾部：N6 三种路径列出正确目录项；LEAK /proc/self/fd anywhere in outputs: false；exit=0。
3. HOME=/tmp/bot-p626f1-vfy-home pnpm -C /tmp/bot-wt/P6-26/app/sdk exec vitest run --config /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-26/alias-f1.config.mjs
   输出尾部：Test Files 1 passed (1)；Tests 2 passed (2)；exit=0。
4. /home/lingxufeng/bot/scripts/bot-reap --dry-run --match p626
   输出为空；exit=0。

探针校正记录
- 第一版补充矩阵把目录交给了文件 read 工具，得到 not a regular file；原始失败保留于 E/alias-f1-invalid-directory-read.log。
- 已读已安装 dsh-tool-fs/lib/index.js:191–198：resolveRegularReadTarget 明确拒绝非普通文件，因此该格不是 listDir 验证，也不是本产品回归。
- 最终矩阵只对合法文件入口发工具调用；目录改由同一真实后端的 N6 listDir 三格断言，全部通过。未改动产品或产品测试来取得绿灯。

边界与整体判定
- 本任务是 SDK 读侧修复，没有 UI 改动；本轮未启动桌面窗口，无需截图。
- 全程临时 HOME；仅使用 /tmp 内测试生成的假凭证，未读真实凭证；只由测试 runtime.stop 结束自己 spawn 的 SDK 子进程，未手工 kill、未重启机器。bot-reap 自查无残留。
- 此 PASS 覆盖 P6-26 读侧身份绑定及 f1 修复，不宣称 P6-27 的写侧/搜索挂载视图问题已解决；glob/grep 移交边界沿用原任务范围。
- 原 VERIFY-P6-26 的两条 [FIX] 均已关闭；在上述范围内 P6-26 整体 PASS。HEAD 改变须重新验收。

新问题：无 [FIX]。
