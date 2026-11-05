# Bot · 项目主控文件

中文交流。**用户主导开发**：需求、方案取舍、节奏由用户定；agent 按用户指令执行，不自行启动多阶段流程。

## 0. 开发架构（2026-11-05 起，优先于下文旧流程）

**主 agent（GLM 5.3）直接开发**；Opus 5.5 只在需要设计决策时按需出方案（派 `director`）；6.1 Sol 作为独立 subagent 攒批审查。不派 builder / verifier，不建 cron。接手先读 `work/HANDOFF.md`。

## 1. 目录

| 路径 | 内容 |
|---|---|
| `work/HANDOFF.md` | **当前接手入口**：架构、状态、待办顺序、踩过的坑 |
| `.claude/skills/grok-orchestrate/` | 旧编排手册（一层派发）。**已停用**，仅作参考；项目路线仍可看 `references/roadmap.md` |
| `docs/harness/PROTOCOL.md` | 工程闭环参考：阶段、闸门、panel、逆向规则、任务图格式。用户要求走完整流程时再用 |
| `docs/harness/MODELS.md` | 派发参数（`subagent_type`、何时必须传 `model`）和各模型的提示词写法。**派发前必读** |
| `docs/harness/REVIEW.md` | 多模型 code review 的设计 |
| `work/LEARNINGS.md` | 跨需求经验（现象 → 根因 → 规则）。开工前读一遍 |
| `work/<slug>/` | 每个需求的状态文件（BRIEF / PLAN / VERIFY / LOG 等）。只认文件，不认聊天记录 |
| `.claude/agents/` | director、scout、builder、ux-proposer、frontend-dev、verifier、judge、drafter（build-lead 已归档到 `docs/harness/archive/`：改为一层派发） |
| `.claude/commands/panel.md` | `/panel`：双席盲评（Opus + Sol，方案 / UI / 交付闸门 / 决策投票） |
| `.claude/workflows/mm-review.js` | 多模型 code review，档位 S / M / L |
| `docs/harness/CLAUDE.bots-v2.md` | 旧项目（Gas City 版）的主控文件，仅供查阅，不生效 |

## 2. 模型

模型 slot 对照见 `~/.claude-kimi/CLAUDE.md`：`fable`=Opus 5.5，`opus`=GLM 5.3 1M，`sonnet`=6.1 Sol，`haiku`=K3.1 Pro（无额度，不用）。

| 用途 | 模型 |
|---|---|
| 方案、产品判断、UI 定稿 | Opus 5.5 |
| 主力实现、验收、安全 review | GLM 5.3 |
| 调研（GitHub MCP）、后端 review 与验证、panel 席 B、UI 提案席 C | 6.1 Sol |

决策核心是 Opus 5.5 + 6.1 Sol（panel 两席），代码交给 GLM 5.3。K3.1 Pro 不用。
| 逆向闭源产物 | 用户级 agent `reverse-engineer`（GLM 5.3 + REA，MCP 只挂在它身上） |

## 3. 方法论

遵循 superpowers 方法论和 ponytail 协议：
- 先写测试（TDD）
- 先找根因再修
- 先有证据再宣布完成
- 复用 > 标准库 > 已装依赖 > 最少新代码
- **搬运工优先**（用户 2026-11-01）：别人在维护的项目，比我们自己写的东西更可靠，因为 bug 修复和新功能由上游持续提供。任何能力开写前，按下面的「搬运阶梯」从上往下找，停在第一级能用的：
  1. **直接依赖在维护中的上游**：npm / pnpm 包、dsh 插件、MCP server、现成的 Electron / React 组件库。版本锁定，升级时跟上游走
  2. **整仓集成**：workspace 链接或 git submodule，原样使用，不改上游代码；需要的行为用插件、配置、包装层补
  3. **复制改造**：只搬用得到的文件到 `app/`，文件头和 commit 正文写 `来源: <url>@<sha>:<path>`，改动尽量小，以便日后和上游对比
  4. **逆向**：行为只存在于闭源产物
  5. **自建**：必须写明上面每一级为什么不行，并有 scout 的「GitHub 上搜过了，确实没有」
- **「在维护」的判断**：最近 6 个月内有 commit 或 release，issue 有人回应。不满足的项目仍然可以搬（第 3 级），但不能作为第 1、2 级的依赖
- **clone**：值得深读或要搬代码的仓，`git clone --depth 1` 到 `repos/<owner>__<name>`（参考仓只读），在 `repos/MANIFEST.tsv` 记一行：目录、URL、SHA、许可证、维护状况、为谁拉的（slug / 能力）。拉之前先查 MANIFEST，避免重复拉
- 作者不自评：方案用 `/panel` 审，代码用 verifier + `mm-review` 审

审查强度按风险分级：
| 风险 | 审查 |
|---|---|
| 安全 / 协议 / 存储 / 鉴权 | verifier + `mm-review M` |
| 普通后端 | verifier + `mm-review S` |
| UI | verifier + `/panel GU`，只跑 1 轮 |
| 交付前 | 整条分支 `mm-review L` |

外部事实（竞品、API、依赖）派 `scout` 查，不凭记忆回答。互不依赖的派发放在同一条消息里。

## 4. 硬约束

**许可证**：私用不分发，开源代码与资产可直接复用，commit 正文注明出处。将来对外分发再整体重审。

**安全反例，不得照抄**：
- slopus/happy：凭公钥即可领取 token
- openclaw：exec 默认不审批
- `allowed_tools` 中的工具会绕过 `can_use_tool`
- 弱隔离环境下使用 `bypassPermissions`

**逆向**：本机已有的产物（deb / AppImage / 已安装应用）可以拆，资产可复用。不读取 `~/.grokbot` 等目录里的凭证文件内容。

**其他**：
- 凭证不进模型，也不进容器
- 并行 agent 一律使用独立 worktree（`/tmp/bot-wt/<task-id>`）
- 合并时按逐文件清单 checkout，禁止整树覆盖，清单显式排除 `work/` 下的 LOG 和 LEARNINGS
- **严禁 agent 重启机器或注销用户会话**（reboot / shutdown / poweroff / loginctl terminate-\* / systemctl isolate）。需要重启的验证改为服务级模拟，真重启步骤写清楚交给用户
- 不用 `pkill -f <模式>`（会匹配到自己的 shell）；先 `pgrep -x` 拿 PID 再 `kill`
- 机器在跑 GPU 训练：开发期间盯 iowait 和 load，负载高时暂停全量回归
