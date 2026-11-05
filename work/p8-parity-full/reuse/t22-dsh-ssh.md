# T-22 · dsh SSH 远程执行与凭证边界

调研日：2026-11-05。只读；未连接 SSH/tailnet，未读取 .ssh/config、私钥、known_hosts 或任何凭证内容。未部署远端 helper。

| 能力 | 候选 | 阶梯（1～5） | 许可证 | 维护 | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| SSH 远端文件/进程/PTC 执行 | @deepseek-ai/dsh-ssh + fs-ssh/subprocess-ssh/sandbox-ssh，版本对齐 0.2.2-alpha.2；匹配远端 helper | 1（私有 helper 构建部署属二级配套；维护响应待核） | MIT | dsh commit 2026-11-04；ssh/subprocess-ssh 精确版本 npm modified 2026-11-04；issue 维护者回应未验证 | 集成 | 现成宿主 OpenSSH 持钥、helper 身份匹配、流与远端生命周期；优先远移工具执行层，不迁整个 agent/model worker。 |

## 已确认实现

源码根 `/home/lingxufeng/bot/repos/deepseek-harness/`，SHA `ce7073d51254c26cd63b22a60835b8f948deb447`：

- `packages/ssh/ssh/src/index.ts:32-51`：部署固定 host alias、helper 路径/hash、workspace；注释明确这些不是模型参数。host 引用宿主 OpenSSH 已配置身份。
- 同文件 `:299-318`：ssh 使用 BatchMode=yes、StrictHostKeyChecking=yes、ForwardAgent=no、ClearAllForwardings=yes；握手比对 helperHash、launch kind 与 bootstrapHash。不是 TOFU、不是把私钥写进 JSON，也不向远端 forward agent。
- 同文件 `:113-124`：远端 PTC 通过已验证 executable 或 Node+bootstrap 启动；`:128-143` 和连接生命周期不自动重放结果不明的变更。
- `packages/ssh/subprocess-ssh/src/index.ts:1-110`：普通远端进程和 PTY handle，独立 SSH 流，远端 helper 管理进程生命周期与输出。
- `packages/ssh/sandbox-ssh/src/index.ts:1-34`：confine 把 argv/policy 发给 helper 的 sandbox 请求；返回 full/partial enforcement 或明确 unavailable。并非本机 bwrap 自动保护远端。
- `packages/ssh/ssh-helper-runtime/src/index.ts:14-38`：SEA 可执行产物分派 helper、subprocess runner、PTC runtime。其 package.json 标 private:true，npm 查询 E404；不能承诺所有部分 pnpm add 后即开箱即用。

本机已装树未见 SSH provider 族；npm 确认 dsh-ssh 与 dsh-subprocess-ssh@0.2.2-alpha.2 可取。fs-ssh 有发布包，但本轮未逐个核实全族精确版本与 peer 闭包；实施前必须锁整族和 helper 产物，禁止混 latest。

## 工具远移，不等于整 worker 远移

推荐保留本地主 agent/model loop、会话日志、UI 和审批，把 fs/subprocess/sandbox/PTC 的具体执行 runtime 换到远端。这样可复用 SSH provider，不需要搬本机模型凭证。用户若要求“整个 worker 跑远端”，将扩大编排、存储、日志回传和凭证设计范围；SCOPE 已指出与 p7 非目标有冲突，需要 D-REMOTE/用户另定，不由此报告授权。

对照候选：
1. 原生 ssh + 自写命令工具：单次只读探针很短，但要补文件 API、PTY、取消、断线结果不明、流限额、lease、hash pin 和审计，当前已有 dsh 实现，无理由重新造。
2. 整 worker 远移：不是上项的免费增强；若远端需要独立模型凭证，就违反“凭证不进模型/容器”的当前约束或至少要求新的宿主凭证代理设计。暂不选。

## 凭证与远端安全还缺什么

宿主 OpenSSH 持钥只解决传输身份，不自动保证模型绝不读到凭证。部署配置必须模型不可写；凭证 HOME/SSH_AUTH_SOCK 不传给模型工具、不挂远端沙箱；不把 ssh -v 或宿主配置错误细节回流模型。远端使用专用账号、临时 HOME/工作区、最小授权与单独审批，不共享真实桌面用户。

现有本机 `/home/lingxufeng/bot/app/sdk/sandbox/bwrap-wrap.py:10-25,337` 的凭证遮蔽、恒定 unshare-net 和受控联网许可不会凭空出现在 helper 远端。必须逐项证明等价护栏，包括读侧 fd 身份校验、写侧边界、网络许可、审批、审计与停止清理；上游 sandbox policy 名相同不等于产品策略等价。

最小远端测试：用户提供专用测试机/alias 和安装窗口；部署匹配 helper；验 hello/hash；临时工作区读写/进程/PTY/PTC；禁止路径与断网；取消、断线 lease 清理、远端重启后的失败关闭。SSH 回环仅能测协议，不证明跨机、尾网 ACL 或远端隔离。

接线及匹配 helper 构建部署估计 1～3 人日；护栏等价性、远端镜像和整 worker 迁移不含在内，均未实测。维护者 issue 响应尚未核实，因此一级推荐是条件式，不是已批准依赖。

外部维护证据：https://github.com/deepseek-ai/deepseek-harness/commit/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159 。已查本地 MANIFEST/REUSE、源码、已装包、GitHub 与 npm；没有自建 SSH runtime 的必要。
