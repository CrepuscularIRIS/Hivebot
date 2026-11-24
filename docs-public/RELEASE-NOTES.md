# 更新说明

按主题记录 main 上的变化；逐条提交见 `CHANGELOG.md`（由 git log 生成）。

## 2026-11-24 · 安装收口：桌面形态可装、可验、可撤销

范围：自 `3e7b50d8`（2026-11-22，上次推送）以来的提交与本次改动。

### 安装（Linux 桌面，DS-Bot 0.3.8 AppImage）

- `provision.sh --appimage`：直接吃 AppImage，临时借用它自带的 node v24.21.0 / pnpm 11.7.0，目标机不用装 Node / pnpm（`runtime.sh`）。
- 新增 `uninstall.sh`：还原 patch 备份、注销 bundle、删插件；profile 里没有别的依赖时顺手清掉 `node_modules`。`--purge-state` 连编排数据一起删。
- 安装器加运行中引擎守卫：DS-Bot 没退干净就拒绝，不再和引擎的插件管理器对写同一个 profile。
- 不再要求给安装器传 `DSH_LITELLM_API_KEY`：它只把变量名写进模型路由，key 是 DS-Bot 进程启动时自己读的。
- 插件源安装时复制到 `~/.ds-bot/superagent-src`，profile 引用这份副本。此前引用的是仓库路径：仓库被挪走或删掉后，引擎再对该 profile 跑 `pnpm install` 会报 `[ENOENT] ENOENT: no such file or directory, scandir`。改后把源目录挪走，DS-Bot 照常启动、插件照常激活、`pnpm install` 通过。
- 修复撤销时 `pnpm remove` 不认 `--registry`（`[ERROR] Unknown option: 'registry'`）导致退回手工删除。
- 源码比构建产物新时（`git pull` 之后）自动重建插件再装。此前只在 `lib/` 缺失时构建，「更新 = 重跑安装器」装进去的可能是旧构建；开发依赖已按锁文件装好时不重复 `pnpm install`。

### 文档

- 新教程 `scripts/dsbot-provision/README.md`：六步安装 + 排障 + 已知限制。根 README、`docs-public/README.md`、`docs/CONFIG-GUIDE.md`、`scripts/win-package/README.md` 里过期的命令（`--appimage-dir`、`engine.sh start`、给安装器传 key）全部更正。
- 写进教程的新坑：桌面启动的 DS-Bot 看不到终端里 `export` 的 `DSH_LITELLM_API_KEY`，表现是首屏没有模型按钮（只有 Sign in to DeepSeek / Enter a DeepSeek API key / Open settings…）。

### SuperAgent 插件

- 主会话身份跟 DS-Bot 的认定走：读 `bot/state.json` 的 bot 条目（当前段 + 名下全部会话），不再按「最近更新者胜」——后者在真实 DS-Bot 上两头都错绑（masterId 绑到 Chief 新建的 Worker 会话；换段后永远留在旧段）。
- 换段即时重绑：监听 `bot/state.json` 落盘即重算（300ms 后一次、3s 后再补一次，串行），不再只靠 60s 巡检；换段窗口内（120s、上限 200 条）先到的用户消息补记入账。
- 本地来源守卫：只有 `source.kind` 为 `user`、或带引擎固定框架行的定时消息才算用户请求；运行时上下文、kickoff、插件自己投的卡片不再被当成 trigger。
- 回归：新增 `b-rebind-scheduler`、`b1-local-source-guard`、`b2-rotation-catch-up`，`b-live-master-identity` 重写；全量 vitest 17 文件 89 用例通过。

### 上次推送后已提交的修复（`7fb79e9b` … `9b326787`）

- 锁互斥重写：跨进程互斥 + owner 验尸；锁回收靠 tombstone 原子收敛，占用者不可信时 fail-closed（`ECOMPROMISED`）。
- 工具参数的 JSON schema 修复：生成 schema 时剥离根上不可枚举的 `~standard` 字段，引擎不再拒收参数。
- work-tools 契约 fail-closed；A3/A4 判据模块化并抽成 `scripts/fresh_boot_evidence.py` 单一真源（pytest 40 用例）。

### 验收

- `fresh-boot.sh` 支持 `--app-dir`，不再要求 FUSE；r23、r24 全过 exit 0。
- `health-check.sh` 支持桌面安装：引擎日志里 token 是 `<hidden>` 时，只带 `x-orchestrator-request` 头查编排面，输出 `RESULT: SuperAgent 就绪`。
- 桌面端到端（AppImage 首启 → provision → 选模型 → Chief 开场 → 编排面 200）、安装/撤销往返、运行中引擎守卫、挪走插件源后的启动：证据在 `work/retest-4b922fde/evidence/provision-runtime/`。

### 已知限制

- **Chief 没有 SuperAgent 的编排工具。** Chief 是 DS-Bot 原生 Main Bot，多 bot 编排走原生 TEAM_TOOLS，不调用 `orchestrator_*`。
- **Chief 对话里的消息会触发 SuperAgent 评估并回灌卡片**，而 Chief 没有工具处理这些卡；同一张卡偶尔重复出现。
- **接入后 Chief 会话权限被放宽为 `danger-full-access`**（审批不再询问）——SuperAgent 主会话的既有设计，在 DS-Bot 里等于给 Chief 全权。

以上三条的改法待定。
