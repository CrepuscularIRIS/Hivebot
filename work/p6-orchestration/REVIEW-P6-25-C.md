# REVIEW P6-25 · 方向 C（失败关闭与防护覆盖面）

- 范围：`60e8b02..be37484`，产品代码 `app/sdk/src/policy/shell-ask.mjs`；审时 HEAD `be37484`
- 上游：已装 dsh 0.2.2-alpha.2，本仓 profile（`profile/patches/approval.yml` 的 standard / cordis / ptc 三个 preset）
- 探针目录：`/tmp/vfy-r-p625-c/`，副本在 `work/p6-orchestration/evidence/P6-25-rvw/C/`
  - `inventory.test.ts`：真实 launcher + 记录 `options.tools` 的 fake LLM 副本（`fake-plugin.mjs`），用来列出各 preset 的工具表 → `inventory.json`
  - `channels.test.ts`：真实 runtime 下，逐通道尝试写宿主 `/tmp/bot-p625c-out/`，并检查宿主上的结果 → `channels-log.json`，9/9 pass
  - `failclosed.test.ts`：直接加载真实的 `shell-ask.mjs` / `resolve.mjs` / `containment.mjs`，ctx 只是外壳；外加原样调用上游 `SandboxPolicyService.prototype.resolve` → `failclosed.out.txt`，8/8 pass
  - `corrupt-tiers.test.ts`：真实 runtime，用 P2SDK_PATCH 把档位表改坏 → `corrupt-tiers.out.txt`
- 运行方式：`pnpm -C app/sdk exec vitest run --config /tmp/vfy-r-p625-c/vitest.config.mts <file>`。HOME 用临时目录 `/tmp/bot-p625c-home-*`，没有读取任何凭证路径
- 方向 B 的时序窗口（B1/B2）本次不重复评审

## 结论

CONFIRMED 2 条，都是 minor（其中 1 条范围外）；没有 critical 或 major。P6-25 本身失败时是关闭的；除 write/edit 外，其他落盘通道都没能做到「无卡写到工作区外」。

| # | severity | file:line | 触发条件 | 实际表现 | 证据 |
|---|---|---|---|---|---|
| C1 | minor | `app/sdk/src/policy/shell-ask.mjs:310`（`tiers === null` 时先返回 ASK，排在 :322-342 的区外判定之前） | 档位表损坏：`profile/tiers.json` 非法，或 overlay 给的 `config.tiers` 非法（A9 ② 回退）。这是运维侧故障，模型控制不了 | 本该硬拒的写宿主 /tmp 退化成审批卡。卡上原因是 `tier table unavailable; failing closed to per-call approval`，没说目标在工作区外。用户批准后，`/tmp/bot-p625c-out/corrupt-*.txt` 在宿主上被创建，内容为 `p625c-corrupt`。决策 37 拒绝出卡的理由（用户无从判断一个 /tmp 路径该不该批）在这条回退路径上不成立。never 会话中仍是 deny | `evidence/P6-25-rvw/C/corrupt-tiers.out.txt`；单元格见 `failclosed.out.txt` 的 `e.corruptTiers.outside` |
| C2 | minor（范围外，P5-02 guard） | `app/sdk/src/policy/guard.mjs:153/159/171` | 写到 NEVER / 只读策略区 / mask 根（例如数据目录）下的路径 | 返回给模型的拒绝文本带了宿主绝对路径：canonical 目标和根都有，例如 `p2sdk-fs-guard: path "/tmp/bot-p625c-home-…/pbots-data/q4-….txt" is in a masked area (/tmp/bot-p625c-home-…)`。模型因此能拿到 mask 根（HOME 或数据目录）的位置，以及 realpath 后的软链目标。只泄露路径，不泄露内容 | `channels-log.json` → `q4.res[1]`，`hasData:[false,true]` |

### 问题 4：P6-25 自己的拒绝文本 → 不含宿主路径（CONFIRMED）
- 端到端拿到的 tool result 是 `Error: p2sdk policy: write-outside-workspace denied (the target is outside this session workspace; the call does not run)`。主会话、fork 子会话、subagent 子会话、run_code 嵌套调用、working_directory 之后的相对写，全部是这一串。用正则 `/(tmp|home)/` 检查为 0 命中（`q4.anyAbs[0]=false`）。

## 问题 1：失败时是否关闭 → 是（REFUTED「放行」）
单元探针用的都是真实模块，门开着（从未 provision），所以不是门在拦。结果都是 `{kind:'deny', reason: writeOut}`：
- ctx.fs 不可用：`get('fs')` 返回 undefined、`{}`、null，或 ctx 根本没有 `get`。共 4 格，全部 deny
- 路径解析抛错，或 resolve 返回畸形对象 / null：3 格，全部 deny（targets < total）
- 工作区根未知：sandboxPolicy 缺失、`resolve` 抛错、返回值没有 `workspaceRoot`、`workspaceRoot` 不是字符串：4 格，全部 deny
- 对照：区内写放行 → `next`；区外写 → deny
- **会话 header 没有 cwd（观察，不是缺陷）**：原样调用上游 `SandboxPolicyService.prototype.resolve` 时，header 无 cwd 和 agentless 两种情况都回落到部署根（`dsh-sandbox-policy lib/index.js:170`）。dsh-base 把这个部署根配成了 `process.cwd()`（`dsh-base cordis.patch.yml:247`）。所以 shell-ask 这时拿到的不是「未知」，而是一个具体的根，并按它判区内：探针中部署根为 `/` 时，写 `/tmp` 得到 `next`。实际走不到这里：API 的 `session/create` 一定会填 cwd（`dsh-api-session-controller lib/index.js:673`，缺省为 defaultCwd）；main 也强制 cwd（`app/ui/main/m3-meta/orchestrate.ts:195`）；子会话的 header cwd 继承父会话（`dsh-subagent lib/index.js:351`，C-subcwd 实测确认）。结论 REFUTED。这里记下来是为了说明：只要 `sandboxPolicy` 服务在，shell-ask 里「workspaceRoot 拿不到 → deny」这一分支就永远走不到
- 没有路径候选（file_path 缺失、是数组、是空串）→ `total=0 → next()`。端到端实测执行层的 schema 校验会拒（`invalid arguments: "file_path" must be a string`），宿主无文件，0 卡（`channels-log.json` → `argshape`）。REFUTED

## 问题 2：写盘通道覆盖面
各 preset 的实测工具表（`inventory.json`）：
- standard（也是缺省 preset）31 个工具
- cordis 在此基础上加 `cordis_inspect_list` / `cordis_inspect_query` / `plugin_market`
- ptc 只有 `run_code`，其余工具作为 SDK 绑定提供

已安装但不在任何 preset 工具表里的包：`tool-str-replace-editor`、`tool-terminal`、`tool-bash-persistent`。工具表中没有 notebook 类或 patch 类工具。

| 通道 | 档位 | 是否经过区域判定 | 无卡写工作区外的实测 | 结论 |
|---|---|---|---|---|
| write / edit | workspace-write | 是（P6-25） | e2e ①–⑦ 已覆盖；本次补测 working_directory 切到区外后的相对写 → deny，0 卡 | REFUTED |
| run_code（ptc preset，default=allow，无卡） | allow | 嵌套 `tools.write` 走同一条 pre-execute 管线 | 嵌套写 → 拒绝串一致；直接用 `node:fs` 写宿主 /tmp → `ENOENT`（worker 的 /tmp 是私有的）；写 `~/bot/.test-homes/…` → `ENOENT`；宿主上 3 个目标都不存在，0 卡 | REFUTED |
| workflow（default=allow） | allow | 脚本没有宿主 API | 结果是 `process is not defined`，`import()` 被禁，Function 逃逸只拿到没有 process / require 的全局对象；宿主无文件 | REFUTED |
| subagent_fork 子会话 | 继承 | 是（宿主平面 hook 作用于全部会话） | 子会话用绝对路径写宿主 /tmp → deny，子会话 0 卡 | REFUTED |
| subagent（带 `cwd=` 宿主 /tmp 目录） | 继承 | 是 | 子会话的 workspaceRoot 仍是父工作区，相对写 → deny，0 卡，宿主无文件 | REFUTED |
| bash / job_* | sandbox-allow（门未 provision → ASK） | 不经区域判定，靠 bwrap | 见问题 3：写 /tmp 落在私有 tmpfs；写 `~/bot` 下为 `ENOENT` | REFUTED |
| mcp__*（含 filesystem 连接器的写类工具） | ask | 不判区域，但一律出卡 | 单元：`mcp__filesystem__write_file` → ASK；never 会话 → deny。命名在上游恒带 `mcp__` 前缀（`dsh-mcp-client lib/index.js:97` publicToolName） | REFUTED（会出卡）。本次没有挂真实连接器跑端到端 |
| plugin_market（cordis） | allow | — | action 枚举只有 list_*（`dsh-plugin-market lib/types/tools.js:57`），安装要走 plugin_manager，而 plugin_manager 是 disabled + NEVER | 不是写盘通道 |
| schedule_* / todo_write / *_goal / send_message | allow | — | 都没有路径参数，只写会话或 runtime 状态 | 不是任意路径写盘通道，没有测 |
| web_fetch / present / skill / read_image | allow / workspace-read | — | 包内没有写盘调用（静态 grep） | 不是写盘通道 |

## 问题 3：bash 一侧的前提 → 成立（REFUTED「落宿主」）
- 普通 bash（经卡批准）的 `/proc/self/mountinfo` 里 `/tmp` 是 `tmpfs`。`echo > /tmp/bot-p625c-out/…` 得到 `No such file or directory`，宿主上不存在该文件。宿主预置文件 `hostseen-*.txt` 在沙箱里不可见（`test -e` 结果 1）。`/proc/net/dev` 只有 `lo`
- request_network 批准后，同一命令的 bash 没有再出卡（许可被认领），`/proc/net/dev` 为 `lo,tap0`，说明 slirp 联网态确实生效了。`/tmp` 仍是同一种私有 tmpfs，宿主文件同样不可见、不落盘。联网许可不改变 /tmp 视图

## 验证清单
- [x] 失败关闭：12 个单元格全部 deny；header 无 cwd 的情况走不到（已说明）
- [x] 各 preset 的工具表实测，逐个写盘通道实测
- [x] bash /tmp 视图：普通态和联网态都实测
- [x] 拒绝文本：P6-25 不带路径；guard 带路径（C2）
- [ ] 未测：真实 MCP filesystem 连接器的端到端调用（只有单元测试和源码命名证据）
- 清理：`scripts/bot-reap --dry-run --match p625c` 无残留（`evidence/P6-25-rvw/C/reap.txt`）。宿主侧的 `/tmp/bot-p625c-*` 和 `~/bot/.test-homes/p625c-out` 已删除
