# B41 · 人类模拟测试 bug 台账

方法：复刻壳（CDP 9224+litellm 真模型）+ CDP 脚本当「人的手」——走真人路径（首启向导→主bot对话→建bot→切主题→设置→Tasks→复制→多bot切换），每步截图+DOM 断言+后端对账。

| # | 现象 | 期望 | 证据 | 归因 | 状态 |
|---|------|------|------|------|------|
| 1 | demo-launch v1 真模型下静默落 fake provider（turn/end 无 assistant/message）| 真模型 key 传了就该走 litellm，或明确报错 | session jsonl: 'p2sdk-fake-llm: no scripted call #0'；agent-default-model→p2fake patch 污染 | 工具链（launcher）| ✅已修 v2（去 fake overlay）|
| 2 | superagent orchestration unresolvable 报错（boot 会话 lookup 失败 ×3）| master bot id 钉定后 worker lookup 应成功或静默 | /tmp/hsim-launch.log: 'worker session … not found' | B41a 修复：bots.json discovered 链 | ✅（真模型 trigger 3 行 local:*）|
| 3 | 首启向导 Skip 连点 3 次才退出（Skip→Skip→Skip for now）| 一次 Skip 即出 | CDP 遍历 log | 待查（多步向导？）| 🔍 |

## 第一轮旅程结论（2026-11-19 10:42）
走查路径：首启向导(Get started→Next×3→Skip×2→Skip for now)→主bot kickstart→第二轮对话→设置(mod+,)→切Light主题→Copy播报→New Bot(mod+n)→Tasks看板。**8 面全过，真模型全程驱动（litellm glm-5.3-flash）**。

| # | 现象 | 判定 |
|---|------|------|
| 1 | launcher v1 fake 污染 | ✅已修（v2 去 fake overlay） |
| 2 | superagent trigger 0 行 | ✅**已修（B41a）**：~~鸡生蛋~~ master-id.ts discovered 链（pin > discovered[bots.json] > stored > fallback）+watchBotsMeta 重钉。真模型验证：KV master-id=session-f1547dce（非 hash）+trigger 表 3 行。原分析：runtime 先起（无主 bot）→用户走向导→主 bot 才有 id。local source 的订阅（watchLocalSession session.id!==target 滤掉）永不匹配。settings blocks（pause/policy/eval/executor/source:*）**不含** masterSessionId——热重钉不可行，只能部署 config。kv master-id=orchestrator-hash 自造。**修法方向**：shim 首启建主 bot 后写 superagent patch config 再触发 runtime in-process restart（runtime.ts:90 restart 注入在）；或 launcher 二段式。⚠️ repin 实操踩坑：改 yml 杀 runtime 重启后旧壳占 9224、新壳 CDP 绑定失败——demo 环境两段式脆，产品级闭环才稳 |
| 3 | Skip×3 | ❌撤回：向导多步各带 Skip 是 0.78.1 原版行为（connect 步 Skip for now+前步 Skip） |
| 4 | 侧栏时间戳"粘连" | ❌撤回：time 在 __trailing 右列（justify-items:end 12px tertiary），textContent 粘连是 DOM 文本序非视觉问题；0.78.1 同构（sand-kit-timestamp 12px 66%白） |

**B41 第一批可修项收敛：#2（superagent 与 UI 主 bot 的握手闭环）**。产品级修法=shim createAgent 建主 bot 时同步钉定：写 patch yml config.masterSessionId→dsh 重载 patch（若 dsh 支持热重载）→runtime restart。需要查 dsh patch 热重载能力。

## 第二轮走查（2026-11-19 11:15–11:32，B41a 后真模型全链）
环境：v2 launcher（dataDir patch+shell-home 保留+主仓 lib 重建）。旅程：向导→主 bot 发任务（检查 inbox）→审批循环（3 次 Allow once）→终稿；多 bot（Atlas Worker）创建+切换；Tasks 岛；审批卡定位。
| 发现 | 判定 |
|---|---|
| 审批卡「无提示假死」疑案 | ❌撤回：dock 在（.sand-local-tool-permission-dock），首次 selector 拼错（doc/dock）。真人可见、可点、链路闭环 |
| 每步 bash 都要人工 Allow once | 观察（非 bug）：A9④ 定案 bash 卡无 Always allow——与 0.78.1 对齐复查过；高频工作流下可议「会话级 allow」产品化，暂不动 |
| 主 bot 真模型任务循环 | ✅ 3 步工具循环+审批+终稿「无 inbox，要路径或可建定时任务」——首次真人路径全闭环 |
| 断网重连指示 | e2e b39a 已锁（DevSurface.dropCarrier 测试口），走查不重复 |
