# R6：常驻授权格式与持久化选型

调研日期：2026-11-03。范围：`p5-parity` 的 **botId × 精确工具名**、跨重启、可列出/撤销；不解析命令前缀。本文件是选型建议，不是实现或兼容性验收。参考需求：`work/p5-parity/BRIEF.md` §3、§10.6、A7–A10；BRIEF 修订时以条目语义为准。

## 1. 结论与决策行

**推荐：自建最小精确键 schema，复用本项目单写者文件存储模式及 Node 标准库；不引入四家完整权限引擎。** 最接近的是 OpenCode V2 的持久授权 CRUD，但其授权主体是 project，不是 bot；Gemini 静态规则支持 subagent，其交互自动保存路径却没有保存这个字段。两者都不能原样满足本需求。Codex execpolicy 解决命令 token 前缀，Claude Code 是闭源产品配置，均不适合作为 dsh 的独立 grant store。

下表“改造/逆向”为候选若采用所需的阶梯，不表示本轮同时选中多个实现。唯一推荐实施项是第一行。

| 能力 | 候选（owner/repo@path 或 npm 包名） | 阶梯级别（1～5） | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| bot × tool 常驻授权（推荐） | 本地 `app/ui/main/m3-meta/store.ts` 模式 + `node:fs/promises` | 5 | 项目内代码；Node 标准库 | 本地已有模式；非外部包维护判断 | 自建 | 只定义 version + 精确 pair 集合、list/revoke；复用单写者队列与 tmp/rename 思路，补 0600、严格校验、落盘后生效及 fail-closed。无需 DSL、命令 scanner、ORM。逐级否决见 §5 |
| 持久授权 CRUD（未选） | `anomalyco/opencode@packages/core/src/permission/{saved,sql}.ts` | 3 | MIT | commit 2026-11-03；v2.2.5 2026-10-30；人工 issue 回应已核验 | 改造 | 最接近；必须把 project 改为 bot、收窄 action/resource wildcard、解耦 Effect/Drizzle/Database/Location。改造面大于本需求；npm SDK 不能据此认定提供独立 V2 存储 |
| 命令执行策略（未选） | `openai/codex@codex-rs/execpolicy` | 3 | Apache-2.0 | commit/alpha release 2026-11-03；人工 issue 回应已核验 | 改造 | Rust/Starlark token-prefix engine，与“不解析命令前缀”目标不符；没有直接可用的 bot × tool grant CRUD。引入 CLI/SDK 也不改变该差异 |
| 工具规则与交互保存（未选） | `google-gemini/gemini-cli@packages/core/src/{policy,scheduler/policy.ts}`；`@google/gemini-cli-core` | 3 | Apache-2.0 | commit 2026-11-02；nightly 2026-11-03；近期自动 issue 回应可证，人工未验证 | 改造 | 静态 subagent 规则有价值，但自动保存未携带 subagent；runtime/config/event 及 Google SDK 等依赖重，落盘/内存发布次序也需改。不能因 npm 可安装就判为可直接集成 |
| Claude permissions 实现（未选，不建议启动） | `anthropics/claude-code` 文档、`@anthropic-ai/claude-code` | 4 | All rights reserved / Commercial Terms；非 MIT | changelog commit、v2.1.317 均 2026-11-03；人工 issue 回应已核验 | 逆向 | 公开仓未提供权限引擎源码；包是完整产品，不是独立 grant-store API。本轮文档足够证明范围差异，无需逆向。若以后真要复刻，仅需查“永久批准如何落盘及撤销如何更新运行态”，不读取用户凭证 |

## 2. 各家格式、范围与持久化

### 2.1 OpenCode：区分 V1 与当前 V2

V1 文档/兼容层格式示意：

```json
{"permission":{"bash":{"*":"ask","git status *":"allow"}}}
```

V2 则是有序规则数组，不应混写成 V1：

```json
{
  "permissions": [
    {"action":"shell","resource":"*","effect":"ask"},
    {"action":"shell","resource":"git status *","effect":"allow"}
  ],
  "agents": {
    "reviewer": {"permissions":[{"action":"edit","resource":"*","effect":"deny"}]}
  }
}
```

- V2 每条 `{action, resource, effect}`；effect 为 allow/deny/ask；action/resource 支持 whole-value `*`、`?`。有序配置最后匹配生效；多个资源任一 deny 即拒绝。`shell` 的 resource 是 scanner 提取的命令，尾部 ` *` 还匹配无参形式。MCP action 是 `<server>_<tool>`，resource 通常 `*`。不是对本项目工具 ID 的现成一对一模型。
- agent 可以配置自身规则，但 **Allow always 写入的是 project 范围**：`{id, projectID, action, resource, time:{created,updated}}`；表唯一键 `(project_id, action, resource)`。同一 project 下不同 bot 不隔离。
- reply 为 once/always/reject；always 保存工具建议的 save patterns，shell 通常是前缀，skill/subagent 为 ID。先检查配置 deny，再考虑 saved allow；saved grant 不能绕过配置 deny。
- 有现成 `list({projectID?})`、`add({projectID,action,resources})`、`update({id,...})`、`remove(id)`，这是四家里最明确可复用的 CRUD 参考。saved.add 成功后才解除当前 pending；这一顺序值得保留。
- 持久化：SQLite 的 `permission` 表。Linux 普通 channel 默认 `$XDG_DATA_HOME/opencode/opencode.db`，未设置 XDG 时 `~/.local/share/opencode/opencode.db`；`OPENCODE_DB`、channel 可改变文件名，`:memory:` 不持久。配置示例落在 `opencode.jsonc`；全局 config 根默认 `~/.config/opencode`，可被 `OPENCODE_CONFIG_DIR` 覆盖。
- 适配判断：可以把 botId 编码进 resource，但仍需要自定义命名、隔离约束、持久服务宿主；这不是原样复用，而且 wildcard 语义与精确键需求冲突。不为复用几个 CRUD 函数搬入数据库与 Effect 宿主。

源码证据（以下均基于 SHA `3ba597f7769e19cc3b5f67e3d6667e7b6318f6a3`）：

- `repos/anomalyco__opencode/packages/schema/src/permission.ts:26–66`：request、reply、rule。
- `repos/anomalyco__opencode/packages/schema/src/permission-saved.ts:15–24`：持久 grant schema。
- `repos/anomalyco__opencode/packages/core/src/permission/sql.ts:7–19`：SQLite 主体和唯一键。
- `repos/anomalyco__opencode/packages/core/src/permission/saved.ts:45–49` 及实现：CRUD 接口、框架依赖。
- `repos/anomalyco__opencode/packages/core/src/permission.ts:159–189,340–347`：project 加载、deny 优先、always 保存后释放 pending。
- `repos/anomalyco__opencode/services/www/src/docs/content/permissions.mdx:24–89,109–123,243–290`：V1/V2、匹配、agent、保存范围。
- `repos/anomalyco__opencode/packages/core/src/v1/config/permission.ts`：V1 兼容 schema。
- `repos/anomalyco__opencode/packages/cli/src/database-path.ts:4–12`、`packages/util/src/global-roots.ts`、`packages/util/src/global.ts:12–24,77–80`：路径。
- 上游源码入口：https://github.com/anomalyco/opencode/blob/3ba597f7769e19cc3b5f67e3d6667e7b6318f6a3/packages/core/src/permission/saved.ts

### 2.2 Codex：approval policy 不等于 execpolicy

```toml
approval_policy = "on-request"
```

```python
prefix_rule(
    pattern = ["git", ["status", "diff"]],
    decision = "allow",
    match = ["git status", "git diff --stat"],
    not_match = ["git push"],
)
```

- `approval_policy` 决定何时/哪类请求可询问；execpolicy 决定命令前缀 allow/prompt/forbidden。二者不是同一种“持久常驻授权”。
- 当前协议有 on-request、granular、never；`on-failure` 已是 on-request 的反序列化 alias，不能沿用旧版本说它仍是独立模式。`untrusted` 仍出现在协议 enum，但当前用户配置加载明确报不再支持。granular 的某类 false 是拒绝该类审批请求，不是无审批放行；never 也不等于授予全权限。
- execpolicy 的 `pattern` 是有序 command token 前缀，各 token 可用 alternatives 列表；不是 shell 字符串 glob，也不是工具名集合。`match/not_match` 是加载时校验样例。多命中取最严格 forbidden > prompt > allow。可另用 host_executable 限制 basename 对应路径。README 明确 preview，API 可能 breaking。
- 持久位置：`$CODEX_HOME/rules/default.rules`；从受信任且启用的 config layer 下 `rules/*.rules` 加载，故不只一个文件。追加授权由 append_allow_prefix_rule 写默认规则文件。此处以代码中的 `$CODEX_HOME` 表述，不依赖本机用户目录。
- 列出/撤销：所读 execpolicy 提供规则文件、检查与 append，不是 OpenCode 式 bot grant list/remove 服务；可编辑规则文件，但其 reload/撤销对所有活跃 session 的即时性本轮未验证。
- **并非只支持 shell**：另有 MCP server 的 `default_tools_approval_mode` 与工具级 `approval_mode`，序列化值包括 auto/prompt/writes/approve；不应把 execpolicy 的限制扩大成 Codex 没有工具级权限。不过这仍是 server/tool 配置，不是已经可抽取的 bot × tool grant-store；本轮未验证其全部交互持久化链路。

源码证据（SHA `dbaead0106de82bd129a4f6f503d173ad5109f68`）：

- `repos/openai__codex/codex-rs/execpolicy/README.md`：完整 prefix_rule 格式、preview、匹配优先级。
- `repos/openai__codex/codex-rs/execpolicy/src/amend.rs`：追加 allow-prefix 规则。
- `repos/openai__codex/codex-rs/core/src/exec_policy.rs:56–58,504–508,688–744,904–905`：rules 路径和分层加载。
- `repos/openai__codex/codex-rs/protocol/src/protocol.rs:1150–1244`：granular 与 AskForApproval。
- `repos/openai__codex/codex-rs/core/src/config/mod.rs:234,3957`：untrusted 配置限制。
- `repos/openai__codex/codex-rs/core/src/config/edit/document_helpers.rs:138–144,209`：MCP approval 配置序列化；`core/src/mcp_tool_call.rs:223–232`：调用时选择 approval mode。
- 上游：https://github.com/openai/codex/blob/dbaead0106de82bd129a4f6f503d173ad5109f68/codex-rs/execpolicy/README.md

### 2.3 Claude Code：文档规则可借鉴，不是独立开源组件

```json
{
  "permissions": {
    "allow": ["Read", "Bash(git status *)", "mcp__example__inspect"],
    "ask": ["Bash(git push *)"],
    "deny": ["Read(./.env)"]
  }
}
```

- 格式为 Tool 或 Tool(specifier) 字符串；Bash 支持参数 wildcard，MCP 可写精确 `mcp__server__tool`、服务器范围等。Agent(Explore) 是允许调用哪个 agent，不是按那个 agent 隔离它的全部工具授权。
- 当前文档允许特定 MCP tool-name glob，但 allow 不能写任意全工具 `*` 或宽域 `mcp__*`。settings 中带括号的 mcp__ 参数规则会被跳过；不要把 generic Tool(specifier) 机械套到 MCP。
- 优先级 deny > ask > allow，不是更具体 allow 就能穿透 deny。Bash 复合命令、wrapper、赋值等还有额外解析，明显超过本需求。
- 配置位置：用户 `~/.claude/settings.json`；共享项目 `.claude/settings.json`；本地项目 `.claude/settings.local.json`；另有 managed sources。交互永久批准保存 repository-root 的 `.claude/settings.local.json`，不是 botId 文件；worktree 通常解析到主 checkout，文档有版本/平台例外。
- permissions 列表跨来源合并。文档说明 settings 热更新；可编辑配置撤销，但不能据此保证每个已开始执行或 pending 的调用都会被取消。本轮没有运行闭源产品验证。
- 许可证不是 MIT；公开仓 LICENSE 写 All rights reserved，受 Commercial Terms 约束。私用许可证不是本轮否决点，**缺少独立实现、范围不合、宿主耦合**才是。

证据：

- https://code.claude.com/docs/en/permissions （永久批准位置、rule syntax、deny/ask/allow、MCP、shell 语义；2026-11-03 读取）
- https://code.claude.com/docs/en/settings.md （scope、配置文件、合并、watcher）
- https://github.com/anthropics/claude-code/blob/964d69565952a176ac1975ed218362991db71433/LICENSE.md
- 公开仓 changelog 不构成权限引擎源码证据。

### 2.4 Gemini CLI：静态 subagent 可配置，自动保存未保留它

```toml
[[rule]]
toolName = "read_file"
subagent = "reviewer"
decision = "allow"
priority = 950
```

以上为源码 schema 允许的静态规则示意，不表示 UI 自动生成这个 subagent 字段。

- TOML `[[rule]]` 支持 toolName 字符串或数组、subagent、mcpName、decision、priority、modes；还支持 argsPattern、commandPrefix/commandRegex。commandPrefix/Regex 仅用于 run_shell_command，不能与 argsPattern 混用。支持工具 wildcard；可只写精确工具名而不用命令前缀。
- scheduler 会把 subagent 传入 policy check；但 `createTomlRule` 及自动保存 UPDATE_POLICY 消息未携带 subagent。因此**静态规则能按 subagent 区分，不等于点“永久允许”已经实现 bot × tool 隔离**。
- `ProceedAlways` 等主要更新 runtime；只有 `ProceedAlwaysAndSave` 设置 persist。不能看到 Always 就宣称已跨重启。
- 保存位置：受信任 workspace 且启用 workspace policies 时 `<workspace>/.gemini/policies/auto-saved.toml`；否则 user 的 `~/.gemini/policies/auto-saved.toml`（home/global 根配置可改变）。workspace 内的策略若可被 bot 修改，不满足本项目“grant 文件在 bot 可写沙箱之外”。
- 列出/撤销：规则文件可读、可编辑；所读持久 updater 主要是查重/添加，不是 bot grant list/revoke 服务。实时撤销所有 runtime 的行为未验证。
- 有串行 persistenceQueue、唯一 tmp、`open(...,'wx')` 与 rename 可参考；但坏 TOML 备份后 fresh、EXDEV/EBUSY 时 copy 回退、没有显式 0600，并且 runtime 更新先于持久化，不能不加审查直接照搬到安全授权存储。
- `@google/gemini-cli-core` 已发布，但 package 引入 Google SDK、OTel、MCP 等整套依赖，未证明提供独立轻量 grant-store 入口；本轮未做 import/run spike，不承诺与 dsh 原样兼容。

源码证据（SHA `0ac57c029b848d109eef940afe0db4b5a0c3dad0`）：

- `repos/google-gemini__gemini-cli/packages/core/src/policy/toml-loader.ts:30–74` 及校验分支：规则字段和互斥约束。
- `repos/google-gemini__gemini-cli/packages/core/src/scheduler/policy.ts`：checkPolicy、updatePolicy、handleStandardPolicyUpdate、handleMcpPolicyUpdate。
- `repos/google-gemini__gemini-cli/packages/core/src/policy/config.ts:650–724,790–934`：生成字段、去重、保存顺序、错误及 tmp/rename。
- `repos/google-gemini__gemini-cli/packages/core/src/config/storage.ts:100–279`：user/workspace policies 路径。
- `repos/google-gemini__gemini-cli/packages/core/package.json:1–50`：包与依赖。
- 上游：https://github.com/google-gemini/gemini-cli/blob/0ac57c029b848d109eef940afe0db4b5a0c3dad0/packages/core/src/policy/config.ts

## 3. 维护、许可证与发布包核验

“最近六个月”按 2026-05-03 至 2026-11-03 判断；commit/release 活跃与 issue 人工响应分开记，不拿机器人回复冒充人工维护。

| 项目 | commit / release 证据 | issue 响应证据 | 结论与许可证出处 |
|---|---|---|---|
| OpenCode | [commit 2026-11-03](https://github.com/anomalyco/opencode/commit/3ba597f7769e19cc3b5f67e3d6667e7b6318f6a3)；[v2.2.5 2026-10-30](https://github.com/anomalyco/opencode/releases/tag/v2.2.5) | [MEMBER Tarquinen 2026-11-03](https://github.com/anomalyco/opencode/issues/61072#issuecomment-6594350677)，承认退化并表示继续支持 | 在维护；`repos/anomalyco__opencode/LICENSE`，MIT |
| Codex | [commit 2026-11-03](https://github.com/openai/codex/commit/dbaead0106de82bd129a4f6f503d173ad5109f68)；[rust-v0.167.0-alpha.4 2026-11-03](https://github.com/openai/codex/releases/tag/rust-v0.167.0-alpha.4) | [etraut-openai 2026-11-03](https://github.com/openai/codex/issues/58509#issuecomment-6595121330)，称即将修复；该账号也出现在源码维护记录 | 在维护；`repos/openai__codex/LICENSE`，Apache-2.0 |
| Gemini CLI | [commit 2026-11-02](https://github.com/google-gemini/gemini-cli/commit/0ac57c029b848d109eef940afe0db4b5a0c3dad0)；[nightly 2026-11-03](https://github.com/google-gemini/gemini-cli/releases/tag/v0.67.0-nightly.20261103.g0ac57c029) | [机器人 2026-05-09](https://github.com/google-gemini/gemini-cli/issues/24246#issuecomment-4410712835)；六个月内人工响应未验证，不能用 [2026-03-02 人工回复](https://github.com/google-gemini/gemini-cli/issues/20814#issuecomment-3986277535)替代 | commit/release 活跃；按项目完整维护标准，人工 issue 证据仍留缺口；`repos/google-gemini__gemini-cli/LICENSE`，Apache-2.0 |
| Claude Code | [changelog commit 2026-11-03](https://github.com/anthropics/claude-code/commit/964d69565952a176ac1975ed218362991db71433)；[v2.1.317 2026-11-03](https://github.com/anthropics/claude-code/releases/tag/v2.1.317) | [COLLABORATOR bcherny 2026-08-19](https://github.com/anthropics/claude-code/issues/65093#issuecomment-5349170984)，确认复现 | 产品在维护；不是实现开源；LICENSE.md / Commercial Terms |

已对下列包执行 `npm view <pkg> version time.modified repository license --json`。time.modified 是包元数据更新时间，不冒充该版本精确发布时间。

| npm 包 | latest | time.modified（UTC） | 判断 |
|---|---|---|---|
| `opencode-ai` | 1.19.5 | 2026-10-28 06:17 | MIT；返回结果未给 repository；完整 CLI，不是独立 grant store |
| `@opencode-ai/sdk` | 1.19.5 | 2026-10-28 06:18 | MIT；返回结果未给 repository；latest 仍为 V1，不能据 GitHub V2 源码声称 npm SDK 已有对应独立服务 |
| `@openai/codex` | 0.166.0 | 2026-11-03 02:38 | Apache-2.0；openai/codex 的 codex-cli |
| `@openai/codex-sdk` | 0.166.0 | 2026-11-03 02:32 | Apache-2.0；同仓 sdk/typescript；未验证提供独立 execpolicy/grant store API |
| `@google/gemini-cli` | 0.66.0 | 2026-11-03 01:25 | Apache-2.0；google-gemini/gemini-cli |
| `@google/gemini-cli-core` | 0.66.0 | 2026-11-03 01:18 | 同上；本次读的是 0.67 nightly 主干，不能当 0.66 发布包的逐行保证 |
| `@anthropic-ai/claude-code` | 2.1.317 | 2026-11-03 01:26 | npm 为 SEE LICENSE IN README.md；结合仓 LICENSE 记 Commercial Terms，非开源授权引擎 |

以上包可发布/可安装，不等于可在本项目中直接依赖其内部存储。未安装、未运行这些外部 CLI，未进行 dsh 宿主集成测试。

## 4. 本地复用与已知负证据的边界

1. `repos/MANIFEST.tsv` 已先查，原有 dsh / grok 参考仓没有符合本需求的持久 standing grants。新增三个只读参考仓均记录 SHA、许可证、维护证据和 R6 用途；Claude Code 仅查公开仓文档/许可证，未为缺失实现源码无效 clone。
2. `repos/deepseek-harness/packages/interaction/user-approval/src/types.ts:32` 的 ApprovalOutcome 只有 allowed-once/rejected/cancelled/unavailable，不能把 always 直接塞成上游现成能力。
3. **“dsh 没有持久 standing-grant store”不等于“完全没有审批持久化”**：`packages/interaction/user-approval/README.md:82–90` 明确 approvalState 进入 persisted checkpoints，事件日志记录 asked/decided；但 pending questions、answerers、grants 留在 runtime。应复用其现有审批/审计链路，不重建整套审批系统。
4. `work/p4-ui/REUSE.md` M3 已选本地原子文件方案；`app/ui/main/m3-meta/store.ts:25–106` 已有单 Promise 队列、tmp+rename、错误上抛模式。该实现没有显式文件 0600，不能直接宣布它已满足授权文件安全要求；应复用模式，不复用缺失的安全保证。

## 5. 为什么现成的都不直接用

- **第 1 级直接依赖**：实际检索了 OpenCode、Codex、Gemini、Claude Code 的 GitHub 源码/文档、LICENSE、维护和 npm 包。找到的是完整 agent runtime/CLI/SDK，而不是已验证可直接装入 dsh、提供精确 bot × tool grant list/revoke 的独立包。OpenCode npm 与 V2 主干版本不一致；Gemini core 有重宿主依赖及自动保存缺少 subagent；Codex execpolicy 针对命令前缀；Claude 实现闭源。结论限定于本轮这些候选，不声称 GitHub 所有授权库都不存在。
- **第 2 级整仓集成**：要让一个小 JSON 存储借用另一套 runtime、project/agent 身份及其数据库/事件系统；仍需安全映射 bot，无法“原样集成就满足”。整体替换现有 dsh 宿主不属于 R6 目标。
- **第 3 级复制改造**：OpenCode CRUD 最接近，但重写主体、DB/Effect 依赖和 wildcard 语义后可保留的业务逻辑很少；Gemini updater 的发布顺序、坏文件处理、copy 回退和 0600 还需修订。可以学习不变量，不为保留来源形式而搬入多余代码。若实施时确实复制，文件头和 commit 必须记录 URL@SHA:path，本报告不等于已复制授权。
- **第 4 级逆向**：公开的三个源码项目足够回答格式和持久化问题。Claude 文档已证明 scope 不合，无必要为了这个小存储启动闭源逆向。
- **因此第 5 级**：只自建缺失的 grant 数据契约和 main 边界适配，持久 IO 走已有模式/标准库。若未来真的需要前缀、路径资源、组织策略等，再重新选成熟 policy engine，当前不预建 DSL。

## 6. 最小 schema 与接线建议（尚未实现）

```json
{
  "version": 1,
  "grants": [
    {"botId": "bot-example", "toolName": "read_file"}
  ]
}
```

- 一个 pair 表示允许，缺失表示无 grant；不存 allow/deny 优先级，不支持 `*`、前缀、正则。不用有分隔符碰撞风险的拼接字符串键；按两个字符串精确比较并去重。工具必须绑定宿主稳定、无歧义的 ID；若允许工具替换/同名不同 server，需要先定身份约束，而不是默默扩大 grant。
- main 是唯一读写/判定方。alwaysAllow 的 renderer 参数只收 eventId，main 从待审批 ledger 反查 bot/tool 和 eligibility；不相信 renderer 传入的 botId/toolName。不把授权逻辑放进可跳过审批 callback 的 allowlist。
- 查询顺序先现有硬拒绝/NEVER/升权及沙箱门，再在符合条件的 ASK 上使用 grant。grant 只代替人类再次批准，不改变沙箱边界；旧 bot 保守 ASK、无 always 的规则沿用 BRIEF，不由 R6 自动迁移放宽。
- 拟放 `$PBOTS_DATA_DIR/standing-grants.json`（文件名建议，不是已存在路径）。必须验证该目录位于 workspace 外且 bot 无写权限；仅“在 workspace 外”或“文件 0600”都不能独自防住同 UID、未隔离 shell。目录权限与沙箱拒写由 R5/后续实现证据共同保证。
- 串行化读改写；同目录唯一 tmp，独占创建并设 0600，rename；承诺断电耐久时另需 fsync 文件及目录。写盘成功再发布内存 snapshot/解除 pending；失败不留下内存授权。撤销同样在提交后生效，且不能承诺撤销已执行的工具。
- 不存在文件视为空；坏 JSON、未知 version、字段非法、不可读时 **不应用任何 grants，回到 ASK 并显式报错**，不部分加载，也不静默重写坏文件。NEVER 仍拒绝，不因坏文件变 ASK。撤销写失败要提示失败；如需立即安全收缩，可禁用本进程所有 grants 并要求修复，但不能谎报跨重启撤销成功。
- list/revoke 用同一个 main store 的精确 pair；list 不暴露命令参数/凭证。审计记录沿用现有 approval 事件链，是否增加时间/来源元数据交实现需求决定，不为本轮 schema 必要字段。
- 后续验收至少覆盖：重启仍有效、bot 隔离、工具精确匹配、列表/撤销、坏文件全无 grant、0600/沙箱拒写、并发更新、落盘失败不放行、NEVER 不被覆盖、eventId 防伪及重复处理。这里只列验收要求，未运行测试。

**决策前提**：常驻授权只在 BRIEF 所定安全路线及相关审批通过后接入；R6 没有修改产品默认权限，也没有证明任何候选已完成宿主适配。
