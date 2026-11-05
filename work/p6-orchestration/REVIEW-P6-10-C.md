# REVIEW P6-10 · 方向 C（失败关闭与安全面）

> 转正自 evidence/P6-10-rvw/REVIEW-C.txt（txt 兜底，未经改写）。

P6-10 / C：失败关闭与安全面
commit: 29c6b1a5af425b4260479ddfdd918f795d2cba9b
requested range: 397c7c8..29c6b1a
审查边界：该范围实际含 84 个路径（含 P6-15、P6-21.f1 等其他合并），并非 18 文件；18 文件是 2746c31..29c6b1a。本报告只审该范围内 P6-10 创建、⑤通道与 #20 防提升改动，及理解其安全边界所需的 M1/M2、DshConnection、测试客户端调用方。未审其他任务 UI 和策略变更；未运行全量回归或 e2e。

结论：CONFIRMED critical=0 / major=0 / minor=1。

CONFIRMED
C-1
minor | app/ui/main/m3-meta/orchestrate.ts:350（来源 mintWorkspace:89；透传 app/sdk/src/orchestration/main-channel.mjs:125） | ⑤创建时 dataDir 已成为普通文件，mkdir(workspaces/<id>) 实际抛 ENOTDIR | createWorkerBot 把工作区绝对路径和原始 OS 错误回给⑤，CreateChannel 原样构造 RemoteError，真实 Loader 的 tool/result 文本含完整内部数据路径 /tmp/vfy-r-p610-c/live-private-data-blocked/workspaces/session-<uuid>。实现没有对模型侧消息脱敏。只证实内部绝对路径泄漏，未证实凭证泄漏，未读取任何真实凭证文件内容。 | /tmp/vfy-r-p610-c/probe.mjs 最后一个 probe；/tmp/vfy-r-p610-c/live.mjs 真实 Loader 段；持久副本见本目录 probe.mjs / live.mjs / live-model-result.json / live.log。

复现链：创建临时 dataDir 普通文件 → 真实 main createWorkerBot 返回 pbots/storage → 同 Peer 调 pbots/orchestration.respond → fake 模型调用 create_bot 的实际 tool/result 出现原始路径。存储失败时 dsh 创建调用次数为 0，占位释放为 0；本发现仅信息披露，不是失败后放行创建。
真实输出摘录（live.log）：
CONFIRMED actual model tool/result text Error: pbots/storage: workspace mkdir failed for "/tmp/vfy-r-p610-c/live-private-data-blocked/workspaces/session-8a14e57b-7188-4b30-9601-b374a4abe17a": Error: ENOTDIR: not a directory, mkdir '/tmp/vfy-r-p610-c/live-private-data-blocked/workspaces/session-8a14e57b-7188-4b30-9601-b374a4abe17a'

REFUTED（每项均有实际执行的探针，不仅静态阅读）
1. renderer 能经 M1 调用⑤ requests/respond：REFUTED。probe.mjs 调 registerM1Api，两端点均 pbots/forbidden，底层 RPC 次数 0。
2. renderer 能经 M2 开⑤流或伪造 main 流 item/end/cancel：REFUTED。probe.mjs 调 registerM2Mux，两个⑤ open 被拒，main 归属 streamId 的三个伪造帧被丢弃，socket 上行计数 0、uplinkDropped=3。仅测试协议桥，不操作真实 UI，不涉及截图。
3. 无凭证来源或另一 Peer 能应答 main 的请求：REFUTED。live.mjs 真实 gateway 无 cookie respond 返回 HTTP 401；另一 connect 得到的 Peer 应答当前请求被 pbots/forbidden 拒，原 main 仍可正常 respond。持有相同 operator 权限的独立客户端不是额外认证等级；契约“只认 main”依靠 renderer 白名单隔离和持流 Peer 绑定，不据此误报“有 token 的第二客户端能订阅”为漏洞。
4. 断流重绑后旧 Peer 的请求还能生效或重放：REFUTED。probe.mjs 断开后同 id 和新 id/旧 Peer 都拒；live.mjs 在真实在途请求时 cancel 流，工具得到 main-unavailable，新 Peer 重订阅先得到 ready，旧 Peer 应答已作废请求被拒。
5. 非 main 会话，或 bots.json 缺失/坏 JSON/错误版本/空 mainBotId 时仍能创建：REFUTED。probe.mjs 对每种状态分别跑 when 和 execute，when=false、execute 拒绝、slots.used=0。
6. #20 清空 mainBotId、夹带 bots/createdBy 字段、先换到普通 bot 再设 worker/改回能间接提升：REFUTED。probe.mjs 用真实 BotsMetaStore + registerM3Meta，null/缺字段/worker 及额外字段均拒；main→other 可行，other→worker 拒，other→main 可行；bots.worker.createdBy 保持 main。
7. 超时后迟到成功或迟到 turn/end 导致其他请求占位被二次释放：REFUTED。probe.mjs 第一请求超时归零，第二请求占位为 1；第一请求迟到成功被拒，迟到旧 worker turn/end 不影响第二请求；第二请求成功后自己的 turn/end 释放，重复 turn/end 不再释放。live.mjs 真实 Loader 同样证明 timeout 后 slots=0、迟到 success 被 gateway 拒绝。

运行命令（均临时 HOME，非全量）：
HOME=/tmp/vfy-r-p610-c/home /home/lingxufeng/bot/app/ui/node_modules/.bin/node /tmp/vfy-r-p610-c/probe.mjs > /tmp/vfy-r-p610-c/probe.log 2>&1
HOME=/tmp/vfy-r-p610-c/home /home/lingxufeng/bot/app/sdk/node_modules/.bin/node /tmp/vfy-r-p610-c/live.mjs > /tmp/vfy-r-p610-c/live.log 2>&1
输出：SUMMARY 7 probes passed；LIVE SUMMARY 5 checks passed；两条命令退出码均 0。这里 passed 表示对实际行为的断言成功，包含已确认的信息泄漏，不表示产品无问题。

进程卫生：live.mjs finally 仅调用 /home/lingxufeng/bot/scripts/bot-reap --match /tmp/vfy-r-p610-c，实际清理本探针启动的 start.mjs、dsh 和 esbuild；未调用 Runtime.stop、手工 kill、pkill、killall。随后同参数 --dry-run 无输出。运行时凭证目录由现有 tmp-sweep 在探针退出时删除，不复制到 evidence。
SHA 复核：运行后 HEAD 仍为 29c6b1a5af425b4260479ddfdd918f795d2cba9b。未修改产品代码。

持久证据目录：/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10-rvw/
probe.mjs、live.mjs：独立可运行探针（路径仍指向 /tmp/vfy-r-p610-c，重跑前 mkdir -p 该目录及 home）。
probe.log、live.log：真实输出。
leak-output.txt、live-model-result.json：单元链路错误及真实模型 tool/result。

报告使用 .txt 兜底，遵守当前 reviewer 运行约束“不写报告 .md”；由派发者转正为 /home/lingxufeng/bot/work/p6-orchestration/REVIEW-P6-10-C.md。
