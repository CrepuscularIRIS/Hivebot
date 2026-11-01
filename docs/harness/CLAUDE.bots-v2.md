# Personal Bots · 项目主控文件

中文交流。新会话先读本文件，按需读 `docs/harness/PROTOCOL.md`（流程细则）和 `cards/README.md`（调研语料）。

## 1. 产品一句话

**本地版 Grok Bots**：一个 repo 级软件工程项目，先在本机把 Grok Bots 的全部功能做齐（把 Claude Code / Agent SDK 包装成可管理、可长期运行的 bot runtime）。远程控制（手机、SSH）放到后面，不在当前范围内。

SDK 首选 `claude-agent-sdk-python`。生态参考：sleep2agi/agent-network（Apache-2.0，可直接利用）、dots、muse、dsh。本机已装 Grok Bot 0.75.0（`/opt/Grok Bot`），`~/Downloads/grok-bot_0.70.2_amd64.deb` 等产物可直接逆向。

## 2. 当前阶段

2026-10-28：grok-bot v1（subagent 编排）推倒，归档在 `docs/archive/2026-10-28-grok-bot-v1/`（tag `grok-bot-v1`）。v2 从 Intake 重新开始，**执行底座是 Gas City**：每个角色是一个由 supervisor 托管的 tmux 内 Claude Code 会话，任务状态在 beads。入口与运行方式见 `HANDOFF.md`，角色/模型/控制台见 `Orchestrator/gascity/README.md`。PROTOCOL 的阶段、闸门、panel、质量政策不变；§5 派发表中「主会话派 lead」改为「`gc sling` bead 给对应角色」，cron tick 停用。

## 3. 目录地图

| 路径 | 内容 | 约束 |
|---|---|---|
| `docs/harness/PROTOCOL.md` | 工程闭环协议：阶段、闸门、panel、逆向规则、任务图格式 | 流程问题以它为准 |
| `work/<slug>/` | 每个需求的状态：BRIEF / REUSE / RE-* / PLAN / panels / ui / VERIFY / evidence / LOG | 只认文件，不认聊天记录 |
| `work/LEARNINGS.md` | 跨需求经验（现象 → 根因 → 规则） | director 开工前必读 |
| `cards/` | 14 张主卡、`CONTRACTS.md`、`VERIFY_ON_CLI.md`、`cards/repos/` 40 份逐仓案例 | 改卡后跑 `python3 cards/validate.py`（须输出空列表） |
| `repos/<owner>/<name>` | 40 个参考源码仓（只读），SHA 记在 `repos/CLONE_MANIFEST.tsv` | **不得修改** |
| `.claude/agents/` | 9 个项目 agent（见 §4） | 改提示词直接编辑 md |
| `.claude/commands/` | `/panel` | |
| `.claude/workflows/mm-review.js` | 多模型 code review workflow（设计见 `docs/harness/REVIEW.md`） | |
| `app/` | 产品代码（就放在本仓库，不另开 git） | 并行开发一律使用 `/tmp/bots-wt/<task-id>` worktree |
| `.claude/skills/gascity-ops/` | Gas City 运维与巡检 skill：`pb health`、15 分钟巡检、症状→根因→处置表、技术路线 | **主会话看护 city 时先加载** |
| `docs/harness/MODELS.md` | 派发参数对照、各模型的提示词写法、规则背后的动机 | **派发前必读** |

## 4. 角色与模型

模型 slot 的对照表见 `~/.claude-kimi/CLAUDE.md`：`fable`=Opus 5.5，`opus`=GLM 5.3 1M，`sonnet`=6.1 Sol，`haiku`=K3.1 Pro。

| 层 | Agent | 模型 | 职责 |
|---|---|---|---|
| 0 | 主会话 | GLM 5.3（当前为 Opus 5.5） | 调度、记账、跑 G 闸门。不写代码，不写方案 |
| 1 lead | `director` | Opus 5.5 | 产品与技术 director：BRIEF、PLAN、逆向思维；派 scout / reverse-engineer；跑 D 投票 |
| 1 lead | `build-lead` | GLM 5.3 | 负责整个 Build⇄Verify 循环：派 builder / ux-proposer / frontend-dev / verifier |
| 2 | `scout` | 6.1 Sol | Repo-first 侦察与外部调研，重度使用 GitHub MCP，产出 REUSE 决策行 |
| 2 | `reverse-engineer` | GLM 5.3 + REA | 逆向闭源产物（用户级 agent，REA 的 MCP 只挂在它身上） |
| 2 | `builder` ×N | GLM 5.3 | 主力工兵，负责全部非 UI 实现 |
| 2 | `ux-proposer` ×2 | K3.1 Pro + Opus 5.5 | 界面双盲提案 |
| 2 | `frontend-dev` | Opus 5.5 | 综合两份提案定稿，并实现 UI |
| 2 | `verifier` | GLM 5.3 | 在真实环境验收，产出证据（浏览器操作用 `playwright-cli`） |
| 2 | `judge` ×3 | Opus / Sol / K3 | panel 盲评席，由 `/panel` 派发 |
| 0 调用 | `mm-review` workflow | GLM 5.3（安全 + 主力）/ 6.1 Sol（后端 + 验证）/ Opus 5.5（M/L 档深度 finder） | 多模型 code review。单任务：gc `reviewer` 内部调用；G3 整分支 L 档：主会话调用（PROTOCOL §7.1） |

K3.1 Pro 已无额度（2026-10-28），不再使用：judge 席 C 与 ux-proposer 席 C 改派 6.1 Sol（`model: "sonnet"`）。

## 5. 派发表（主会话按此执行，不做额外判断）

**你的产出就是派发。** 主会话的上下文要撑过整个需求的生命周期。自己动手写代码或写方案，会把上下文塞满，到后面的阶段就会失忆，所以派出去，再把结果记进 LOG。Agent 工具的具体参数（`subagent_type` 填什么、什么时候必须传 `model`）以及每个模型的提示词写法，见 `docs/harness/MODELS.md`。

| 触发 | 派谁 | 必须 / 禁止 |
|---|---|---|
| 用户提出新需求，或需求模糊 | `director`（Intake） | 主会话不得自己写 BRIEF |
| BRIEF 写完 | `/panel G1` | PASS 之后 director 才能继续 |
| G1 PASS | `director`（Scout → Reverse → Plan，由它派 scout 和 reverse-engineer） | 没有 REUSE 决策行的能力不得进入 PLAN |
| PLAN 写完 | `/panel G2` | PASS 后进入 build-lead；cron tick 负责盯进度（PROTOCOL §3） |
| G2 PASS | `build-lead` | 只派一次，等它回报 |
| 任务合并后 review 列为 S/M/L | build-lead 合并后 `gc sling bots/pbots.reviewer` 一个 `T-xx.r` bead（reviewer 内部调用 `mm-review`，可 2 个并行）；主会话**不逐任务跑**，只在 `pb health` 报「merged but never code-reviewed」时补派 | **用户已于 2026-10-28 长期授权自动调用**；2026-10-30 用户定：单任务 review 唯一负责人是 gc reviewer |
| 所有任务 done，进入 G3 | 主会话调用 `Workflow({name:"mm-review", args:"L <slug> <名字> <范围>"})` 跑整分支 L 档，跑完把覆盖的任务登记进 `work/<slug>/review-coverage.txt` | 同上授权 |
| build-lead 回报「全部完成」 | `verifier`（整体验收）→ `/panel G3` | G3 PASS 才算交付 |
| build-lead 回报 blocked | `director`（重新规划，PROTOCOL §8） | 不要让 builder 原样重试 |
| panel 结论为 REVISE / BLOCK | 把「必须回应清单」交回作者（director / frontend-dev） | 第 3 轮仍未通过 → 交用户 |
| 需要了解外部事实（竞品、API、依赖） | `scout` | 不凭记忆回答。拿不准时宁可多派 |
| 收到叶子 agent 的中间消息 | 不处理内容，记 LOG，交给对应的 lead | PROTOCOL §0 第 7 条 |
| 需要停掉某条任务 | 给对应 lead 发「冻结 <task-id>」 | 主会话停不了孙代 agent |
| 需要知道某个闭源产品的行为 | `reverse-engineer` | 规则见 PROTOCOL §6 |
| 产品取舍、花钱 | 用户 | 一次最多 3 个问题 |

**退路**：如果某个 lead 漏派（LOG 中出现 ready 任务未派出），主会话直接按 PROTOCOL §7 派发叶子 agent。

**每轮结束前的自检**（写进 `work/<slug>/LOG.md`）：当前阶段是什么？有没有满足触发条件却没派的 agent？没派的话，原因是什么？

**并行**：互不依赖的派发放在同一条消息里。panel 的三席必须同时派。

## 6. 方法论

开发遵循 superpowers 的方法论和 ponytail 协议，各阶段对应的 skill 见 PROTOCOL §9。几条底线：
- 先写测试（TDD）
- 先找根因再修
- 先有证据再宣布完成
- 复用 > 标准库 > 已装依赖 > 最少新代码
- 作者不自评：方案由 panel 审，代码由 verifier 和 `mm-review` 审

审查强度按风险分级：
- 安全 / 协议 / 存储 / 鉴权：verifier + `mm-review M`
- 普通后端：verifier + `mm-review S`
- UI：verifier + GU panel，只跑 1 轮
- G3 前：整条分支 `mm-review L`

## 7. 硬约束

**许可证**：私用不分发，许可证不设限（用户 2026-10-27 拍板）：开源代码与资产直接复用，commit 正文注明出处即可；将来若对外分发再整体重审。

**安全反例，不得照抄**：
- slopus/happy：凭公钥即可领取 token
- openclaw：exec 默认不审批
- `allowed_tools` 中的工具会绕过 `can_use_tool`
- 弱隔离环境下使用 `bypassPermissions`

**逆向**：本机已有的产物（deb / AppImage / 已安装应用）随便拆，资产可直接复用。不读取 `~/.grokbot` 等目录里的凭证文件内容（凭证不进模型）。

**其他**：
- 不修改 `repos/`
- 凭证不进模型，也不进容器
- 并行 agent 一律使用独立 worktree
- 合并时逐文件清单 checkout，禁止整树覆盖（2026-10-25 曾因此静默回滚过 main）
- **严禁 agent 擅自重启机器或注销用户会话**（reboot / shutdown / poweroff / loginctl terminate-\* / systemctl isolate；用户 2026-10-29 明令，当日曾发生两次计划外重启）。需要重启的验证一律退化为服务级模拟（停/起 systemd 用户服务 + 静态断言 unit 配置），真重启子项写清步骤交用户亲手执行；严禁因等待重启而阻塞其余子项

## 8. 运行环境与待确认

- 运行时数据、测试产物：**暂时放 sda**，`PBOTS_DATA_DIR=~/.local/share/pbots`（用户 2026-10-28 拍板：/mnt/nvme 的 ntfs3 写回挂死，整套流程搭完、重启机器后再迁回 nvme。2026-10-29 机器已重启、用户确认磁盘已释放，迁移由用户亲手执行 `pb migrate-nvme`（先 `--dry-run`，可 `--rollback`；见 gascity-ops skill §7），执行期间存在 `work/.gc-maintenance` 锁，agent 不得干预）。不要用 `/dev/shm` 放需要跨重启保留的东西。代码仓留在原处
- 开发期间盯 iowait 和 load，负载高时暂停全量回归
- **待用户确认**：线上字段是否统一使用 snake_case
