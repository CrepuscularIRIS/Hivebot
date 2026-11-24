# 更新说明

按主题记录 main 上的变化；逐条提交见 `CHANGELOG.md`（由 git log 生成）。

## 2026-11-24 · 安装收口：桌面形态可装、可验、可撤销

范围：自 `3e7b50d8`（2026-11-22，上次推送）以来的提交与本次改动。

### 安装（Linux 桌面，DS-Bot 0.3.8 AppImage）

- `provision.sh --appimage`：直接吃 AppImage，临时借用它自带的 node v24.21.0 / pnpm 11.7.0，目标机不用装 Node / pnpm（`runtime.sh`）。
- 新增 `uninstall.sh`：从 `cordis.patch.yml` 里摘掉安装器写的那些键（接入前就有的值按备份放回，接入后在设置界面里改的其它键照留；同样要借 DS-Bot 自带的 yaml 库）、注销 bundle、删插件与插件源副本；profile 里没有别的依赖时顺手清掉 `node_modules`。`--purge-state` 连编排数据一起删。
- 安装器加运行中引擎守卫：DS-Bot 没退干净就拒绝，不再和引擎的插件管理器对写同一个 profile。
- 不再要求给安装器传 `DSH_LITELLM_API_KEY`：它只把变量名写进模型路由，key 是 DS-Bot 进程启动时自己读的。
- 插件源安装时复制到 `~/.ds-bot/superagent-src`，profile 引用这份副本。此前引用的是仓库路径：仓库被挪走或删掉后，引擎再对该 profile 跑 `pnpm install` 会报 `[ENOENT] ENOENT: no such file or directory, scandir`。改后把源目录挪走，DS-Bot 照常启动、插件照常激活、`pnpm install` 通过。
- 修复撤销时 `pnpm remove` 不认 `--registry`（`[ERROR] Unknown option: 'registry'`）导致退回手工删除。
- 源码比构建产物新时（`git pull` 之后）自动重建插件再装。此前只在 `lib/` 缺失时构建，「更新 = 重跑安装器」装进去的可能是旧构建；开发依赖已按锁文件装好时不重复 `pnpm install`。
- 首次构建的开发依赖也走 npmmirror 镜像。此前只有装插件那一步带了镜像，构建的 `pnpm install` 直连 `registry.npmjs.org`（国内实测 2–47 KiB/s）；构建与安装两步统一，换源设环境变量 `NPM_CONFIG_REGISTRY`。
- `--state-dir` 给相对路径时补成绝对路径；`.ds-bot` 本身或它的上级目录直接拒绝。`uninstall.sh --purge-state` 先读接入时写下的 `stateDir` 再还原 patch：此前自定义 `--state-dir` 的接入撤销时会删错目录（删成默认路径）；路径不像状态目录（`/`、home、profile 的上级）时拒绝删除；`stateDir` 只认安装器写入的 `dsh-superagent` 条目，别的插件写进 patch 的同名键不采信。
- `cordis.patch.yml` 改为条目级合并（`patch-merge.mjs`）：DS-Bot 的设置界面和插件启停开关也写这个文件，此前重跑 `provision.sh` 会把它整份换成模板渲染结果、`uninstall.sh` 会用首启备份整份盖回去——界面里做的设置全丢。现在只并入 / 摘出安装器写的三项（`llm-pi-ai` 的 `providers.litellm`、`agent-default-model` 的 `provider`/`model`、`dsh-superagent` 的 `stateDir`/`dataDir`），其余条目与键（含 `!!js` 表达式和 `disabled` 开关）原样保留——文件经 yaml 库重新排版（换行统一成 LF、超长行重排），内容不变；并入后的文件权限 `0600`，里面有你自己 provider 的 key。合并与摘除都要借 DS-Bot 自带的 yaml 库：没带 `--appimage` / `--app-dir` 而文件里已有别的条目时，安装和撤销都拒绝并提示，不覆盖。
- 摘除改为按键还原（只读复审后改）：此前 `uninstall.sh` 拿接入前备份里的整条盖回同 id 的条目——接入后换过的 key、新加的 provider、插件开关写的 `disabled` 全丢。现在条目本身不动，只把安装器的键按备份放回。接入前有、现在没有的条目或键（多半是更早的安装器整份覆盖掉的）不自动放回：保留备份并打印提示，下次安装把旧备份改名留档、不覆盖。同 id 出现两条、固定键上带锚点别名时给一句人话报错，什么都不改。`--purge-state` 的目录改由 yaml 解析后按条目读出（行尾注释、空格不碍事）。
- patch 改为最后一步才替换：插件、skills、bundle 注册都成功后才动它；中途失败或 Ctrl-C 不留临时文件（进程被 `kill -9` 时除外），原 patch 不变。
- 插件源码摘要覆盖包的 `files` 清单全部文件（此前只算 `lib`、`package.json`、`skills`：只改 `prompts`、`locale`、包内 `cordis.patch.yml` 后重跑会判 up to date，装进去的还是旧的）。`up to date` 分支同时检查 `superagent-src` 副本还在。
- `--appimage` 给相对路径时按当前目录算；文件不存在、没有执行权限、解不出运行时各有一句直给的报错（此前都是「无法从 AppImage 里取出自带运行时」，且失败会留下约 134MB 的临时目录）。

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
- 教程在干净 clone 上逐条实走（`clean-clone-walk.txt`）：首启 → 带 key 启动 → 安装（含首次构建）→ 选模型 → Chief 开场 → 编排面 200 → 运行中安装被拒 → 健康检查 → 更新 / 撤销 / 重装。
- patch 合并夹具测试（`patch-merge-fixtures.txt`，105 项）与安装器集成测试（`installer-integration.txt`，77 项）：旧版接入的 home 跑新安装器不重写 patch；带用户条目的接入 → 撤销往返后文件逐字节相同；接入后在同一条目里改过的键在撤销后照留；被旧版安装器整份覆盖过的 home 撤销时保留备份并报出没放回的条目和键；`--purge-state` 的目录按 `dsh-superagent` 条目读（自定义路径、带空格、行尾注释都行）；相对路径 `--appimage`；PATH 模式遇用户条目时安装和撤销都拒绝；安装途中 Ctrl-C 不留临时目录、不动 patch；带用户条目的 home 起 GUI 编排面 200、DS-Bot 不重写 patch、日志无 ValidationError（`gui-recheck-after-second-review.txt`）。

### 已知限制

- **Chief 没有 SuperAgent 的编排工具。** Chief 是 DS-Bot 原生 Main Bot，多 bot 编排走原生 TEAM_TOOLS，不调用 `orchestrator_*`。
- **Chief 对话里的消息会触发 SuperAgent 评估并回灌卡片**，而 Chief 没有工具处理这些卡；同一张卡偶尔重复出现。
- **接入后 Chief 会话权限被放宽为 `danger-full-access`**（审批不再询问）——SuperAgent 主会话的既有设计，在 DS-Bot 里等于给 Chief 全权。

以上三条的改法待定。

- **安装器「源码比产物新就重建」按 mtime 判断**：系统时钟回拨或 `lib/index.js` 的 mtime 在未来时会漏重建。要保险就删掉 `app/superagent/lib` 再跑安装器（只读审查 #7，暂不改）。
