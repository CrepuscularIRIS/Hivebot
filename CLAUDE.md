# Bot（Hivebot）· 项目主控文件

中文交流。目标：做到和 Grok Bot 同级体验，优先拼接、打磨 dsh + SuperAgent 现有能力。
**用户主导**：需求、方案取舍、节奏由用户定。接手先读 `work/HANDOFF.md`。

## 1. 角色（2026-11-05 起，改编自 yanauto/opus-manager）

| 角色 | 谁 | 做什么 |
|---|---|---|
| 施工 + 调度 | **主 agent，GLM 5.3**（当前会话） | 记需求、按工单写测试和代码、写回执、按节点派经理和审查、验收通过后合并 |
| 经理 | **`manager`**（Opus 5.5，subagent） | 立项拆单、定验收；亲自重跑验收、逐条核实审查意见、决定通过或返修；重规划；阶段报告 |
| 审查 | **`reviewer`**（6.1 Sol，subagent，另一家厂商） | 一批工单施工完后只读审查，只找真问题，每条附行号与证据 |
| 逆向 | 用户级 `reverse-engineer` | 行为只存在于闭源产物时才派 |

为什么这样分：写代码最耗 token，交给最便宜的 GLM 在主会话里做；Opus 的额度只花在判断上（拆单、验收、核实审查意见）。经理和审查每次都是全新的小上下文，只看文件，所以便宜也干净。**不用 fork**（fork 继承主会话整段上下文、且只能用主会话同一个模型）。

subagent 不能再派 subagent，所以调度由主 agent 按下面的节点做。两个 agent 的模型在 frontmatter 锁死，派发时不传 model。旧的多 agent 编排已归档到 `docs/harness/archive/`。

模型 slot（`~/.claude-kimi/CLAUDE.md`）：`fable`=Opus 5.5，`opus`=GLM 5.3，`sonnet`=6.1 Sol，`haiku` 不用。

## 2. 工作流程（工单制）

工单目录 `work/tickets/`：`open/ doing/ done/ blocked/ dropped/`，回执与审查报告在 `receipts/`，顺序在 `queue.md`，模板在 `_templates/`。

1. **需求入文档**：用户提出需求或修改，主 agent 先写进 `work/<slug>/BRIEF.md`（用户原话 + 日期），不直接开写代码。
2. **立项**：派 `manager`（任务 A），它定方案、写工单进 `open/`、排 `queue.md`；要用户拍板的写进 `QUESTIONS.md`。纯机械的小改（改一行配置、合一个现成提交）可以由主 agent 直接按模板写单，跳过这一步。
3. **施工**：主 agent 把工单挪到 `doing/`、填 `claimed`；在单的分支（大改动用 worktree `/tmp/bot-wt/T<N>`）上先写失败测试看它红，再最小实现到绿；写回执 `receipts/T<N>.receipt.md`，贴原样命令与输出。**主 agent 不自己宣布完成，不挪到 `done/`。**
4. **审查**：一批（约 3～6 张单）或任何安全 / 协议 / 存储 / 鉴权单施工完后，派 `reviewer`，给它工单、回执和 commit 区间。
5. **验收**：审查报告出来后派 `manager`（任务 B）：它重跑验收命令、查改动范围、逐条核实审查意见；通过的挪到 `done/`，不通过的写修复单 `T<N>b`。
6. **合并**：只合并 `done/` 里的单：`git merge --no-ff`，合并后马上跑定向回测（用户要求：每完成一个 change 都回测），结果记 `work/LOG.md`，对应 PLAN 行改状态。
7. **卡住**：同一张单失败两次，派 `manager`（任务 C）重规划，不换名重开。
8. **阶段结束**：派 `reviewer` 审整段分支一次，再派 `manager`（任务 D）写阶段报告并更新 `work/HANDOFF.md`，然后换新会话。

**控上下文**：额度主要耗在「请求次数 × 上下文大小」。主 agent 读文件按需读片段、测试输出只看尾部；长测试 `run_in_background` 跑一次等通知，不轮询；不建 cron。

**问用户的边界**：只问需求与范围、品味偏好、越过硬约束的授权。行为与语义类问题按「原版即规格」——先查 0.18 源码 / 0.78.1 产物，按原版定，写明锚点。

## 3. 方法论

- 先写测试，先找根因再修，先有证据再宣布完成。非平凡逻辑改动行覆盖 ≥80%。
- 复用 > 标准库 > 已装依赖 > 最少新代码。
- 作者不自评：代码由 `reviewer` 审、`manager` 验收；回执只是说法，不是证据。
- UI 改动：真实浏览器截图（`playwright-cli` skill，只截目标窗口），对照 0.78.1 参考图；截图要亲眼打开确认内容。
- 外部事实（竞品、API、依赖现状）先查（GitHub MCP / WebSearch / 本地 `repos/`），不凭记忆。

## 4. 搬运阶梯（用户 2026-11-01）

别人在维护的项目比自己写的更可靠。任何能力开写前从上往下找，停在第一级能用的：
1. **直接依赖在维护中的上游**：npm 包、dsh 插件、MCP server、现成组件库。版本锁定
2. **整仓集成**：workspace 链接或 submodule，不改上游代码，用插件 / 配置 / 包装层补
3. **复制改造**：只搬用到的文件进 `app/`，文件头和 commit 正文写 `来源: <url>@<sha>:<path>`
4. **逆向**：行为只存在于闭源产物
5. **自建**：写明上面每一级为什么不行，并留下检索记录

「在维护」= 最近 6 个月有 commit 或 release 且 issue 有人回应。要深读或搬代码的仓 `git clone --depth 1` 到 `repos/<owner>__<name>`（只读），在 `repos/MANIFEST.tsv` 记一行；拉之前先查 MANIFEST。

## 5. 硬约束

**许可证**：私用不分发，开源代码与资产可直接复用，commit 正文注明出处。对外分发前整体重审。

**安全反例，不得照抄**：
- slopus/happy：凭公钥即可领取 token
- openclaw：exec 默认不审批
- `allowed_tools` 中的工具会绕过 `can_use_tool`
- 弱隔离环境下使用 `bypassPermissions`

**逆向**：本机已有产物（deb / AppImage / 已安装应用）可以拆，资产可复用。不读 `~/.grokbot` 等目录里的凭证文件内容。

**其他**：
- 凭证不进模型，也不进容器
- `repos/` 下参考仓只读；要改造就复制进 `app/`
- 合并不得整树覆盖；分支与主线同改的文件必须三方合并
- 多 worktree 期间禁 `git stash`；不对外 push / 发布 / 自动合并，除非用户明确授权
- **严禁重启机器或注销用户会话**（reboot / shutdown / poweroff / loginctl terminate-\* / systemctl isolate）。需要重启的验证改为服务级模拟，真重启步骤交给用户
- 不用 `pkill -f`、killall、按父进程批量杀；清自己的进程用 `~/bot/scripts/bot-reap <PID...>`；只动自己产生的进程和文件
- 不用 sudo；测试走隔离 HOME / TMPDIR，DBus 指向不存在路径，不弹前台、不动真实桌面
- 机器在跑 GPU 训练：盯 load 和 iowait，负载高时暂停全量回归，两套全量不要同时跑

## 6. 目录

| 路径 | 内容 |
|---|---|
| `work/HANDOFF.md` | 接手入口：当前状态、待办顺序、踩过的坑 |
| `work/<slug>/` | 每个需求：BRIEF（需求）/ PLAN（任务索引与状态）/ LOG / evidence |
| `work/tickets/` | 工单、回执、审查报告、队列、模板 |
| `work/QUESTIONS.md`、`work/LEARNINGS.md`、`work/LOG.md` | 待用户拍板的问题、跨需求经验、全局日志 |
| `.claude/agents/` | `manager`（Opus 5.5）、`reviewer`（6.1 Sol） |
| `.claude/hooks/process_guard.py` | 进程安全拦截 hook |
| `docs/harness/archive/` | 停用的旧编排（agents、grok-orchestrate、panel、PROTOCOL、MODELS 等） |
| `app/`、`repos/` | 产品代码、只读参考仓 |
