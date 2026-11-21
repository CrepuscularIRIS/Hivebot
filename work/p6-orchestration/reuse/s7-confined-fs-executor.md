# S-7：confined 文件执行器反向确认

调研时间：2026-11-05。范围：P6-27、决策 40、PLAN §12.11。只读源码与公开元数据；未启动沙箱、未写测试文件、未改产品代码或 repos/，未读取凭证。

## 结论

**不能确认「必须自建约 80 行 stdio JSON」；已装上游已有可复用的通用执行器和 RPC。优先验证 `ctx.get('ptcRuntime').run(runtime.resolve(...))` 执行固定程序，在子进程中创建 `LocalFileSystem` 并调用 writeText/editText。** 它不是现成的 FileSystem 代理，但可以省掉自建传输、帧解析、子进程生命周期与输出上限处理；调用不要求模型使用 ptc preset。本次仅静态确认接口和默认接线，目标 wrapper 内真实 boot、导入和写入仍未验证，不把它冒充集成验收 PASS。

专用「confine 下 write/edit」适配器在已查 dsh 路径中**没有找到**；`dsh-api-remotes` 也不是这种适配器。GitHub 检索未找到比已装 PTC 更短、且维护标准完整核验的可直接替换者，不能外推为「全 GitHub 不存在」。因此 S-7 对自建必要性的反向确认结果是**未通过，先做 PTC 集成的第 0 步**，而不是批准重写协议。

## 决策行

阶梯级别按 bot/CLAUDE.md §3；表内未采纳者的“集成/改造”表示候选路线，是否采纳写在理由中。

| 能力 | 候选 | 阶梯级别 | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| ① 在 confine 视图中执行一次固定文件操作并回传 outcome | 已装 `@deepseek-ai/dsh-ptc-runtime-node@0.2.2-alpha.2` + `dsh-fs-local@0.2.2-alpha.2` | 1 | MIT，见本地上游 LICENSE:1 | 上游 HEAD commit 2026-11-04；npm modified 2026-11-04；issue 回应未验证（公开 list_issues 返回 0） | 集成 | **首选，需运行验证**。公共 resolve/run + 既有 control RPC；base 无条件注册 runtime，native executor 默认启用不影响 runtime。固定程序在 guest 内调用 LocalFileSystem，宿主只做 checkedTarget/withLock 与结果映射，不需新 stdio 协议。见 §1。 |
| ② 同类 bwrap 文件代理替代项 | `chenthre/pi-file-guard@b37b87aa1442900a593590d619fe8c349afe0a0a:sandbox-process.ts`；`Accio-Lab/Dressage@3e3142fe8ea07e4504c3b20a936a4c201a3de44c:dressage/sandbox/local/bwrap/supervisor.py`；`@anthropic-ai/sandbox-runtime` | 3（pi 候选）；2（Dressage 候选）；1（SRT 候选）；维护不完整者不获准作 1/2 级依赖 | MIT / Apache-2.0 / Apache-2.0 | commit 分别 2026-09-21 / 2026-08-27 / 2026-10-25；pi、Dressage issue 回应未验证；SRT #160 有 2026-10/11 人工讨论，维护者回应未确认 | 集成 | **均不采纳**。pi 只提供统一命令启动、文件策略仍是宿主判断；Dressage write_file 是宿主映射后直接 open；SRT 是命令包装器，不提供 LocalFileSystem outcome RPC，而且会引入第二套挂载策略。都不能少于已装 PTC 的接线量。见 §2。 |
| ③ 一次性启动开销与 p95 ≤ 1000ms | 上游 PTC per-call 的 confine → spawn → ready/run RPC → guest fs → cleanup 路径 | 1 | MIT | 同① | 集成 | 沿用 per-call，不提前做常驻助手。没有上游数值基准，源码无法给出 p95；PLAN:380 的 150–400ms 只能保留为未验证的工程估计。默认 graceMs=3000 是异常清理预算，不能误当成功路径固定开销；也意味着 1s 不是由现有默认值保证。见 §3。 |

## 1. dsh 已装执行路径

### 1.1 版本与证据约定

参考仓 `/home/lingxufeng/bot/repos/deepseek-harness` HEAD 为 `ce7073d51254c26cd63b22a60835b8f948deb447`。本地 `repos/MANIFEST.tsv:4` 已登记，未重复 clone。

下面 `R/` 表示该参考仓；`I(name)/` 表示已装包，准确展开为：

- `I(ptc-runtime-node)` = `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-ptc-runtime-node@0.2.2-alpha.2_0a5057ec85299f02133d1776126ad34c/node_modules/@deepseek-ai/dsh-ptc-runtime-node`
- `I(fs-local)` = `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-fs-local@0.2.2-alpha.2_@deepseek-ai+cordis@4.0.6-alpha.1_@deepseek-ai+_f54bd8548aeac58a0a9f4fac8a67e489/node_modules/@deepseek-ai/dsh-fs-local`
- `I(base)` = `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-base@0.2.2-alpha.2_01465288dceca7eaaa661770e359c71c/node_modules/@deepseek-ai/dsh-base`

参考仓源码和实际安装产物分别核对，不能用最新 HEAD 的行号代替 alpha.2。

### 1.2 现成执行器确实存在，而且不绑定 ptc preset

- `I(base)/cordis.patch.yml:393-394` 无 disabled 条件地注册 `ptc-runtime` → `@deepseek-ai/dsh-ptc-runtime-node`；`:497-502` 则默认启用 native executor、禁用 ptc executor。**runtime service 与模型工具执行器不是同一个开关**。对应参考源码为 `R/packages/bundle/base/cordis.patch.yml:396-397`。
- `R/packages/ptc-runtime/ptc-runtime-node/src/index.ts:19-20,65-95` 导出 `NodePtcRuntime`，依赖只有 fs/subprocess/sandbox/sandboxPolicy，公开 `resolve(request)`、`run(spec)`；没有 preset、ToolRegistry 或 ToolExecutor 前置。
- `R/packages/core/tool-executor-ptc/src/ptc.ts:81-89,675` 的 run_code 消费同一个 `ctx.get('ptcRuntime')`，再调用 resolve/run；这是消费者，不是唯一入口。
- 已装 `I(ptc-runtime-node)/lib/index.js:1257-1265` 接受显式 cwd/sandboxPolicy/timeout；`:1273-1293` 没有 stateOwner 就创建临时 ProgramWorker；`:1328` 的执行说明明确每次新 Node、支持 `await import(...)`。
- 已装 `I(ptc-runtime-node)/lib/index.js:1099-1133` 为真实路径：resolveExecutable → bootstrapArgs → **ctx.sandbox.confine** → **ctx.subprocess.spawn**，stdio 带独立 `control:'pipe'`，不用 stdout 充当控制帧。与 bash 复用同一 SandboxProvider；bash 接缝是 `R/packages/shell/bash-sandbox/src/index.ts:187-188`。
- 现成 RPC 在 `R/packages/ptc-runtime/ptc-runtime-node/src/rpc.ts:19`；worker 初始化与 ready 分派见 `worker.ts:271-287`；guest 连接见 `process.ts:69,131`。`ProgramWorker` 和 `rpc.ts` 不是已装包根导出的公共 API，不建议深导入；公共 runtime.run 已把它们包好了。

**最小接线方向（不是实现验收）**：

1. 非 ptc preset 的插件用 `ctx.get('ptcRuntime')`，缺失即拒，不通过启用 `tool-executor-ptc` 来获取它。若将来部署移除 runtime，用 Loader 注册 provider，但不改模型工具表。
2. 给 resolve/run 传会话同源、已解析的 workspace-write policy、cwd、signal、有限 timeout，`bindings: []`，不传 stateOwner；不要遗漏 policy 而回到部署默认值。
3. 固定 function-body 程序通过绝对 file URL 导入上游 fs-local 与 Cordis，在 **guest 内** `new Context()` 并 `ctx.plugin(LocalFileSystem, {cwd, diffBasisMaxBytes})` 后调用 writeText/editText；输入用 JSON 字面量序列化，不拼接原始模型文本为代码。返回 JSON outcome；捕获 FsError 后把 code/message 包成普通 JSON 以保留 FS_STALE_VERSION 等语义。
4. 宿主核对 runtime result.error、value 形状，再还原 FsError/outcome；任何启动、导入、RPC、异常、取消、清理错误都拒绝，不回落宿主写。保留宿主 withLock。

guest LocalFileSystem 的 Loader 用法已有 `R/packages/fs/fs-local/tests/filesystem.spec.ts:27-28,47-49`；已装 constructor 校验 diffBasisMaxBytes，不能不经默认值处理就随意 `new LocalFileSystem(ctx,{})`（`I(fs-local)/lib/index.js:764-780`）。writeText/editText 完整 outcome、expected 校验、CRLF 恢复和 mode 保留见 `:877-911`。

**安全上不可混淆的区别**：给 PTC `bindings` 塞一个调用宿主 `ctx.fs.writeText` 的函数不会把文件写入移进沙箱。worker 的 binding invoke 在宿主执行（`R/.../worker.ts:142,285-299`）。本方案必须在固定 guest 程序中导入并调用 LocalFileSystem，而不是把文件操作绑回宿主。

**仍待 P6-27 第 0 步核验**：Node 可执行文件、process.js、fs-local 和 Cordis 的真实安装路径均可在当前 HOME 遮蔽与 mount-back 下加载；guest 模块解析与配置默认值可用；outcome JSON 上限覆盖 10KB 写及 diff；错误码回传无损。已装 bootstrap 映射、默认 `process.execPath` 和 source/built 分支见 `R/.../launch.ts:27-28,44-72`。路径不可见是 PTC 与自建 Node 助手共有问题，不能据此直接证明后者更可行。

### 1.3 专用 FS / remote 路径为何不能直接用

已逐项查过：

- `packages/sandbox/sandbox{,-local,-policy}/src`：confine 生成受限 argv，不执行 FS 方法。`R/packages/sandbox/sandbox-local/src/index.ts:325`；已装 `sandbox-local/lib/index.js:307-324` 的 runnerCommand 分支直接使用部署 wrapper。
- `packages/fs/{fs,fs-local,fs-sandbox,fs-patch,tool-fs,tool-fs-search}/src`：没有一个 write/edit RPC helper。`fs-sandbox/src/index.ts:80-108` 是 checkedTarget 后 `super.writeText/editText`，仍在调用者进程；不是 mount namespace 隔离。
- `packages/shell/{shell,bash-local,bash-sandbox,tool-bash,tool-bash-persistent}/src`：有命令执行，没有能直接返回 FsWriteOutcome/FsEditOutcome 的文件执行器。
- `packages/api/remotes/src/{index,types,client/index}.ts`：`index.ts:37-43` 只注入 typertGateway 并 registerRemoteEvents；不是远端 FileSystem 实现。
- `packages/core/tool-executor-ptc` 与 `packages/ptc-runtime/ptc-runtime-node`：有上文可复用的通用程序执行器，不能记成“没有 helper/RPC”。
- **另找到真实远端 FS，但不适配本题**：`R/packages/ssh/fs-ssh/src/index.ts:16-17,78-90,116-121` 的 SshFileSystem 通过 `ctx.ssh.request('fs.write'/'fs.edit')`；`ssh/src/helper-entry.ts:15-18` 有 stdio helper，`ssh/src/helper.ts:235-250` 调 helper 进程内的 ctx.fs。它依赖 SSH 握手/租约/流/部署路径；默认 helper 文件操作不是每次在 bash bwrap 视图内执行（sandbox 是另一个 RPC 方法，`:156-160`）。已装 pnpm 中未发现 fs-ssh。拿它套本地 pipe 要换 transport、helper 启动和策略边界，反而重于公共 PTC run，不建议复制改造。

本地还查了 `work/*/REUSE.md`；`work/p6-orchestration/REUSE.md` 当前不存在，未找到另一项已选的 confined FS executor 可共用；未改其他 scout 文件。

## 2. GitHub 与包仓库对照

### 2.1 检索范围

GitHub MCP repository 查询：`bubblewrap filesystem rpc`（0 项）、`sandbox filesystem bubblewrap`。code 查询：`"bwrap" "write_file" language:Python`、`"bwrap" "writeFile" language:TypeScript`、`"bwrap" "filesystem" "stdio"`、`"setns" "write_file" "helper"`。后者有大量无关结果，未深读与题意无关的安全研究代码。只读公开源码，未 clone（任务规定 repos/ 只读）。

npm 实查：

- `npm view @deepseek-ai/dsh-ptc-runtime-node version time.modified repository --json`：默认 tag 返回 `0.1.6-alpha.1`，modified 为 2026-11-04；**默认 tag 不等于最高/已装版本**。额外 `npm view @deepseek-ai/dsh-ptc-runtime-node@0.2.2-alpha.2 version time --json` 确认该精确版本存在。
- `npm view @deepseek-ai/dsh-fs-local version time.modified repository --json`：默认 tag 为 `0.0.1-rc.1`，modified 2026-11-04；本项目已装 `0.2.2-alpha.2` 以本地 package.json 为准。应锁已装版本，不按默认 tag 回退。
- `npm view @anthropic-ai/sandbox-runtime version time.modified repository --json`：`0.0.81`，modified 2026-10-20。
- `npm view pi-file-guard version time.modified repository --json`：404；其最新 commit 正文也明确只有 git 分发。

### 2.2 同类候选源码结论

1. **pi-file-guard**：[`sandbox-process.ts`](https://github.com/chenthre/pi-file-guard/blob/b37b87aa1442900a593590d619fe8c349afe0a0a/sandbox-process.ts) 的 startSandboxedProcess/runSandboxedProcess 为 bash/find/grep 统一编译 bwrap 参数并起进程，stdin 是 ignore，不是文件 RPC；[`enforce.ts`](https://github.com/chenthre/pi-file-guard/blob/b37b87aa1442900a593590d619fe8c349afe0a0a/enforce.ts) 的 resolveFileToolMode 是宿主 canonical 路径策略。最近 commit 2026-09-21，在 6 个月内；closed issues 列表为空，无法验证 issue 回应。不是已维护可直接引入的文件 outcome helper。许可证已读 [`LICENSE`](https://github.com/chenthre/pi-file-guard/blob/b37b87aa1442900a593590d619fe8c349afe0a0a/LICENSE)。
2. **Dressage**：[`supervisor.py`](https://github.com/Accio-Lab/Dressage/blob/3e3142fe8ea07e4504c3b20a936a4c201a3de44c/dressage/sandbox/local/bwrap/supervisor.py) 的 read_file/write_file（搜索方法名定位）取得 `_sandbox_path_to_host` 后直接 `read_bytes` / `host_path.open`，**是宿主侧文件 I/O，恰好不满足 P6-27 目标**。最近 commit 2026-08-27；最近三条 issues 无 comments 字段/回应证据，不声称满足完整维护标准。许可证已读 [`LICENSE`](https://github.com/Accio-Lab/Dressage/blob/3e3142fe8ea07e4504c3b20a936a4c201a3de44c/LICENSE)。
3. **Anthropic sandbox-runtime**：[`src/index.ts`](https://github.com/anthropic-experimental/sandbox-runtime/blob/98a4016d27609ed34dd1fb43d23ed6efb6eeeb77/src/index.ts) 公开 SandboxManager、配置、平台工具，无远端 FileSystem / write/edit helper；其能力是命令沙箱，不省掉文件协议适配，而且要与现有 confine 争两套 policy。最近 commit 2026-10-25，npm 0.0.81；[#160 人工讨论](https://github.com/anthropics/sandbox-runtime/issues/160#issuecomment-6482666225) 可证 issue 有人回应，但读到的 author_association 是 NONE，未证维护者回应。许可证已读 [`LICENSE`](https://github.com/anthropic-experimental/sandbox-runtime/blob/98a4016d27609ed34dd1fb43d23ed6efb6eeeb77/LICENSE)。

[dsh 上游最新 commit](https://github.com/deepseek-ai/deepseek-harness/commit/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159) 日期为 2026-11-04。MCP list_issues 返回 0，尝试读取 #7873 comments 返回 404；不能用合并 PR 的存在编造 issue 服务响应证据。推荐①基于已装、可核对的公共接口，完整“在维护”标准的 issue 条件仍标未验证。

## 3. 启动延迟：能判断什么，不能判断什么

本次按只读要求不做 spawn / 写入基准；上游 tests 检索未找到可引用的每次 10KB write 的 p50/p95。**p95 ≤ 1s 仍是 P6-27 验收项，不是 S-7 已证明的性能事实。**

可从源码分解的成本为：

`T_total = 宿主检查/锁等待 + resolveExecutable/confine + subprocess 管理启动 + python wrapper + bwrap 挂载 + Node 与模块加载 + RPC ready/run + LocalFileSystem 原子写 + 子进程回收/流排空`。

- `app/sdk/src/start.ts:193-225` 将 sandbox-local 配为 python3 -I wrapper；已装 sandbox-local 的 runnerCommand 分支（`lib/index.js:307-324`）不做每写一次的功能探测。不能把默认 probeTimeoutMs=5000 算成每次启动的必付成本。
- `app/sdk/sandbox/bwrap-wrap.py:402` 常规路径 `os.execv(BWRAP, out)`；不是再启动一个常驻 Python 服务。网络许可路径有额外 supervisor/网络准备等待，本题不应默认附加该许可，失败时也不改用宿主写。
- PTC 每次仍是一个 Node worker，不是“PTC worker 再 spawn 一个 FS helper”。它只在 worker 内导入 fs-local；固定程序无模型请求。与拟自建路径相比多的是已有 control ready/run RPC 和较大的 process.js 引导模块，省掉的是自行维护的协议与生命周期。
- PTC 成功返回**包含清理时间**：`I(ptc-runtime-node)/lib/index.js:996-1014` 的 finish 等 stop 完成，`:1049-1062` 调 terminateProcess(handle, graceMs)；默认 `graceMs=3000`（`:80`），默认 timeoutMs=120000（`:74`）。这两个默认值都不是 P6-27 的 1s 成功上界，不能直接照抄成产品 SLO 保证。
- 小文件的一次性启动可暂按**百毫秒量级的规划预算**考虑；PLAN:380 的 **150–400ms 未经测量**，不能从静态代码推出，也无法据此推断 p95。冷缓存、HOME mount-back 数量、并发锁排队、机器负载、模块加载和异常清理都能越过 1s。

后续验证应保持 PLAN:131 的 **10KB × 100 次，统计包含 cleanup 的端到端 p50/p95**；另外单列冷启动和失败清理耗时。比较 PTC 与自建 helper 必须用同一 policy、同一 wrapper、同样的 fs-local 配置与并发口径。先验证 PTC 路线；只有实际不可用、输出上限无法满足或确实超预算，且给出复现证据后，才有理由回到一次性自建 stdio 或常驻助手。当前尚无这些否决证据。
