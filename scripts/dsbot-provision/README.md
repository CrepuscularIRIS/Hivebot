# DS-Bot 预配置安装（Linux 桌面）

一条命令把 DSH SuperAgent 接进官方 DS-Bot 0.3.8：写好模型路由、装好插件、注册 bundle。
装完后 Chief 仍是 DS-Bot 原生主 bot，多 bot 编排走 DS-Bot 原生 TEAM_TOOLS；SuperAgent 盯着 Chief 会话做 watch 记账、评估和 ticket 异步兜底。眼下的限制见文末「已知限制」。

> 实证：2026-11-24，Ubuntu 24.04.5 + DS-Bot 0.3.8 AppImage，用本页命令从空 home 走通；证据在 `work/retest-4b922fde/evidence/provision-runtime/`。文中唯一没走到的一步（方法 A 重新登录）已单独标注。

## 准备

| 项 | 说明 |
|---|---|
| 系统 | Linux x64 桌面（实证 Ubuntu 24.04.5） |
| DS-Bot | 官方 0.3.8 AppImage：[DS-Bot-0.3.8-linux-x86_64.AppImage](https://github.com/Fei2411/DS-Bot/releases/download/v0.3.8/DS-Bot-0.3.8-linux-x86_64.AppImage) |
| 模型网关 | 任意 OpenAI 兼容网关及其 key。默认 `http://127.0.0.1:4001/v1` + 模型 `glm-5.3-flash`，不一样就用 `--base-url` / `--model` 指过去。网关不随本仓库分发。 |
| 网络 | 能访问 npm registry（插件依赖按锁文件下载，默认走 npmmirror 镜像） |
| Node / pnpm | 不用装——`--appimage` 让安装器临时借用 AppImage 自带的 node v24.21.0 / pnpm 11.7.0 |

```sh
git clone https://github.com/CrepuscularIRIS/Hivebot && cd Hivebot
APPIMAGE="$HOME/DS-Bot-0.3.8-linux-x86_64.AppImage"   # 换成你的 AppImage 路径
chmod +x "$APPIMAGE"
```

下文的 `$HOME` 就是启动 DS-Bot 时用的 home（数据在 `~/.ds-bot`）。

## 安装

### 1. 首启 DS-Bot 一次，然后完全退出

```sh
"$APPIMAGE"    # 窗口出来后完全退出 DS-Bot
ls "$HOME/.ds-bot/profiles/ds-bot"/{package.json,pnpm-workspace.yaml,cordis.patch.yml}
```

首启会生成 profile 骨架（上面三个文件），第 3 步就写在这份骨架上。跳过会报 `FAIL: DS-Bot profile skeleton missing`。

### 2. 让 DS-Bot 进程看得到网关 key

模型路由里只写了「key 从环境变量 `DSH_LITELLM_API_KEY` 取」，所以这个变量得在 **DS-Bot 进程**的环境里。终端里临时 `export` 的值，桌面图标启动的 DS-Bot 是看不到的——这步没做对，第 4 步的首屏就没有模型按钮。

方法 A —— 写进 systemd 用户环境，重新登录后对整个桌面会话生效（一次设好，推荐）：

```sh
mkdir -p ~/.config/environment.d
printf 'DSH_LITELLM_API_KEY=%s\n' '<你的 key>' > ~/.config/environment.d/50-hivebot.conf
chmod 600 ~/.config/environment.d/50-hivebot.conf
# 注销后重新登录
```

方法 B —— 每次从终端带着变量启动（只对这一次有效）：

```sh
DSH_LITELLM_API_KEY='<你的 key>' "$APPIMAGE"
```

自检（DS-Bot 运行中执行，输出 `1` = 变量已传到引擎进程）：

```sh
tr '\0' '\n' < /proc/"$(pgrep -f 'resources/app/src/host[.]mjs' | head -n 1)"/environ | grep -c '^DSH_LITELLM_API_KEY='
```

> 实证范围：方法 B 与自检命令实测通过（不带变量时首屏只有 Sign in to DeepSeek / Enter a DeepSeek API key / Open settings…）。方法 A 依赖图形会话由 systemd 用户实例管理（本机 Ubuntu 24.04 X11 GNOME 确认如此，别的桌面环境未验证），**没做重新登录后的端到端实测**——登录后请跑自检，输出 `0` 就先用方法 B。

### 3. 安装

```sh
scripts/dsbot-provision/provision.sh "$HOME" --appimage "$APPIMAGE"
```

它做四件事：渲染 `cordis.patch.yml`（LiteLLM 模型路由 + 默认模型 + SuperAgent 的 stateDir/dataDir；原文件先备份成 `cordis.patch.yml.pre-hivebot`）→ 把插件源复制到 `~/.ds-bot/superagent-src` 并装进 profile → 注册进 `package.json` 的 `dsh.profile.bundles` → 打印结果。重复跑是安全的，源码变了就原地重装。

DS-Bot 必须已完全退出，否则脚本会拒绝：`FAIL: DS-Bot 正在这个 home 上运行`。

### 4. 启动 DS-Bot，给 Chief 选模型

```sh
"$APPIMAGE"    # 用了方法 A 的话，桌面图标启动也行
```

Chief 首屏是「Pick a model for me first」→ 点 **glm-5.3-flash · LiteLLM (local)** → Chief 开场。

### 5. 验证

```sh
DSBOT_HOME="$HOME" scripts/health-check.sh
```

DS-Bot 运行中执行，期望最后一行 `RESULT: SuperAgent 就绪`：引擎在、web 在、编排面回 200、插件认出了 Chief 会话。

### 6. 以后

- **更新**：`git pull` 后完全退出 DS-Bot，重跑第 3 步。
- **撤销**：`scripts/dsbot-provision/uninstall.sh "$HOME" --appimage "$APPIMAGE"`——还原 patch 备份、注销 bundle、删插件。编排数据（watch 记账 / ticket / 评估库）默认保留，加 `--purge-state` 一并删。
- **换网关或模型**：重跑第 3 步，带 `--base-url` / `--model`。

## 排障

| 现象 | 原因与处理 |
|---|---|
| 首屏没有模型按钮（只有 Sign in to DeepSeek 等） | 第 2 步的变量没传到 DS-Bot 进程——跑自检，输出 `0` 就重做第 2 步 |
| `FAIL: DS-Bot profile skeleton missing` | 还没用这个 home 启动过 DS-Bot——做第 1 步 |
| `FAIL: DS-Bot 正在这个 home 上运行` | DS-Bot 没退干净——完全退出后重跑 |
| `FAIL: 找不到可用的 node + pnpm` | 没带 `--appimage`，且 PATH 上没有合适的 node / pnpm |
| 安装器提示 pnpm 主版本与 profile 的 store 不一致 | 同上，带 `--appimage`（和 DS-Bot 自己装插件用的是同一套 pnpm） |
| 发消息报模型 401 | key 不对，或 key 没传到进程（同第一行） |
| `RESULT: SuperAgent 未就绪`（编排面回了 200） | 还没给 Chief 选模型——做第 4 步 |
| `RESULT: 路由 404 = 插件没激活` | `package.json` 的 `dsh.profile.bundles` 里没有 `dsh-superagent`——重跑第 3 步后重启 DS-Bot |
| AppImage 双击/运行没反应（系统缺 FUSE） | `"$APPIMAGE" --appimage-extract` 解包一次，之后运行 `./squashfs-root/AppRun`；安装器照旧用 `--appimage`，或 `--app-dir ./squashfs-root` |

## 组件与参数

| 文件 | 作用 |
|---|---|
| `cordis.patch.template.yml` | 模型路由 + 默认模型 + SuperAgent 的 stateDir/dataDir。插件条目和 worker / router preset 只定义在插件包内的 bundle 层，这里不重复。 |
| `provision.sh` | 渲染 patch、装插件、注册 bundle；任何一步失败都不动原 patch |
| `uninstall.sh` | 撤销上面三步，只动 provision 写过的东西 |
| `runtime.sh` | 找 node + pnpm：`--appimage` / `--app-dir` → 正在运行的引擎的命令行 → `PATH` |

```
provision.sh <home> [--appimage FILE | --app-dir DIR] [--state-dir DIR] [--base-url URL] [--model ID] [--superagent-src DIR]
uninstall.sh <home> [--appimage FILE | --app-dir DIR] [--purge-state]
```

默认：state-dir `<home>/.ds-bot/superagent-state`、base-url `http://127.0.0.1:4001/v1`、model `glm-5.3-flash`、superagent 源 `<仓库>/app/superagent`。

装完之后 profile 引用的是 `~/.ds-bot/superagent-src` 这份副本（约 1.3 MB），仓库目录挪走或删掉都不影响已装的 DS-Bot。

## 开发验收（空 home 全链）

`scripts/fresh-boot.sh` 在一个全新 home 上起 headless 引擎 → 预配置 → 等 Chief → 发首条委派 → 逐项断言，全过 exit 0。前提：

```sh
mkdir -p /tmp/dsbot-trial && cd /tmp/dsbot-trial && "$APPIMAGE" --appimage-extract && cd -
scripts/fresh-boot.sh                 # 网关 key 取 app/ui/.env 的 LITELLM_MASTER_KEY，或先 export DSH_LITELLM_API_KEY
python3 -m pytest -q scripts/tests   # 判据脚本的回归
```

判据只有一份：`scripts/fresh_boot_evidence.py`（A3 开场人格、A4 编排因果绑定）。

## 已知限制（2026-11-24）

- **Chief 没有 SuperAgent 的编排工具。** Chief 是 DS-Bot 原生 Main Bot，多 bot 编排走原生 TEAM_TOOLS（`list_bots → create_bot → message_bot`），不调用 `orchestrator_*`。
- **你在 Chief 对话里发的消息会触发 SuperAgent 评估并回灌卡片。** 这些消息被记成本地 trigger，评估产出的 candidate 卡投回同一个 Chief 会话，并提示用 `orchestrator_route` 处理——Chief 没有这个工具；同一张卡偶尔还会重复出现，Chief 会把它当成重复请求。改法（本地来源只记账、不回灌）待定。
- **接入后 Chief 会话的权限被放宽。** 插件认出 Chief 会话后会把它设成 `danger-full-access`（实测审批策略同时变为 never）——这是 SuperAgent 主会话的既有设计，在 DS-Bot 里等于给 Chief 全权，是否收窄待定。

Windows 见 `scripts/win-package/README.md`（`setup.bat` 一键：官方安装器 + overlay）。

## 环境地雷（开发笔记）

- `ELECTRON_RUN_AS_NODE=1` 会把 Electron 降级成 Node CLI——从带这个变量的环境起 GUI 要先 `env -u ELECTRON_RUN_AS_NODE`。
- npm 直连不通：安装器内部已带 npmmirror；源码构建可用 `NPM_CONFIG_REGISTRY` 指定镜像。
- 同一个 home 上起两个引擎会互抢锁：安装、撤销前先完全退出；判活用 `pgrep -f 'resources/app/src/host[.]mjs'`（进程名是 node，`pgrep -x node` 认不出路径）。
