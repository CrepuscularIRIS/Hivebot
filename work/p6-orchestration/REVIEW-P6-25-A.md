# REVIEW P6-25 · 方向 A（信任边界与输入）

> 转正自 evidence/P6-25-rvw/REVIEW-A.txt（txt 兜底）。

P6-25 code review — A：信任边界与输入
commit: be374843f45a87a1fe77ec67d042ab8563b7715a
range: 60e8b02..be37484
结论：本方向无 CONFIRMED（critical 0 / major 0 / minor 0）。

审查边界
- 只审指定三个产品/测试文件差异，补读理解路径判定所必需的 resolve.mjs、guard.mjs 的 extractPaths，以及 containment.mjs 的 isPathUnder。
- 核对本机已装 dsh 0.2.2-alpha.2 的 dsh-tool-fs 注册 schema / execute、dsh-tools defineTool 校验、dsh-fs-local resolve；没有扩大为全仓审查。
- 复现调用真实 shell-ask listener、真实已装 LocalFileSystem.resolve/writeText/editText 与 defineTool.execute，不是自写路径归一化 mock。注册用轻量 ctx，policy-state 使用临时 HOME 下从未创建的状态文件。没有启动完整 launcher/网络/模型服务，所以不声称进行了完整端到端验收。
- 产品代码与必要本地调用链经 git diff --exit-code be37484 核对一致，审查前后 HEAD 均为上述完整 SHA。

实跑证据
1. cd /home/lingxufeng/bot && HOME=/tmp/vfy-r-p625-a/home node /tmp/vfy-r-p625-a/probe.mjs
   exit 0。64 格，策略未捕获异常 0，deny 12，工具层拒绝 36，工作区内实际写/改成功 16，区外预置文件逐格保持 before，最大单格 221ms。
2. cd /home/lingxufeng/bot/app/sdk && HOME=/tmp/vfy-r-p625-a/home pnpm exec vitest run tests/unit/policy.test.ts
   exit 0。Test Files 1 passed (1)，Tests 70 passed (70)。没有跑全量回归或全套 e2e。
3. /home/lingxufeng/bot/scripts/bot-reap --dry-run --match vfy-r-p625-a
   exit 0，输出为空，无匹配进程；本探针没有 spawn 后台子进程，没有实施杀进程动作。

疑点及实际结果（全部 REFUTED；不是待修复项）
REFUTED | app/sdk/src/policy/shell-ask.mjs:329 | file_path 缺失/null/空串/数字/布尔/对象/数组，或 arguments 本身为 null/数组/字符串 | extractPaths 返回零候选，策略 next；真实 defineTool.execute 对缺失/类型错误抛 ToolArgsError，空串由 parseWriteArgs/parseEditArgs 拒绝，无写入、listener 不崩。这里的 next 不等于完成写入，不能据此报绕过。空白串会进入 resolve，解析失败后策略 deny | /tmp/vfy-r-p625-a/probe.mjs
REFUTED | app/sdk/src/policy/shell-ask.mjs:328-342 | file_path 含 NUL，100000 字符单段，或 3000 层目录 | NUL 和超长单段 resolve 失败，策略 deny；长目录拼写可解析为区内缺失后缀而 next，真实写/改以 ENAMETOOLONG 拒绝，后续合法调用继续成功。未发生区外写入或策略崩溃 | /tmp/vfy-r-p625-a/probe.mjs
REFUTED | app/sdk/src/policy/shell-ask.mjs:328-342 | 相对 inside.txt、../outside.txt、区外绝对路径 | 区内相对写/改真实成功；../ 与区外绝对目标均 deny；区外文件逐格内容不变 | /tmp/vfy-r-p625-a/probe.mjs
REFUTED | app/sdk/src/policy/shell-ask.mjs:328-342 | file:///tmp/vfy-r-p625-a/outside.txt、C:\tmp\outside.txt、..\outside.txt、UNC、混合 ../ws\../outside.txt | 当前 Linux 上 file:// 和纯反斜杠是普通本地路径拼写。write 实际落点均在 /tmp/vfy-r-p625-a/ws/ 下，edit 也解析到同一工作区内落点（因已被 write 改为 after，old_string 不匹配而拒绝）；混合形式判外 deny。未按 URL 解码为区外目标。没有验证 Windows 宿主运行行为 | /tmp/vfy-r-p625-a/probe.mjs
REFUTED | app/sdk/src/policy/shell-ask.mjs:328-329；app/sdk/src/policy/guard.mjs:96-97（必要调用链） | path/filePath/filename/file/target_path 别名，单独提供或与区内 file_path 同时提供区外别名 | 真实注册 schema 的唯一必需路径字段是 file_path，无其他路径别名。别名单独提供均被缺失 file_path 的 ToolArgsError 拒；同时提供时真实工具只使用 file_path，实际修改 inside.txt，不使用区外别名。parseWriteArgs/parseEditArgs 返回对象内部的 filePath 不是输入字段别名 | /tmp/vfy-r-p625-a/probe.mjs

持久证据目录（不含运行时 HOME、凭证或 SDK 数据）
/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-25-rvw/
- probe.mjs：探针副本；原始运行路径 /tmp/vfy-r-p625-a/probe.mjs。
- schemas.json：由真实上游 apply 注册捕获的 write/edit JSON schema。
- results.json：64 格逐项结果、实际 canonical 落点、错误类型与耗时。
- output.txt：最后一次成功运行汇总。
- unit.txt：独立定向单测输出。
- reap.txt：进程检查输出（空文件，命令 exit 0）。

报告按本会话禁止写报告 .md 的约束落到指定 evidence 文本兜底；未尝试或声称 .md 写入被拒，交派发者转正。
