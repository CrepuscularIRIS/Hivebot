# VERIFY P6-10.f1a（P6-10 整体终验）

> 转正自 evidence/P6-10f1a-vfy/VERIFY.txt（txt 兜底，未经改写）。

verdict: PASS
commit: 6028985e75d6cd96744ce1718d8959538f452a16
P6-10 整体判定：PASS；本证据允许合并整条 feat/P6-10。
任务：P6-10.f1a 容量修复验收，含 P6-10 最终定向回归。
分支 / 工作树：feat/P6-10 / /tmp/bot-wt/P6-10

本环境禁止写报告 .md，按输入约定使用本 evidence/P6-10f1a-vfy/VERIFY.txt 兜底，供派发者转正为 work/p6-orchestration/VERIFY-P6-10f1a.md。
E=/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f1a-vfy
O=/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10-vfy
F=/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f1-vfy
下列相对证据路径均相对 E；旧探针文件未修改。

| 验收项 | 结果 | 证据（命令/文件） |
|---|---|---|
| 1 原失败场景独立复测 | PASS，原脚本实测 4 running / slots=3 → 3 running / slots=3，main requests=0；另写真实 Loader 探针明确断言工具错误 pbots/capacity、main requests=0、全部结束 slots=0、下一人工回合 1→0 | extra-original.log、edge.test.ts、edge.log；运行命令见下 |
| 2 根因与释放对称性 | PASS，满额 worker 存入 pending，结束只删 pending 不释放；所有实际释放统一走 Slots.release → onFree → adopt | slots.mjs:59-66/70-80/114-116；create.mjs:118-123（幂等 release）/145-149（完成）/160-162（请求失败或超时）；edge.test.ts 第三例独立执行实际 registerCreateBot 的 execute，注入请求 timeout 拒绝与成功后 turn/end，两路都补收养；再次发 created turn/end 不多扣；edge.log 两种 ACTUAL CREATE 记录 |
| 2 额外坏路径：pending 先于持位者结束 | PASS，先顺序启动并确认三个 holder 正在 running，再启动第四个 pending；第四个先结束时 running=3 / slots=3，create_bot 仍 pbots/capacity、main requests=0；全部结束 slots=0，下一回合 1→0，不多扣、不虚占 | edge.test.ts 第二例（真实 Loader）；edge.log：EDGE first ended pending running=3 slots=3 / EDGE rejected ... pbots/capacity ... main requests=0 / EDGE all ended slots=0 |
| 3 第一场原 8 探针 | PASS，原样 4 files / 8 passed (8) | probes-original.log；M1/M2 主通道封锁、worker 防提升、超时回收/unknown/不重试/迟到回复拒绝、缺 worker 日志、真实 createWorkerBot 默认 preset/title/cwd/持久性、污染回合、人工 worker 容量 |
| 3 第二场全部补充探针 | PASS，原样 3 passed (3) | extra-original.log；混合回合中 worker/user 同 turn、污染拒绝、下一纯用户回合恢复；SDK 自身子进程崩溃后 worker running=false / slots=0、再运行1→0；原溢出场景转绿 |
| 3 SDK create 定向 | PASS，实际 30/30（26+新增4），另有本验收独立实际 execute 双释放路径探针通过；计数差异说明见下 | sdk-directed.log 全量逐项输出；edge.log 第三例 |
| 3 真 Loader live | PASS，11/11（10+新增1），包含原 live 全部项及 f1a 溢出修复 | sdk-directed.log；②′ 容量溢出补收养 24390ms |
| 3 foundation | PASS，50+delivery1=51/51 | sdk-directed.log；四个 SDK 文件总 92 passed (92)，54.22s |
| 3 main m3 | PASS，8 files / 97 passed (97) | ui-m3.log，442ms |
| 4 增量 diff | PASS，baef53c..6028985 恰三文件，无夹带，git diff --check 退出0；独立用文件集合相等断言确认 | diff-files.txt；app/sdk/src/orchestration/slots.mjs、app/sdk/tests/unit/orchestration-create-live.test.ts、app/sdk/tests/unit/orchestration-create.test.ts；125 insertions / 7 deletions |
| 临时 HOME、现场保护及清理 | PASS，每个测试入口均临时 HOME，真实 runtime 的 home/data/fake/overlay 同源派生；新写真实 Loader 探针 finally stop 后删除自建根；没有修改产品代码、旧探针或工作区状态 | 各命令与 edge.test.ts；git status 前后仅 ?? app/sdk/node_modules、?? app/ui/node_modules；bot-reap --dry-run --match p610 退出0、无匹配进程，reap-final.log 为空 |
| HEAD 稳定 | PASS，开始及所有测试后相同完整 SHA | git -C /tmp/bot-wt/P6-10 rev-parse HEAD = 6028985e75d6cd96744ce1718d8959538f452a16 |

计数澄清（不隐藏与派发口径的差异）：
派发写 create“26+新5”，但 git diff baef53c..6028985 实际新增4个 it，文件实际为30项；builder REPORT 同样申报30。独立按 verbose 日志逐条统计 create=30、live=11、foundation=50、foundation-delivery=1，无跳过项，SDK总92。没有将30写成31。本验收额外新增1项实际 create execute 的双释放路径检查（含超时/完成两个格子），再加2项真实 Loader 边角，全部3/3通过，补充而非改动原测试。全部指定文件、两场旧探针和新增边角均已跑绿，数量文字差异不属于漏跑测试。
本次新鲜执行共203个通过项：SDK92 + m3 97 + 原探针8 + 上场补充3 + 本场补充3。未跑全仓回归或全套 e2e。

复跑命令（全部由验收员本场独立执行）：
1. cd /tmp/bot-wt/P6-10/app/sdk
   HOME=/tmp/bot-p610f1a-vfy-sdk-home ./node_modules/.bin/vitest run tests/unit/orchestration-create.test.ts tests/unit/orchestration-create-live.test.ts tests/unit/orchestration-foundation.test.ts tests/unit/orchestration-foundation-delivery.test.ts --reporter=verbose
   输出尾：Test Files 4 passed (4) / Tests 92 passed (92)。证据 sdk-directed.log。
2. cd /tmp/bot-wt/P6-10/app/ui
   HOME=/tmp/bot-p610f1a-vfy-ui-home ./node_modules/.bin/vitest run tests/unit/m3 --reporter=verbose
   输出尾：Test Files 8 passed (8) / Tests 97 passed (97)。证据 ui-m3.log。
3. 同 ui 目录：HOME=/tmp/bot-p610f1a-vfy-probes-home ./node_modules/.bin/vitest run --config /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10-vfy/probe.config.mjs
   输出尾：Test Files 4 passed (4) / Tests 8 passed (8)。证据 probes-original.log。
4. 同 ui 目录：HOME=/tmp/bot-p610f1a-vfy-probes-home ./node_modules/.bin/vitest run --config /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f1-vfy/extra.config.mjs
   输出尾：OVERFLOW all workers running=4 slots=3；OVERFLOW after first end running=3 slots=3；OVERFLOW ... main received create requests=0；Tests 3 passed (3)。证据 extra-original.log。
5. 同 ui 目录：HOME=/tmp/bot-p610f1a-vfy-probes-home ./node_modules/.bin/vitest run --config /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f1a-vfy/edge.config.mjs
   输出尾：ACTUAL CREATE timeout release adopts pending; duplicate end preserves slot; final=0；ACTUAL CREATE complete ... final=0；Tests 3 passed (3)。证据 edge.log。
6. git -C /tmp/bot-wt/P6-10 diff baef53c..6028985 --name-status
   git -C /tmp/bot-wt/P6-10 diff baef53c..6028985 --check
   Python set(actual name-only)=={slots.mjs,create.test.ts,create-live.test.ts 的完整路径}：PASS。
7. /home/lingxufeng/bot/scripts/bot-reap --dry-run --match p610
   退出0，无匹配。未实际执行清理 kill，也未触及沙箱外进程。

边界：本任务为 SDK/main 后端容量修复，无 UI 改动或浏览器旅程要求，未启动 Electron/截图。崩溃探针仅由测试脚本对自己 launchRuntime 启动的 SDK/dsh 子进程模拟崩溃；没有 shell 手工 kill、批量按名杀进程、桌面注销或机器重启。evidence 仅保存脚本与日志，不保存 runtime、handoff、凭证。
运行机器 vmstat 实测 iowait=0%、CPU idle=87%，仅运行指定定向组。
透明记录：一次辅助日志计数 Python 单行命令有语法错误，未触发测试或改代码；随后改用独立 Python heredoc 成功统计30/11/50/1并验证精确diff集合，不将辅助命令错误混作产品缺陷。

新问题（每条一行，可直接成为修复任务）：
- 无 [FIX]；上一场容量漏计的唯一失败已独立复现转绿。
