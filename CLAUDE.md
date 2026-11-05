# Bot（Hivebot）· 项目主控文件

中文交流。目标：做到和 Grok Bot 同级体验，优先拼接、打磨 dsh + SuperAgent 现有能力。
**用户主导**：需求、方案取舍、节奏由用户定。接手先读 `work/HANDOFF.md`。

## 1. 角色（2026-11-05 起）

| 角色 | 谁 | 做什么 |
|---|---|---|
| 主 agent | **GLM 5.3**（当前会话） | 把用户需求写进文档；读代码、写测试、写代码、跑测试、合并、记账 |
| 架构师 | **`architect`**（Opus 5.5，按需派） | 需要设计决策时出方案：新功能方案、架构 / 契约 / 存储语义取舍、卡死后重新规划、复用还是自建 |
| 审查者 | **`reviewer`**（6.1 Sol，独立） | 攒一批合并后审查；发现必须实际复现（CONFIRMED）或说明不是问题（REFUTED） |
| 逆向 | 用户级 `reverse-engineer`（REA MCP 只挂在它上面） | 行为只存在于闭源产物时才派 |

不再派 builder / verifier，不建 cron 巡检。旧的多 agent 编排已归档到 `docs/harness/archive/`。

模型 slot（`~/.claude-kimi/CLAUDE.md`）：`fable`=Opus 5.5，`opus`=GLM 5.3，`sonnet`=6.1 Sol，`haiku` 不用。agent frontmatter 里 GLM 必须写完整 ID `glm-5.3[1m]`，别名 `opus` 会被解析错。

## 2. 工作流程

1. **需求入文档**：用户提出需求或修改时，主 agent 先写进 `work/<slug>/BRIEF.md`（用户原话 + 日期 + 可证伪验收），再动手。没有对应 slug 就新建。
2. **要不要找架构师**：改动有设计取舍（契约、存储、权限、跨模块、多种做法）→ 派 `architect`，方案写进 `work/<slug>/PLAN.md` 或 `DESIGN-<topic>.md`。直接、明确的改动不用派。
3. **开发**：TDD——先写失败测试并看它红，再最小实现到绿。改动大或要并行时用 worktree `/tmp/bot-wt/<task>`。合并默认 `git merge --no-ff`，合并后跑定向回测。
4. **审查**：攒一批合并（约 3～6 个改动，或一个阶段结束）后派 `reviewer`，2 个方向并行（如正确性 + 安全）。安全 / 协议 / 存储 / 鉴权类改动合并后必须审。CONFIRMED 的问题修完再审对应格；同一问题修 2 轮仍不过，交 `architect` 重规划。
5. **记账**：状态写 `work/<slug>/PLAN.md`（状态列）与 `LOG.md`；跨需求经验写 `work/LEARNINGS.md`；要用户拍板的事写 `work/QUESTIONS.md`。只认文件，不认聊天记录。
6. **控上下文**：额度主要耗在「请求次数 × 上下文大小」。长测试 `run_in_background` 跑一次等通知，不轮询；一个阶段一个会话，阶段结束更新 `work/HANDOFF.md` 后换新会话。

**问用户的边界**：只问需求与范围、品味偏好、越过硬约束的授权。行为与语义类问题按「原版即规格」——先查 0.18 源码 / 0.78.1 产物，按原版定，写明锚点。

## 3. 方法论

- 先写测试，先找根因再修，先有证据再宣布完成。
- 复用 > 标准库 > 已装依赖 > 最少新代码。
- 作者不自评：代码由 `reviewer` 独立审，方案有争议时由用户或 `architect` 定。
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
| `work/<slug>/` | 每个需求：BRIEF（需求）/ PLAN（任务与状态）/ LOG / REVIEW / evidence |
| `work/QUESTIONS.md`、`work/LEARNINGS.md`、`work/LOG.md` | 待用户拍板的问题、跨需求经验、全局日志 |
| `.claude/agents/` | `architect`、`reviewer` |
| `.claude/hooks/process_guard.py` | 进程安全拦截 hook |
| `docs/harness/archive/` | 停用的旧编排（agents、grok-orchestrate、panel、PROTOCOL、MODELS 等） |
| `app/`、`repos/` | 产品代码、只读参考仓 |
