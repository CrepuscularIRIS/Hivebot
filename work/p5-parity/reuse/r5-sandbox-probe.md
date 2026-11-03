# R5 · 本机 workspace-write 沙箱实测

日期：2026-11-03。结论范围：**真实 app/sdk 启动器 → 已安装 dsh 0.2.2-alpha.2 → fake LLM 发 bash 工具调用 → 默认审批策略 → 真实进程沙箱**。没有调用真模型，没有注入真实用户凭证，没有读取真实 HOME 下的凭证。

## 结论先行

1. **默认 bwrap 的写隔离有效，但不是“只能写 cwd”**：工作目录可写；工作目录外的普通宿主目录写入报 `EROFS(30)`，文件不存在；`/tmp` 可以写，是每次调用的私有 tmpfs，宿主看不到该文件。临时 HOME 位于 `/tmp/r5-sandbox`，默认 bwrap 下该目录被整个 `/tmp` tmpfs 遮住，写 `$HOME/...` 报 `ENOENT(2)`。**不能把这个 ENOENT 当成 HOME 凭证拒读策略。**
2. **默认没有网络隔离**：真实 bash 子进程访问本次创建的 loopback HTTP server、`https://example.com` 均为 HTTP 200。通过现有 sandbox `runnerCommand` 加 `bwrap --unshare-net`，在不改变工作目录写权限的情况下可关闭网络；实测宿主 loopback 被拒、外网域名无法解析。没有内置的 per-call `network` 策略字段，也没有自动“联网 → ASK”机制。
3. **默认没有工作目录外拒读**：外部哨兵文件、由 `DSH_HOME` 定位的测试文件均能读。通过 bwrap wrapper 在默认挂载规则之后追加 `--tmpfs <拒读目录>`，真实 SDK 内原文件变成 ENOENT；通过现有 Landlock 执行器改用最小读白名单，外部哨兵和 DSH_HOME 测试文件变成 EACCES。**两种都能配置组合实现，但都不是现成 denyReadPaths 开关。**
4. **敏感键名过滤生效，不等于完全没有环境泄漏**：mock 和 real 启动模式均未在 bash 中看到 `P2SDK_LLM_API_KEY`；`LITELLM*`、`OPENAI_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 哨兵键未进入。普通 `P2SDK_*` 仍继承，且 shell-env **主动重新注入 `DSH_HOME` 等键**。不能沿用“scrubber 去掉 DSH_*，因此 shell 不知道 runtime home”的假设。
5. **Landlock 回退与 bwrap 的 /tmp 语义不同**：实测触发上游正常回退后，`/tmp` 是宿主 `/tmp`，临时 HOME 外写也成功；外部普通目录写入仍被 EACCES 阻止。若 runtime/token/grants 放在 `/tmp`，不能仅靠 workspace-write 确保不可写。

**对 BRIEF 路线 1 的判断**：本机“写保护”前提成立；“凭证 NEVER / 外部文件 ASK / 联网 ASK”默认不成立。OS 原语能够补齐，但实施前仍需接入路径隐藏或白名单，以及独立网络审批/重试设计；不能仅取消 shell-ask 就宣布 A3/A4 满足。

## 复现入口与证据

探针：`/home/lingxufeng/bot/work/p5-parity/evidence/r5-probe.mjs`。

统一复现命令 C1（依赖 app/sdk 已 setup，约 25 秒；每次创建新的独立证据目录）：

```bash
pnpm -C /home/lingxufeng/bot/app/sdk exec node \
  /home/lingxufeng/bot/work/p5-parity/evidence/r5-probe.mjs
```

- SDK 及其模型 bash 全部使用 `HOME=/tmp/r5-sandbox`。工作目录是本次 `mkdtemp` 创建的 `work/p5-parity/evidence/r5-run-*/<mode>/workspace`，故意不放 `/tmp`，否则 Landlock 的 `/tmp` 特许会使“写越界测试”失去意义。
- 用现有 `app/sdk/tests/support/fake/plugin.mjs`，不复制/修改上游；完整保留默认 shell-ask，每组收到 **1 次审批并由测试客户端 allowed-once**，之后跑真实沙箱。不声称已经实现“零审批”。
- 只有测试创建的 ChildProcess 被 SIGTERM；启动器向自己创建的 dsh child 转发退出。没有 pkill、sudo 或真实配置目录操作。
- 子进程 env 从显式 allowlist 构建，敏感键只注入固定哨兵，命令只输出键名、不输出值。real-fake 组启用 `P2SDK_PROVIDER=real` 的真实启动与 env 分支，但模型仍由 fake provider 接管；不代表真 LiteLLM provider 的服务端认证测试。
- 启动时产生的临时 launch-token 交接目录已在退出后删除；复现脚本也自动删除。原始历史试跑不作为最终证据。

**最终有效证据 E**：`/home/lingxufeng/bot/work/p5-parity/evidence/r5-run-qXloBM/`。

每个 `<mode>/command.sh` 是模型实际执行的完整复现命令；`<mode>/frames.json` 包含真实 `tool/result`；`<mode>/patch.yml` 是该组配置；`summary.json` 汇总宿主文件检查和结果。C1 含关键 assert：工作目录写成功、外部写失败、网络关闭组不可访问、拒读组不可读、API key 不在 env。另对最终六组证据校验了审批次数、宿主外部文件不存在和交接凭证目录已删除，全部通过。

## ① 写工作目录外与 /tmp

复现：C1 的 `default-mock`、`default-real-fake`、`landlock-fallback`；直接查看 E 下同名组的 `command.sh`。命令用 Python `open(path,'w')`，保留 errno，宿主再次检查文件存在性。

| 探测目标 | 默认 bwrap（mock / real-fake 相同） | Landlock 正常回退 |
|---|---|---|
| `<cwd>/inside` | 写成功；宿主文件存在 | 同左 |
| `<临时组目录>/outside`（cwd 的同级，不在 /tmp） | EROFS 30，宿主文件不存在 | EACCES 13，宿主文件不存在 |
| `$HOME/outside-<mode>`，HOME=/tmp/r5-sandbox | ENOENT 2；HOME 被 /tmp tmpfs 遮住 | **写成功，改到宿主临时 HOME** |
| `/tmp/r5-write-<mode>` | 写成功；宿主该路径不存在 | 写成功；**宿主文件存在** |

- 源码证据：`repos/deepseek-harness/packages/sandbox/sandbox-local/src/profiles.ts:16-35`。bwrap：`--ro-bind / /`、workspace-write 时 `--tmpfs /tmp`，再把 workspace roots bind 回来；Landlock：`readOnly:['/']`，`readWrite:['/dev/null','/tmp',...workspaceRoots]`。
- 回退不是伪造 Landlock 结果：`landlock-fallback` 只在本次 PATH 最前放一个返回失败的 bwrap，使上游功能探测失败后按正常 Linux chain 选择 Landlock。源码：`sandbox-local/src/index.ts:68-75,156-180`。本机已安装 `landlock-run --probe` 返回 `landlock: fully enforced`。
- `/tmp` 允许项必须写进 §7 第 1 行的定义，不能笼统称“只限 cwd”。本次并未测试符号链接、硬链接、open fd、Unix socket 等完整逃逸矩阵，不能据此宣布安全验收通过。

## ② 网络：默认放行，能与写权限分开配置

复现：C1 的 `default-mock` 与 `network-off`；完整 URL 和请求代码在 E 对应 `command.sh`。loopback 端口是探针现场创建的服务，不接触 LiteLLM 或其他本机服务。

| 配置 | 工作目录写 | 本次 loopback HTTP server | HTTPS example.com |
|---|---|---|---|
| 默认 bwrap | 成功 | 200 | 200 |
| bwrap + --unshare-net | 成功 | Connection refused（111） | DNS failure（-3） |
| 默认 Landlock 回退 | 成功 | 200 | 200 |
| 定制 Landlock 读白名单 | 成功 | **200，证明仍可联网** | DNS failure；这里是读规则阻断 DNS 所需路径，不是网络 namespace 隔离 |

实测生效的 overlay（**配置 ID 是 `sandbox`，不是 `sandbox-local`**）：

```yaml
- id: sandbox
  config:
    runnerCommand: ['/usr/bin/bwrap', '--unshare-net']
    runnerFailureSignatures: ['bwrap: ']
```

- 这是直接利用现有配置扩展点，不需要 fork。provider 将默认文件 profile 参数接在 runnerCommand 后：`sandbox-local/src/index.ts:325-350`；配置 schema 见同文件 `45-65`。
- 默认接口明确只表达文件效果，network/process visibility 在其范围外：`sandbox/src/index.ts:24-59`。所以这里可静态设置整套 bash runner 的网络，而不是每次 bash 调用携带网络档位。
- **§7 第 3 行可实施，但不能只加“curl 命令名 → ASK”**。关闭 namespace 后任意程序的 TCP/DNS 都失败；需要审批后走受控的联网 runner/重试通道。`sandbox_permissions=workspace-write` 不会独立打开网络。上游默认 bwrap profile 没有 `--unshare-net`。
- 自定义 runnerCommand 跳过默认 backend 自动选择；bwrap 不可用时必须保持 fail-closed，不能回退到默认联网 Landlock 却继续声称网络已隔离。

## ③ 拒读路径与 §7 第 5、6 行

复现：C1 的 `default-mock` / `hide-read` / `landlock-read-allowlist`。只读本次创建的公开测试文件，不触碰 ~/.ssh 等真实目录。

| 探测 | 默认 | bwrap tmpfs 隐藏指定目录 | 定制 Landlock 读白名单 |
|---|---|---|---|
| 工作目录外 `<组目录>/secret/sentinel` | 可读 | ENOENT 2 | EACCES 13 |
| 通过 `$DSH_HOME/r5-control` 读取 runtime 哨兵 | **可读** | 可读（本组只隐藏 secret，未隐藏 runtime） | EACCES 13 |

**bwrap 路径覆盖**：E 的 `bwrap-wrapper.py` 接收 dsh 生成的完整 argv，在 `--` 分隔符之前、也就是 `--ro-bind / /` 和 workspace rebind **之后**插入 `--tmpfs <secret-dir>`，最后 exec `/usr/bin/bwrap`。对应 overlay 在 `hide-read/patch.yml`。如果在 `runnerCommand` 最前直接加 `--tmpfs <path>`，后续 `--ro-bind / /` 可能覆盖遮蔽结果，所以必须检查挂载顺序。此次证明的是“原目录不可读”，不是“该路径下禁止写入影子文件”；tmpfs 可写且不改宿主原目录。

**Landlock 读规则**：E 的 `landlock-wrapper.py` 通过现有 `runnerCommand`，把默认 bwrap-profile 参数转换为安装好的 `landlock-run` argv：只对 `/usr /bin /lib /lib64 /etc /dev` 授读，对 `/tmp` 和当前 cwd 授读写，不再授 `--ro /`。实测外部文件与 runtime 文件均 EACCES，cwd 写仍成功。

- Landlock 是 **allowlist**，不是可在 `--ro /` 下覆盖的 denylist。默认授读 `/` 后，不能靠子目录的更窄 grant 把读权限减掉。原语接口：`native/system/packages/entry/src/index.ts:43-51,85-98`；内核读规则构造：同目录 `main.c:244` 起；默认全部授读：`sandbox-local/src/profiles.ts:30-35`。
- 此白名单只是可行性探针：它仍允许宿主 `/tmp`，且 DNS 依赖路径尚未补齐；**不能原样作为产品安全配置**。实际需把私有 temp、解释器/动态库、DNS、插件运行依赖纳入明确策略，避免为了兼容又授读 `/`。

| BRIEF 行 | 可行性 / 最短路线 | 未完成工作 |
|---|---|---|
| 5：工作目录外文件 ASK | **OS 原语可行，上游默认不支持该语义**。用 Landlock 最小读白名单或 bwrap allowlist mount，默认禁止外部用户文件；获批后仅开放所需路径 | 还需审批与动态路径授权、失败后的重试；仅屏蔽少数凭证目录不能实现“其余所有外部文件 ASK” |
| 6：凭证路径 NEVER | **选定路径隐藏可行**：本机 bwrap tmpfs 已实证；Landlock 也能通过移除宽泛祖先 grant 拒读 | 需枚举真实运行布局、隐藏 PBOTS_DATA_DIR 的 token/grants 等、处理缺失目录与挂载顺序、禁止通过授权恢复 NEVER 路径；覆盖 bash 之外的文件/MCP 工具另由 R4 接线验收 |

**关键分层**：本次过程沙箱只包 bash 等子进程；它不自动约束运行在 dsh Node 进程内的所有 read/write 工具，也不证明 MCP server 被同样约束。A4 必须跨工具族验收，不能用本报告代替。

## ④ bash 环境：只报键名

复现：C1 的全部组；精确输出位于 E 下 `frames.json` 的 `R5_RESULT.env_keys`。mock 与 real-fake 两组输出一致。

**实测完整键名**：

```text
DSH_HOME DSH_PROFILE DSH_PROFILE_DIR DSH_SESSION_ID DSH_SHELL DSH_WEB_URL
GIT_PAGER HOME LC_CTYPE NO_COLOR P2SDK_LLM_API_BASE P2SDK_LLM_MODEL
P2SDK_PATCH P2SDK_PORT P2SDK_PROBE P2SDK_PROVIDER PAGER PATH PWD SHLVL TERM _
```

| 注入/运行键名 | bash 实测 | 原因 / 证据 |
|---|---|---|
| LITELLM_MASTER_KEY、LITELLM_PROBE | 都不在 | app/sdk 启动器 allowlist 不转发 LITELLM 前缀；`app/sdk/src/start.ts:114-129` |
| OPENAI_API_KEY、ANTHROPIC_AUTH_TOKEN | 不在 | 同上；这里只注入哨兵，没有检查真实值 |
| P2SDK_LLM_API_KEY | mock / real-fake 都不在 | mock 启动器主动删；real 启动时保留到 dsh，再被 subprocess 敏感键名规则删除 |
| P2SDK_PROBE、P2SDK_PATCH、P2SDK_PORT、P2SDK_PROVIDER | 在 | 普通 P2SDK 名字通过两级过滤；**不得用无敏感词的 P2SDK 名字装凭证** |
| P2SDK_HOME、P2SDK_HANDOFF | 不在 | 启动器明确删除 |
| DSH_PROBE | 不在 | subprocess 删除父进程 DSH_* |
| DSH_HOME / PROFILE / PROFILE_DIR / SESSION_ID / SHELL / WEB_URL | **在** | shell-env 和 contributor 通过显式 env 重新加入，不是 ambient scrub 失效 |

源码链：
- `app/sdk/src/start.ts:102-137`：PATH/HOME/P2SDK_/DSH_ allowlist，去 home/handoff；真实模式不会在此删除 API key。
- `repos/deepseek-harness/packages/subprocess/subprocess/src/index.ts:40-79`：`/KEY|PASSWORD|SECRET|TOKEN/i` 与 DSH_ 过滤；明确 env overlay 后合并，不能把它当无条件禁止敏感环境变量。
- `repos/deepseek-harness/packages/shell/shell-env/src/index.ts:151-167`：**主动注入 DSH_HOME 等**。所以 start.ts:108-112 注释“scrubber keeps DSH_HOME out of model-driven tool processes”在当前完整组合中不成立；默认组实际通过此 env 读到自己创建的 runtime 哨兵。

没有测试任意命名的真实凭证，不能宣称“所有真实 key 都绝不泄漏”。本次可得的结论仅是：上述**哨兵键名**在完整链路中被清掉，普通前缀值仍会继承；名称过滤不是信息流隔离。

## 复用决策与版本

本任务是用户指定本机已有依赖的行为实测，不新增能力选型、不新增包、不 clone 新仓；比较两个已装后端，不以 README 推断。参考仓只读。

| 能力 | 候选 | 阶梯级别 | 许可证 | 维护 | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|---|
| bash 写保护、可分离网络、目录遮蔽 | 已装 `@deepseek-ai/dsh-sandbox-local@0.2.2-alpha.2` + `/usr/bin/bwrap` | 1 | dsh MIT；bwrap 许可证由系统包管理，未另核 | 本地 dsh 源码 ce7073d51254c26cd63b22a60835b8f948deb447，commit 2026-10-30；npm 包 time.modified 2026-10-29 | **集成** | 写隔离直接可用；联网隔离可用 runnerCommand 配置；目录隐藏通过包装层补，保留上游维护，不修改 provider |
| 备选写/读 allowlist | 已装 Landlock launcher（node-addon-system-linux-x64@0.1.2）+ 同一 dsh provider | 1 | dsh MIT；native 许可沿项目，未独立复核平台包 | 同仓 2026-10-30；本机 --probe fully enforced | **集成** | 默认 fallback 写有效但共享 /tmp、读全放开且无网络隔离。最小读白名单可用包装层，完整运行兼容性尚未验收 |

复现版本/维护查询：

```bash
git -C /home/lingxufeng/bot/repos/deepseek-harness log -1 --format='%H %cI'
npm view @deepseek-ai/dsh-sandbox-local version time.modified repository --json
npm view @deepseek-ai/dsh version time.modified repository --json
```

注意 npm `latest` 返回 sandbox-local `0.0.1-rc.1`、dsh `0.2.1-rc.5`，**不是本机钉住的 `0.2.2-alpha.2`**。这些查询只作 registry 维护时间记录，不建议按 latest 升级；本次不改 lockfile。issue 回复情况未验证，不把这次本机验证扩张为完整上游维护审计。

## 限制与交付提醒

- 此处是可行性探针，不是 A1–A10 验收；无 0-approval、绕过矩阵、真实用户凭证或完整文件工具覆盖结论。
- 网络组只是 namespace 隔离；不带域名 allowlist、代理授权或按 bot 的网络 grant。
- 初次试跑错用了配置 ID `sandbox-local`，导致网络/隐藏 overlay 未命中；已改为 `sandbox` 并加断言，只有 E（qXloBM）为最终六组证据。不要引用此前 rFPpjE 的 network-off/hide-read 结果。
- 测试期间并行主会话曾把中间 evidence 纳入 Git，故旧试跑 handoff 删除现在表现为 tracked deletions。它们都是本探针生成的临时 SDK launch-token，已删除且 runtime 均退出；**不要为了恢复干净 diff 而恢复 token 文件**。需要由派发者检查这些中间凭证是否应从历史/提交清单剔除。没有修改用户凭证或产品代码。
