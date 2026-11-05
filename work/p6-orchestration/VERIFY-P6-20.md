# VERIFY P6-20

> 转正自 evidence/D3-orch/VERIFY.txt。数据可信（48 组独立重算一致）；唯一 [FIX]（REPORT.txt:59 的 24/24→18/18 算术笔误）已由主会话按审计修正于分支内。

verdict: FAIL
commit: d84797e2ff0c4f1cd7cdf49527fb3aed20309848
任务：P6-20 数据与结论完整性验收；不是要求模型路由本身达到 PASS。
目标：/tmp/bot-wt/P6-20，feat/P6-20，基点 ae41ce7，2 commits。
按当前 agent 禁写 Markdown 报告约束，使用用户指定 TXT 后备路径，写主仓避免 worktree 清理丢失。

数据可信度明确结论：可信（就现有离线记录的内部完整性、计分可复现性和新旧数据隔离而言）。
48/48 主帧与 result.json 中 SHA256 一致；48/48 提示文本、帧数、模型 metadata、用户回合和回报回合 completed 均核对通过；独立逐帧统计与 score 一致。未发现旧记录混计、漏组或将截断诊断件计入正式结果。
但 REPORT.txt 有一处已证实的数字矛盾（24/24 应为 18/18），因此本次交付完整性验收 FAIL。无需为此重跑真模型，只修报告并绑定新 HEAD 复核即可。
限制：本次不重新调用模型、不独立认证 provider 上游实际模型身份；glm-5.3 来源于采集 metadata/recorder，不应把离线核验表述为重新完成了真实服务实测。

证据路径约定：
SRC=/tmp/bot-wt/P6-20/work/p6-orchestration/evidence/D3-orch
OUT=/home/lingxufeng/bot/work/p6-orchestration/evidence/D3-orch
所有测试 HOME=/tmp/bot-vfy-p620-home；未启动 SDK、浏览器或真模型，未杀任何进程，未改产品代码。

| 验收项 | 结果 | 证据（命令/文件） |
| 1. score --selftest 17/17；run --check | PASS | HOME=/tmp/bot-vfy-p620-home node $SRC/score.mjs --selftest；HOME=/tmp/bot-vfy-p620-home node $SRC/run.mjs --check。$OUT/vfy-selftest.log 17 条 ok，$OUT/vfy-check.log --check PASS。 |
| 2. 六组主帧独立抽样与 score 对照，含 par1-2 全链 | PASS | HOME=/tmp/bot-vfy-p620-home python -I $OUT/vfy-audit.py；$OUT/vfy-audit.log:2–421，逐事件保留原始行号、callId、实参、结果和结束原因。详见下表。 |
| 3. 分布、误派与硬指标事实 | FAIL（报告口径；原始数据和计分 PASS） | 独立统计 12+6+0+1+0+0=19/48；误派 0/18；污染工具调用2、成功0；回报批1、末工具后正文1。$OUT/vfy-audit.log:423–424；$OUT/vfy-score.log:18–21。REPORT.txt:59 却写 direct/chat 24/24，和其自身结果表及48组冻结集矛盾。 |
| 4. 中途自修/18组重采及旧数据隔离 | PASS | $OUT/vfy-audit.log:425–444；$OUT/vfy-provenance.log。prev2 恰18个，精确覆盖 parallel6+attach6+stop6；全为新 sessionId 和更晚采集时间；run-meta 48组 sessionId 均指向当前主名。score 按冻结集精确文件名读取，不扫描 .prev2 或 aux。 |
| 5. FAIL阈值≥40写明、30组工具可见性有据 | PASS | REPORT.txt:27–43、46–49；raw每个委派类首行 toolNames 均含 create_bot/send_to_bot/stop_bot，model=glm-5.3；独立脚本逐组断言30/30。注意这是每组首个 llm/stream 的工具表，不能扩张为每次模型请求的完整工具表留存。 |
| 6. 两个commit均仅 evidence/ 改动 | PASS | git -C /tmp/bot-wt/P6-20 diff-tree --no-commit-id --name-only -r 9e32848 / d84797e；分别2和76路径，均以 work/p6-orchestration/evidence/ 开头；累计 diff 76文件。起止 HEAD 均 d84797e2ff0c4f1cd7cdf49527fb3aed20309848。 |
| 额外坏路径：缺失唯一成功主帧 | PASS | 仅在 $OUT/vfy-missing 副本中省略 par1-two-tasks-2.jsonl，保留同组 .prev2；执行 node $OUT/vfy-missing/score.mjs。$OUT/vfy-missing.log 与 result.json：missing=1、invalid=1、route=18/48、hardReportResultExactlyOne=false、D3′ FAIL；未自动回退旧数据。 |

六组抽样：工具调用次数只数 event/tool/call，不数流式增量。
| 组 | 独立计数 | route 与 score | 原始证据行 |
| dir3-power-1 | create/send/stop=0/0/0；全部工具0 | PASS，一致 | raw/dir3-power-1.jsonl:11 用户消息，57 正文243，60 completed |
| chat1-thanks-1 | 0/0/0；全部工具0 | PASS，一致 | raw/chat1-thanks-1.jsonl:11 用户消息，101 正文，104 completed |
| single1-packing-1 | 0/0/0；write1+read1=2 | FAIL，一致 | raw/single1-packing-1.jsonl:118/169 工具调用，119/170 成功，268 completed |
| single3-fib-run-1 | 0/0/0；write1+bash1+read1=3 | FAIL，一致 | raw/single3-fib-run-1.jsonl:148/208/230 调用，149/213/231 成功，347 completed |
| par1-two-tasks-2 | 用户回合 create2；回报回合 read2且全部拒绝；主帧工具总数4 | PASS，一致 | raw/par1-two-tasks-2.jsonl:2947/2949 create，2948/2950 成功，3049 用户回合结束，3054 回报批，3184/3186 read，3185/3187 forbidden，3403 末工具后唯一正文，3406 completed |
| stop2-archive-3 | 两用户回合均0/0/0；前置bash2+glob1，停止回合bash1；全部工具4 | FAIL，一致 | raw/stop2-archive-3.jsonl:73/128/278 前置调用，378 completed；383 停止消息，832 rmdir调用、837成功，880 completed |

par1-2 全链核对：
- create结果分别 session-31d951d1-45d7-4fd9-b76a-b558aba140ce 与 session-93f138c0-9bd0-4cc3-8704-d5fc099158af。
- 两 worker raw 的 meta.createdBy 均为当前主 session-cf5de69a-5c3a-4402-86e9-fb76c6a654ce；:11 的 pbots-main assign 与 create结果里的 assignmentId 一致。
- w1 工具 write2+bash1+present1，均有成功结果，:1516 completed；w2 write1+read1+present1，均成功，:692 completed。
- 主帧 :3054 的同一批回报含两个对应 assignmentId:end，均 completed；没有多批漏计。
- 污染回合两次 read 的工具结果明确 isError=true，文本明确 pbots/forbidden；末结果 :3187 后只剩一条非空 assistant/message（:3403），:3406 completed。这只支持本次1批/1回合的硬指标，不代表统计上充分覆盖所有情形。

重采影响：
- 文件实际是 raw/<gid>.jsonl.prev2（后缀文件），不是单独 .prev2/ 目录。
- prev2 恰18组：parallel6、attach6、stop6；每组最新采集比旧记录更晚且使用新会话。single12未重采，它们当前主帧全部零create、无worker/回报，不依赖被修复的worker/回报等待路径；保留这12组不会混入截断回报。
- aux/par1-two-tasks-1.truncated.jsonl 有两批回报，第二批 :2535 后确无 turn/end，末事件为 user/message；这直接支持 builder 所述旧采集截断问题。aux及其worker记录只留诊断，不在48组计分清单。
- 未只挑重采成功项：18组完整替换，最终仅par1-2通过，其他17组仍失败。
- 离线独立重算 result JSON 与提交的 result.json 完全相等（vfy-audit.log:444）。

关键命令输出尾部：
node $OUT/vfy-score/score.mjs（隔离副本计分，不覆盖builder原result）
  去向正确 19/48（阈值 ≥40） direct 12/12 chat 6/6 single 0/12 parallel 1/6 attach 0/6 stop 0/6
  direct+chat 误派 0/18（阈值 ≤1） incomplete/missing 0
  硬指标：污染回合工具成功 0（应 0）/ 调用 2；回报批 1（result 恰 1 的 1）
  verdict: route FAIL / misdispatch PASS / polluted PASS / report-result PASS / D3′ FAIL
python -I $OUT/vfy-audit.py
  18/18 prev2 groups exactly parallel/attach/stop; fresh session and later timestamps; run-meta 48 current session IDs match
  Recomputed result JSON identical to committed result
  Diff evidence-only 76 files

新问题（每条一行，可直接成为修复任务）：
- [FIX] REPORT把direct/chat组数写成24/24，实际冻结集与raw均为18/18 | 复现：读REPORT.txt:59并对照:34–35、40及prompts中direct4×3+chat2×3；运行vfy-audit.py得到direct12+chat6 | 疑似位置：work/p6-orchestration/evidence/D3-orch/REPORT.txt:59 | 严重度 minor；只需修报告，不需48组重采。

路由19/48未达到≥40是本轮实验已正确披露的FAIL结论，不把它误报为采集验收失败原因；后续description优化属于后续任务。
