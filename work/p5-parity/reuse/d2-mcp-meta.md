# D-2 MCP 元数据桥 · 三问前查

调研日期：2026-11-03。只读检查源码、GitHub 和已装包；未改产品代码、未向上游提 issue/PR、未连接真实 MCP server。供 `PLAN.md:118-124` 的 /panel D 使用，不代替投票。

## 0. 基线与结论

- **分支纠正**：上游没有 `main`，仅有默认分支 `master`。GitHub `list_commits(sha=main)` 返回 404；`get_file_contents(ref=main)` 明确提示回退 master。随后用 master 显式重查，HEAD 与本地同为 `ce7073d51254c26cd63b22a60835b8f948deb447`，不存在本次可直接升级拿到的新实现。[branches](https://api.github.com/repos/deepseek-ai/deepseek-harness/branches)；[仓库元数据](https://api.github.com/repos/deepseek-ai/deepseek-harness)。
- 最近 commit：2026-10-29T16:13:15Z，[ce7073d](https://github.com/deepseek-ai/deepseek-harness/commit/ce7073d51254c26cd63b22a60835b8f948deb447)；最近 release：2026-10-30T02:12:26Z，[dsh-v0.2.1-rc.5](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.5)。仓库 `has_issues=false`、可见 issue/PR 搜索均为 0，因此 **issue 有人回应未验证**，不能把「近期提交」写成满足全部维护条件。源码与包许可证均 MIT，[LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/LICENSE)。
- **(a) 现有可消费接口：否；计划线索：是，但仅归档 Deferred，当前承诺/排期未验证。(b) 否。(c) 否。** ①目前不能直接落地；②需要补元数据获取与命名；③也不能省掉稳定身份桥，至少要命名函数复制改造及可信身份来源。

路径缩写（下文文件:行均以此展开）：
- `D` = `/home/lingxufeng/bot/repos/deepseek-harness`，SHA 如上；已在 `/home/lingxufeng/bot/repos/MANIFEST.tsv:4`，未重复 clone。
- `P` = `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-mcp-client@0.2.2-alpha.2_ae3c7983d072d76e13b58b7b6d93451a/node_modules/@deepseek-ai/dsh-mcp-client`。
- 已核对本地既有结论 `/home/lingxufeng/bot/work/p5-parity/reuse/r4-tool-gates.md:21,86,115`；`work/*/REUSE.md` 本次未检出可共用的 MCP 元数据桥。

## 1. (a) 上游有无 annotations / 来源元数据给策略层

**是/否：当前实现否；历史规划线索是，不能当成已提供接口或当前开发计划。**

证据：
1. `D/packages/mcp/mcp-client/src/tools.ts:119-142` 从 `client.listTools` 得到原始 tool，却只向适配器传 `name/rawName/description/inputSchema/outputSchema/taskRequired/call`。完整 tool 仅闭包保留于 `client.callTool(..., {toolDefinition: tool})`，不是策略服务。`tools.ts:229-246` 返回的 harness 定义无 annotations、serverName 或 toolSource。[源码锚点](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/mcp/mcp-client/src/tools.ts#L119-L150)。
2. `D/packages/core/tools/src/contracts.ts:174-223` 的执行对象也无 MCP 身份字段；可选 `schema` 并未补入这些字段。已装包 `P/lib/index.js:127-153,179-197` 与源码一致。
3. GitHub code search 的 `readOnlyHint` 有 **4 个命中**，不是零：2 个归档 plan-mode 笔记（中英）和 2 个 MCP browser snapshot catalog。归档英文笔记 `D/.agents/notes/archived/feature/2026-07-07-plan-mode.md:122-124` 明确 Deferred「effects self-declaration on tool definitions」，以 `readOnlyHint/destructiveHint` 为自然模板，并说通用 per-mode 策略等待它；该笔记已于 2026-07-26 归档。**这是历史意向，不是具体 MCP metadata bridge 已有实现，也没有当前排期。** [Deferred 原文](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/.agents/notes/archived/feature/2026-07-07-plan-mode.md#L122-L124)。
4. `toolSource` 的 GitHub code search 唯一命中 `D/scripts/gen-tool-catalog.ts:836-845`，是离线文档生成时定位源码文件，不是运行时 MCP 来源服务。[源码](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/scripts/gen-tool-catalog.ts#L835-L845)。`annotations path:packages/mcp` 唯一命中 image content 注解测试（`mcp-client/tests/mcp-client.spec.ts:428`），不是工具读写 hint。
5. GitHub MCP 对 issues 的三个关键词分别检索、PR 的三个关键词分别检索，均 `total_count=0`；另用 GitHub REST `search/issues?q=repo:deepseek-ai/deepseek-harness (annotations OR readOnlyHint OR toolSource)` 复核为 0。仓库关闭 issues、可见 PR 全集也为 0，**只能写未发现可见 issue/PR，不推断维护者无私有计划**。

检索链接（均包含已关闭项目，不限 open）：
- issues：[annotations](https://github.com/search?q=repo%3Adeepseek-ai%2Fdeepseek-harness+is%3Aissue+annotations&type=issues)、[readOnlyHint](https://github.com/search?q=repo%3Adeepseek-ai%2Fdeepseek-harness+is%3Aissue+readOnlyHint&type=issues)、[toolSource](https://github.com/search?q=repo%3Adeepseek-ai%2Fdeepseek-harness+is%3Aissue+toolSource&type=issues)。
- PR：[annotations](https://github.com/search?q=repo%3Adeepseek-ai%2Fdeepseek-harness+is%3Apr+annotations&type=issues)、[readOnlyHint](https://github.com/search?q=repo%3Adeepseek-ai%2Fdeepseek-harness+is%3Apr+readOnlyHint&type=issues)、[toolSource](https://github.com/search?q=repo%3Adeepseek-ai%2Fdeepseek-harness+is%3Apr+toolSource&type=issues)。

**对①②③影响：①不能靠升级现有 master 实现，归档 Deferred 也不满足可集成条件；②仍需桥；③可回退 ASK，但 P5-24 的身份问题仍需解决。**

## 2. (b) ctx.get 能否按已注册名取原始 MCP tool

**否。存在可拿的工具注册表，但拿到的是丢失元数据后的 harness ToolDefinition，不是原始 MCP Tool。**

比较两个最直接的已有服务，避免把「有服务」误读成「有原始元数据」：

| 候选入口 | 实际能力 | 否决证据 |
|---|---|---|
| `ctx.get('tools')?.get(toolName, exec.agent, exec.toolSet)` | 按调用方 scope 精确取得已注册 harness 定义 | `D/packages/core/tools/src/index.ts:229-240`；定义由 `mcp-client/src/tools.ts:229-246` 构造，原始 tool/serverName/annotations 没带入。不能恢复闭包里的 tool |
| `ctx.get('mcpResources')`（可选）及 `systemPrompt` | 前者登记 server 的资源访问，后者贡献 server instructions | `D/packages/mcp/mcp-client/src/server-context.ts:12-39` 只公布 `resources` 和 `instructions`；`D/packages/mcp/mcp-resources/src/index.ts:20-33,121-125` 仅支持 resources/list、templates/list、read，调度 request 本身还是 private；不是任意 MCP RPC / tools/list 入口 |

连接 supervisor 的 `client` 是 `startConnection` 内局部变量（`D/packages/mcp/mcp-client/src/connection.ts:145-146`）；返回值只有 ready、instructions、resources、dispose（`:363-415`）。插件 apply 不返回连接，也未注册可查询工具元数据的 Service（`src/index.ts:154-203`）。

产物交叉核对：`P/lib/index.js:732-743` 同样仅向 mcpResources、systemPrompt 注册；末行 `:836` 无连接/查询服务导出。[上游 server-context](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/mcp/mcp-client/src/server-context.ts#L12-L39)；[连接返回值](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/mcp/mcp-client/src/connection.ts#L363-L415)。

**对①②③影响：①无 ctx.get 捷径；②不能复用现有连接只加一次 tools/list，若旁路查询须自持第二连接（stdio 可能是第二 server 进程），或改造注册桥；③同样不能凭 tools.get 取得稳定原始身份。**

## 3. (c) publicToolName 是否从包入口导出

**否。源文件级 export 是，包入口 export 否；已装运行时也否。**

- 算法本身现成且确定：`D/packages/mcp/mcp-client/src/tools.ts:44-54,68-86`。先拼 `mcp__${serverName}__${rawName}`；非法字符替 `_`；若替换或超过 64 字符，保留前 51 字符，加 `_` 与 `sha256(serverName + NUL + rawName)` 的前 12 个十六进制字符。不能反拆，但可正向生成。[算法源码](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/mcp/mcp-client/src/tools.ts#L44-L86)。
- 包入口 `D/packages/mcp/mcp-client/src/index.ts:26-28` 只再导出 createMcpToolDefinition 和相关类型，未再导出 publicToolName；`P/lib/types/index.d.ts:18-20` 一致。产物内函数为 `P/lib/index.js:96-102`，但 `:836` 仅导出 `Config, apply, createMcpToolDefinition, inject, name`。
- 实际动态 import 已装 `P/lib/index.js`，输出 `{"exports":["Config","apply","createMcpToolDefinition","inject","name"],"hasPublicToolName":false}`；没有启动应用或 MCP server。
- `package.json:16-29` 虽声明 `./src/*` exports，但发布 files 不包含 src；实查 `P/src` 不存在，不能用这个看似公开的深导入逃生口。[package.json](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/mcp/mcp-client/package.json#L16-L29)。

**对①②③影响：①不能直接 import 命名函数；②应复制这个小函数而非自写近似算法；③的“用(c)直接正向计算”前提不成立，但复制函数即可正算，仍须从可信配置/发现结果取得 serverName、rawName 并建立表。**

## 4. 包仓库核查与决策行

已执行 `npm view @deepseek-ai/dsh-mcp-client version time.modified repository --json`、显式版本查询以及 dist-tags/time 查询。registry 为 `https://registry.npmjs.org/`：
- `latest=0.0.1-rc.1`，`next=0.2.1-rc.5`，`alpha=0.2.2-alpha.2`；**npm view 的裸 version 不是最高/本地版本，不能据此宣称本地过新或包没发布**。
- `0.2.2-alpha.2` 于 2026-10-27T18:47:45.287Z 发布；包 modified 为 2026-10-29T13:47:12.883Z；repository 指向同一上游。显式 `npm view ...@0.2.2-alpha.2` 返回版本与 tarball URL。[npm 元数据](https://registry.npmjs.org/@deepseek-ai%2Fdsh-mcp-client)。

本次是固定 dsh 底座的接口核查，不是换 harness 选型；已比较 tools 注册表和 mcpResources 两个现有入口，以及包入口/源文件两种命名复用路径。下列为可供 panel 采用的能力决策，不是替 panel 选择②或③。

| 能力 | 候选（owner/repo@path 或 npm 包名） | 阶梯级别（1～5） | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| 稳定工具名正向计算 | deepseek-ai/deepseek-harness@packages/mcp/mcp-client/src/tools.ts:44-54,68-86 | 3 | MIT | commit 2026-10-29；release 2026-10-30；issue 回应未验证 | 改造 | 第1级已装包不导出；第2级整仓也不会凭空产生公开入口，且为一个小函数引入整套源码构建无益。复制 publicToolName 及3个常量，沿用 node:crypto；锁定来源 `https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:packages/mcp/mcp-client/src/tools.ts`。须测干净名、点号、长名、两server同rawName，并和锁定产物注册结果核对 |
| 原始身份/annotations 查询桥（仅②或③身份子集获批时） | @deepseek-ai/dsh-mcp-client；@deepseek-ai/dsh-tools；@deepseek-ai/dsh-mcp-resources | 5 | 上述依赖均来自该 MIT 仓 | 同上；已装 mcp-client 0.2.2-alpha.2 发布2026-10-27 | 自建 | 当前公开服务均不保留/暴露这些数据，升级同HEAD无效；原样整仓集成仍无接口；复制现有函数也无法取得已封闭的连接/原始tool；行为开源，无需逆向。只补缺的可信映射与查询，不重写协议客户端；命名用上一行第3级改造。若改为复制改造整个注册桥，须另评估接管连接生命周期的范围，不能算“纯插件读取已有服务” |

## 5. 给 D-2 题干的修正提示

1. ①的触发条件应是“(a)/(b)存在**当前可消费实现**”，不是历史 Deferred 提到过 hint；目前不满足。
2. ②的“自己发一次 tools/list”不是对现有 mcp-client 连接可直接调用的方法。旁路第二连接能否复现同一个工具集合、stdio 是否有状态/启动副作用，**未实证**；不能只记“多一次 RPC”的成本。已有连接按 listChanged 通知重同步（`connection.ts:257-269,296-300`），额外映射必须跟注册代际、作用域和卸载一致，失配/未知时回 ASK，不沿用陈旧 hint 放行。
3. ③只是去掉 hint 分档，不自动解决 P5-24。复制 publicToolName 可解决命名计算，但没有 rawName 清单仍算不出身份；不能以反拆名字代替可信发现。按 scope 查真实注册项，并防同名覆盖/代际变化造成元数据误配，需在实现验收验证。
4. 本次未做真实运行组合或第二连接 spike；metadata bridge 可行路线是静态源码结论，不能写成已端到端跑通。
