# goal-0acebfbf R3-R5：SuperAgent 接入 DS-Bot trial 完整推进记录

## R3 本地模式解锁（commit 前身段）
- resolveDeployment 改造：repository 空 → 本地模式（Deployment.repository?/github? 可选）+12 消费点守卫
- trial 实证 setup problem:null；policy 放行 local 源 person（PUT settings/policy，revision 从 blocks.policy.revision 取）
- 首工作项：eval→decide accept→ticket 689691cd 开出+outbox acknowledgement——但 assignment report failed "Unknown agent preset: dsh-superagent-worker"（preset 条目缺）

## R4-R5 trial patch yml 攻坚（多轮缩进坑）
- worker-preset/router-preset insert 条目从主仓源 yml 规范重提（python 拼接坏缩进 ×3 次：YAMLException bad indentation 44:11）
- stateDir/dataDir 曾被追加到 feishu 条目下（ValidationError $.stateDir missing）→挪回 dsh-superagent 主条目 config
- yml 含 !!js 标签 python yaml 校验不了——以 dsh 启动无报错为准

## R5 watch 断链（本轮核心，已修复 896d8416）
### 症状
orchestrator HTTP 面活着（state 200+masterId 正确+problem:null）但 Chief 会话新用户消息不进 trigger 表（停滞在 15:30）
### 排障链（方法论沉淀）
1. follow 探针：事件流本身通（收 snapshot+event 帧）
2. evt-probe 插件（6 行 cordis 插件挂 trial profile）：**收到 user/message 但 session=3d0431 非 daa233**——定位脱节
3. zstd 解会话 jsonl：3d0431 title='Chief'——**ds-bot 在 tokens 达阈值（397K）时轮转 Chief 会话段**，segments[0].endedAt 有值
4. bot/state.json：mainBotIds 仍是 daa233（ds-bot 不更新）——discovered 链拿到孤儿 id
### 修复（SuperAgent 侧零 fork）
- master-id.ts: resolveLiveMasterId(candidate, controller, excludeRoomIds)——session/list 按 updatedAt 找比 candidate 更新的会话（排除 rooms 群聊+candidate）；readDsBotRoomIds 读 rooms dict keys
- runtime.ts: initialize() 早期 live 校验（未 pin 时），id 变→dispose 旧 watch→挂新→masterId+KV 回写；masterId 可变化+masterWatch 成员
- 踩坑 ×2：①controller.list 解构后 this 丢失（TypeError listState）→bind 传参 ②session/list 回包无 title 字段（实测 undefined）→不能按 title='Chief' 过滤，改 updatedAt 最新
### 验证
KV daa233→3d0431+trigger 1699→1703+[R5] 日志 live 分离；tsc 0 错+vitest 19/19

## 已知遗留（R6 候选）
1. **eval auto 模式 LLM 超时**：mode 切 auto 后 decision=unavailable/timeout（120s）——assessment 卡片投 Chief 会话后 turn 时序问题；litellm 直连通（glm-5.3-flash 回复正常）；3d0431 model/selection=litellm ✓
2. policyChanged 瞬态：PUT settings 会作废进行中 eval（正常行为，重排即可）
3. r5-marker.txt 两次都是 Chief 自己 bash 写的（decision 未 accept 时 Chief 直接执行）——worker 执行链需 eval 通后才能真实验证
4. marker 判定法：ticket 表+assignments[0].report 才是 worker 证据；文件存在≠闭环

## trial 运行态（R5 末）
- 引擎 http://127.0.0.1:39161（端口随重启变，host7.log 尾取最新）
- sa-state/orchestrator.sqlite：trigger 1703+decision 8+ticket 1（旧失败单）+outbox 1 pending
- eval mode=auto（已切）；policy local allowed=[person]；discovered 链已重绑

---

# R6：eval 破局+wake 模式+bash 收权+原生编排实证（bcdfa685）

## 三个根因连续攻克
1. **assessment 卡片不起 turn**：deliver 恒 'steer' 模式——dsh Agent.steer 对 idle 会话只入 inbox（jsonl 实证 spliced 后零 step/start）→ 修 sessions.prompt() 加 'wake' 自适应（idle→queue/followup；running→steer）
2. **Chief 抢答**：master tools.restrict 白名单含 bash——Chief 对工作请求直接自己干（r5/r6 marker 全 Chief 手写）→ 白名单去 bash（主 bot=决策层语义）
3. **模型选原生工具**：bash 收权后 Chief 改调 **list_bots+message_bot（ds-bot TEAM_TOOLS）**派 Atlas 干活——r7-marker.txt 由 Atlas bash 真写（18 bytes 精确匹配）

## 里程碑：多 bot 编排真人链路首条全通
Chief（主 bot）→ message_bot（TEAM_TOOLS 派发）→ Atlas（worker bot）→ bash 写文件 → Chief 汇报「Atlas did create it, verified」
- 证据锚：Chief jsonl 的 list_bots/message_bot tool calls；Atlas jsonl 33 处 r7 命中+bash 命令原文

## 架构定论（待用户拍板项）
- **ds-bot 原生编排（TEAM_TOOLS 30 工具）已是完整主干道**——模型自然选用（prompt 直给+工具在手边）
- SuperAgent eval/ticket 流（orchestrator_eval 0 命中）被绕过——两套决策机制并存
- SuperAgent 真实增值位（不与 TEAM_TOOLS 重叠）：watch/trigger 记账、orchestrator HTTP 面、ticket/handoff 异步队列（外部系统接入）、kickoff 人格
- **待拍板**：主决策层归属——A) 接受 TEAM_TOOLS 为主，SuperAgent 降级为记账/外部门面 B) 强制 eval 流（需 prompt 大改+可能削 TEAM_TOOLS 可见性）

---

# R8：kickoff 开场真人链路验证（ego browser 直开引擎 URL）

## 结论：DS-Bot 基底原生满足「打开进入会先回复我」
- New… 菜单 → Create new Bot 简化表单（Name+Model 两字段）→ 填 Scout → Create
- roster.js 机制实锤：建 bot 时总构造 kickoff（非 main → 'The user just created you. Greet in one short message, then ask…'）+ waitForModel→applyModel 投递
- **Scout 会话 23 事件实证**：assistant 开场 "Hi! I'm Scout 👋 — ready to dig into your code…" + ask_user 工具（等用户回答）+ turn/end
- 侧栏状态 "Scout, Waiting for your answer"——ask_user 挂起即 0.78.1 首启同构体验
- New 表单无 kickoff 开关（首启向导表单才有五字段）——但行为=总是开场，比 0.78.1 条件开关更主动；无需产品改动

## R7 补记（keepTitle 同一性修复 98b027ff）
- SuperAgent ensure() 曾把 Chief 改名 'dsh-superagent orchestrator'——keepTitle 跳过；trial rename 回 Chief 实证
- UI 走查过：侧栏三 bot+r7 编排对话真人可读+composer 单行（R2 CSS 生效）

## 观察项（真人体验层）
- Chief 会话里旧测试痕迹（loop-marker3/probe-msg 对话）真人视角困惑——产品化时要干净 home 起步
- 表单建的 bot 无 How should it behave/What should it never do 字段（首启向导专属）——bot 人格精调入口待评估

---

# R9：群聊真人走查（alpha-squad）——@mention 调度链全通

## 产品面（ego browser 目检）
- 群详情面板完整：2 members · Admin Chief / Shared to-do（Ask a Bot to add one）/ Members（Chief Admin+Atlas Researcher）/ Tasks / Goal（Set a goal）/ Who answers（Admin leads）/ Memory——0.78.1 同构
- 群消息流+侧栏四入口（Chief/Scout/alpha-squad/Atlas 各带描述）

## 调度语义验证（两条路径）
1. 无 @ 提及（"Atlas, please..."）：admin Chief 收到（私有工作会话 f120c671 注入群上下文）→ 回 [PASS]（"this one's for Atlas"）→ 群提示 "did not answer or call anyone; call a member with @Name"——**按 ROOM_CALLS 语义这是正确行为**（名字无 @ =提及不调用；PASS=让位但不代转）。体验轻缺陷：用户需补 @
2. @Atlas（RPC 直发 session/prompt 到群会话）：**调度链全通**——群会话收消息 → Atlas 私有工作会话 b17173c0（群上下文注入）→ Atlas 真答（Web research on any topic… well-cited findings）→ 回群
- 语义锚：groups.js:185 admin 模式 'Plain messages come to you first: answer them, or call the members who should answer with @Name'；:169 ROOM_CALLS @Name 调用规则

## 真 bug（dsh-web 层，零 fork 边界外）
- UI 手打 "@Atlas ..." 发送静默失败：消息显示在 UI 但零命中引擎任何会话 jsonl——手打 mention 可能未过 UI 校验被丢。规避=mention 从建议列表选或 RPC 直发（mentionSpans 文本扫描支持纯文本 @）。记录待报 upstream 或 CSS/JS 注入兜底

## 群工作会话机制知识
- 每轮群调度给成员开独立私有会话（session-b17173c0 等）注入：Group memory / Possibly relevant memory / [Group chat "alpha-squad" · your turn] / runtime context——与 bot 主会话（e05f5454）分离
- admin-passed 判定：groups.js:1077 alone && !answered（posted/working/waiting-approval 皆无）

---

# R10：dsh-web 手打 @mention 静默失败——注入层兜底（R9 真 bug 修复）

## 根因与兜底法
- dsh-web 前端对手打 @ 文本（非建议列表选的 mention）在 fetch 前抛错——消息零网络活动即丢（WS/XHR/fetch 三面 hook 全空实锤）
- 兜底（零 fork，SuperAgent webServer.tapIndex 注入 JS）：send 按钮 mousedown 后 800ms 无网络活动且编辑器已清空 → 判定静默失败 → api/bot send 端点直发纯文本（channel.js:707 契约 {text, sessionId}，sessionId 从 URL 提取）
- api/bot 鉴权：GET /?token= 换 dsh-auth cookie（同源）→ POST /api/bot {endpoint:'send', payload:{text,sessionId}} → 200 {ok:true,value:true}

## 端到端验证（trial 实证）
- 兜底通道 RPC 直发先行验证：api/bot send 直发 '@Atlas api-fallback probe' → 群会话 2 hits + Atlas 工作会话真答 'Acknowledged'（one-word 要求遵从）
- 注入后 ego 真人路径：手打 '@Atlas fallback e2e test' → **群会话 2 hits**（旧路径 0 命中）+ Atlas 应答在途（reasoning 实证）——**兜底接住了静默失败**
- r2 二次手打未触发（编辑器时序），兜底单次已验证

## 引擎重启排障（R10 附带知识）
- start-host.sh 重启时旧引擎进程没死会互抢锁（proper-lockfile 报错+端口漂移）——重启前必须 pgrep -x node 按 cmdline 过滤 host.mjs 逐个 kill -9（pgrep -f 会自匹配 bash 单元命令串，SIGKILL 自身 shell）
- 引擎 URL 以 host7.log 最后一条 'dsh web:' 为准（每次重启换端口+token）
- tapIndex 注入的鉴权：curl -L 跟 303 丢 cookie 看不到注入——用 ego browser（cookie 会话）验证 document flag（__mentionFallback）

---

# R11：干净 home 完整首启旅程回归（产品级剧本闭环）

## 剧本全程（全新 home 实证）
1. 预配置发行版形态：cordis.patch.yml（litellm provider+agent-default-model+SuperAgent 插件）预置 → 全新 home 首启
2. Chief 无模型态开场："Hi, I'm Chief. Pick a model for me first. You can change it later in my details." + LiteLLM (local) 模型组（glm-5.3-flash 一键选）+ Manage models
3. 选模型后 **kickoff 人格开场**（真模型驱动）："Hey — I'm Chief, your Chief of Staff. I run the Bot team: I'll set up specialists as needed, hand out the work, and keep everything on track. | Come to me for anything that needs a decision or a job done — I'll route it and report back. What should the team help with first?"
4. 首条编排全链：'Create a file first-boot-marker.txt containing the word ready, using a worker' → Chief list_bots→**create_bot（建 worker）**→message_bot 派活 → worker 会话 write 文件 → Chief bash 双检 → 汇报 "Done. Worker created the file and I double-checked it myself"
5. marker 落盘：bot/workspace/first-boot-marker.txt 内容 'ready'（worker 写，非 Chief 代写——session-a3e3aefc=Chief 调度，session-315169fc=worker 执行）

## 新发现：UI 直发静默失败第二形态（R11 遗留）
- 现象：无 @ 纯文本 execCommand 打字+send 点击——编辑器**残留**（未清空）+零网络活动+消息零命中引擎
- R10 兜底没接住：兜底条件=「编辑器已清空」（认定 UI 认为成功才兜）；本形态=编辑器残留=点击根本没触发 send 流程
- 判定：dsh-web 前端 send 按钮 mousedown+click 对 React 受控状态有时序问题（execCommand 打字不经 React onChange？）——**兜底 JS 需放宽条件**：800ms 无网络活动+编辑器有残留文本时也走 api/bot send 直发（记 R12 候选）

## 环境知识
- 全新 home 引擎互锁：旧引擎没杀净会 'The Bot team … is open in another dsh' 只读锁——重启前按 cmdline 逐个 kill host.mjs；bot/state.lock 是 proper-lockfile 自动重锁（误删会重建无害）
- ego 真人路径的发送不稳定是 dsh-web 前端层问题；引擎/编排/API 面全通——回归判定一律以 jsonl+文件落盘为准


---

# R12：UI 直发兜底第二形态修复（部分收尾）

## 已修
- 兜底条件放宽（R11 形态）：800ms 无网络活动+编辑器残留原文本（after===text）也走 api/bot send 直发
- sessionId 双源解析：URL 无 session 前缀（主会话页 pathname='/'）时回落 state API mainBotIds[0]

## 未竟（记档止损）
- 合成 mousedown（dispatchEvent）场景兜底监听未触发（真点击 R10 验证通过；合成事件+React 事件委托的边缘时序）——3 轮排查后按 ponytail 止损
- 产品级可靠通道=api/bot send（已全验证：鉴权 cookie 流程+send 契约+编排全链）；UI 合成点击边缘留给 upstream dsh-web 修复

---

# R13：TEAM_TOOLS vs eval 流——架构拍板实证

## 实验设计
多步编排任务（建 Scout+问能力+汇总）发 Chief，统计工具选择（模型自由决策零干预）。

## 实证数据
- Chief 编排全程 TEAM_TOOLS：list_bots ×2、create_bot ×2、message_bot ×2（+bash 验证 ×3）
- SuperAgent 工具被零星调用：orchestrator_route ×1、orchestrator_eval_read ×1（评估读面有真实用途）
- 结果链完整：Scout 建成（真答 fact-finding 能力清单）→ Chief 汇总
- 结论：**建议 A 实证成立**——TEAM_TOOLS 主导编排（模型自然选择），SuperAgent 转独有增值（watch 记账/eval_read/ticket 异步队列兜底）；B 方案（强制 eval 流）要 prompt 大改+削工具可见性，无必要

## 工程沉淀
- engine.sh 幂等引擎管理脚本（/tmp/dsbot-trial/engine.sh start|stop|url）——多引擎 spawn 竞争的结构性收口（引擎自守护 restart 会 fork 兄弟进程互抢锁；幂等=杀全→单起→多余者杀→30x/401 探活）
- **pgrep -x node 匹配不到全路径进程名**（引擎 node 在 primary-runtime 深路径）——必须 ps aux | grep 'resources/app/src/host.mjs'

---

# R14：orchestrator 状态可见性（部分+止损）

## 已完成
- 僵尸 ticket 清理：R3 时代 'Create loop-marker2.txt'（Unknown agent preset 失败）经 /orchestrator/api/tickets/:id/stop 关闭——open tickets 0
- SuperAgent 管理面板可达性实测：DSH web 侧栏无 SuperAgent entry（superagentEntry:false）；panel 无独立 URL（/superagent 404）——管理面只有 /orchestrator/api/* JSON 面
- 状态徽章 JS（orch-status.js）四轮注入尝试（DOMContentLoaded/readyState 轮询/documentElement 挂载）——flag 设了但节点不存活，判 dsh web tapIndex 对 DOM-append 类注入不稳（R10 纯 hook 注入可活）；回滚注入，JS 留 /tmp 备用
- DS-Bot 原生状态面确认在位：parts.js:1917 工具态文案表（ask_user_question→'Waiting for your answer' 等）+侧栏 bot 行状态渲染原生

## 止损判定
- 徽章方案 4 轮失败（DOM 注入被 SPA 替换链吃掉）——SuperAgent 可见性的正路=等 upstream dsh web 提供插件 UI 槽或走 DSH 桌面版 sidebar entry；不当继续烧轮次
- orchestrator JSON 面随时可用（health/masterId/tickets 全真实数据）

---

# R15：首启回归固化（fresh-boot.sh 全绿）

## 产物
- scripts/fresh-boot.sh：干净 home 首启回归——A1 引擎起→A1.5 预配置（R1-R10 patch 配方+SuperAgent 安装）→A2 Chief 在→A4 首条编排（api/bot send→worker 建+落盘 marker）四断言；跑完自动清场（--keep 保留）
- scripts/health-check.sh：四段健康读数（引擎进程数/web 端口/Chief 在/SuperAgent orchestrator ready）——一条命令分辨哪层断

## 首跑全绿（exit 0）
- A1 fresh home 引擎 34191；A1.5 pnpm add+patch 16 命中；A2 chief=session-7e4cb6b2（全新）；A4 worker 落盘 boot-check.txt（180s 内）
- 每次 SuperAgent 改动后跑 fresh-boot.sh 即可回归首启链（不再手工重放）

---

# R16：多 bot 编排真人可用——真实长任务压测全链

## 任务（真实多步）
'Build me a two-person team for a competitive analysis: create Analyst + 派研究任务 + 汇总三角度'

## 结果（全链真实跑通）
- Chief 接任务→create_bot 建 Analyst（专精 products/companies）→message_bot 派活→Analyst 真答三角度（Target users & positioning / Core feature & experience gaps / Business model & momentum）→Chief 汇报
- 工具链统计：TEAM_TOOLS 主导（create_bot+message_bot）+SuperAgent 增值面共存（orchestrator_route ×2）
- 异步性正确：Chief 先汇报 'will post shortly'（不阻塞）→ Analyst 会话稍后真答——**真人视角的异步多 bot 编排体验正确**

## 工程知识
- Chief 主会话文件在 sessions/--tmp-dsbot-trial-home-.ds-bot-bot-workspace--/ 目录下（encoded-cwd 分组）——mtime 排序法找不到它时要直接按 session id glob
- 编排进行中的判定：jsonl 尾部 step/start 无对应 step/end=turn 还在跑

---

# R17：失败恢复面（崩溃自愈）

## 发现的 bug
- 引擎 kill -9 后 proper-lockfile 残留（session.lock+stateDir 锁）→ 重启 SuperAgent 初始化报 Lock file is already being held → orchestrator 面死（产品级：用户强杀/崩溃后重启踩到）

## 修复（runtime.ts:97 区）
- lockSync 失败 → ctx.logger.warn + unlockSync 清 stale 锁 → 重试一次；正常退出（SIGTERM）不走此路径
- 单测 b17-lock-recovery.spec.ts：held 锁 unlockSync 后可 re-acquire（proper-lockfile 语义：release 引用在 unlock 后调用抛 already released——清理 try/catch 吞）

## 端到端验证（崩溃→恢复→续链全过）
- 任务进行中 kill -9 → 重启（session.lock 清理+新 lib stale 重试）→ chief-alive + orchestrator ready + masterId 正确 → send → Chief 真模型回 'OK'
- 全量 vitest 20/20 + build
