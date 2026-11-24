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
| 网络 | 能访问 npm registry（首次安装要先下载开发依赖构建插件，再下载插件依赖；都按锁文件走，默认 npmmirror 镜像；换源设环境变量 `NPM_CONFIG_REGISTRY`） |
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

首启会弹出「DS Bot 0.3.10 is out」的更新对话框（默认焦点在 **Download** 上，别直接回车）——点 **Not now** 关掉。本页按 0.3.8 实证：换版本后目录结构和自带 pnpm 版本都可能变，安装器未必适用。

### 2. 让 DS-Bot 进程看得到网关 key

模型路由里只写了「key 从环境变量 `DSH_LITELLM_API_KEY` 取」，所以这个变量得在 **DS-Bot 进程**的环境里。终端里临时 `export` 的值，桌面图标启动的 DS-Bot 是看不到的——这步没做对，第 4 步的首屏就没有模型按钮。

方法 A —— 写进 systemd 用户环境，重新登录后对整个桌面会话生效（一次设好，推荐）：

```sh
mkdir -p ~/.config/environment.d
(umask 077; printf 'DSH_LITELLM_API_KEY=%s\n' '<你的 key>' > ~/.config/environment.d/50-hivebot.conf)
ls -l ~/.config/environment.d/50-hivebot.conf    # 权限应是 -rw-------
# 注销后重新登录
```

方法 B —— 每次从终端带着变量启动（变量只留在当前这个终端里，关掉终端就没了）：

```sh
read -rs DSH_LITELLM_API_KEY; export DSH_LITELLM_API_KEY   # 粘贴 key 后回车：不回显，也不进 shell 历史
"$APPIMAGE"
```

自检（DS-Bot 运行中执行；每个正在运行的 DS-Bot 引擎输出一行，`1` = 变量已传到该引擎，`0` = 没传到；没有任何输出 = 没找到引擎进程）：

```sh
for p in $(pgrep -f 'resources/app/src/host[.]mjs'); do tr '\0' '\n' < /proc/"$p"/environ | grep -c '^DSH_LITELLM_API_KEY='; done
```

> 实证范围：方法 B 与自检命令实测通过（不带变量时首屏只有 Sign in to DeepSeek / Enter a DeepSeek API key / Open settings…）。方法 A 依赖图形会话由 systemd 用户实例管理（本机 Ubuntu 24.04 X11 GNOME 确认如此，别的桌面环境未验证），**没做重新登录后的端到端实测**——登录后请跑自检，输出 `0` 就先用方法 B。

### 3. 安装

```sh
scripts/dsbot-provision/provision.sh "$HOME" --appimage "$APPIMAGE"
```

它做四件事：往 `cordis.patch.yml` 里并入三项（LiteLLM 模型路由 + 默认模型 + SuperAgent 的 stateDir/dataDir；接入前的原文件备份成 `cordis.patch.yml.pre-hivebot`）→ 把插件源复制到 `~/.ds-bot/superagent-src` 并装进 profile → 注册进 `package.json` 的 `dsh.profile.bundles` → 打印结果。重复跑是安全的：插件源码变了就原地重装，patch 只更新安装器自己写的那三项。patch 是最后一步才替换的——前面任何一步失败，原文件都不动。

> `cordis.patch.yml` 不只安装器在写：DS-Bot 的设置界面、插件启停开关写的也是这个文件。安装器只并入/更新自己那三项（`patch-merge.mjs`），重跑和撤销都不碰其余条目。做条目级合并要借 DS-Bot 自带的 yaml 库——**没带 `--appimage` / `--app-dir`** 而文件里已经有 DS-Bot 写入的条目时，安装器会拒绝并提示加 `--appimage`（首启的空骨架不受影响）。

新 clone 的仓库里插件还没有构建产物，第一次跑会先多一步，打印 `building superagent (lib/ missing)`：下载开发依赖、构建插件，耗时就花在这一步，取决于网速。以后重跑直接跳过，除非源码比构建产物新（比如 `git pull` 之后）——那时会自动重建再装，装进去的不会是旧构建。

DS-Bot 必须已完全退出，否则脚本会拒绝：`FAIL: DS-Bot 正在这个 home 上运行`。

### 4. 启动 DS-Bot，给 Chief 选模型

```sh
"$APPIMAGE"    # 用了方法 A 的话，桌面图标启动也行
```

先点 **Not now** 关掉更新对话框（同第 1 步）。Chief 首屏是「Pick a model for me first」→ 点 **glm-5.3-flash · LiteLLM (local)** → Chief 开场。

### 5. 验证

```sh
DSBOT_HOME="$HOME" scripts/health-check.sh
```

DS-Bot 运行中执行，期望最后一行 `RESULT: SuperAgent 就绪`：引擎在、web 在、编排面回 200、插件认出了 Chief 会话。

### 6. 以后

- **更新**：`git pull` 后完全退出 DS-Bot，重跑第 3 步（源码比构建产物新时会自动重建插件再装）。
- **撤销**：`scripts/dsbot-provision/uninstall.sh "$HOME" --appimage "$APPIMAGE"`——从 `cordis.patch.yml` 里摘掉安装器写的那三项（接入前就有的设置原样放回）、注销 bundle、删插件。编排数据（watch 记账 / ticket / 评估库）默认保留，加 `--purge-state` 一并删。
- **换网关或模型**：重跑第 3 步，带 `--base-url` / `--model`。

## 排障

| 现象 | 原因与处理 |
|---|---|
| 首屏没有模型按钮（只有 Sign in to DeepSeek 等） | 第 2 步的变量没传到 DS-Bot 进程——跑自检，输出 `0` 就重做第 2 步 |
| `FAIL: DS-Bot profile skeleton missing` | 还没用这个 home 启动过 DS-Bot——做第 1 步 |
| `FAIL: DS-Bot 正在这个 home 上运行` | DS-Bot 没退干净——完全退出后重跑 |
| `FAIL: 找不到可用的 node + pnpm` | 没带 `--appimage`，且 PATH 上没有合适的 node / pnpm |
| 卡在 `building superagent` 很久不动，最后报 `FAIL: superagent build (pnpm install --frozen-lockfile)` | 首次安装在下载开发依赖，需要能访问 npm registry；网络不通时 pnpm 会反复重试一阵才报错。等网络恢复重跑；中途 Ctrl-C 也行——构建没完成时原 patch 不会被改动，临时文件会清掉 |
| `FAIL: pnpm 主版本对不上` | 没带 `--appimage`，PATH 上的 pnpm 和 DS-Bot 自己装插件用的不是同一套——带 `--appimage` |
| `FAIL: superagent install (原 patch 未动)` | 插件依赖没装上（多半是网络或 registry；你按了 Ctrl-C 也是这句）——输出尾部有 pnpm 的报错；原 patch 没动，恢复后重跑 |
| `FAIL: 合并 cordis.patch.yml 失败——原文件没动。`（后面提示加 `--appimage`） | 没带 `--appimage` / `--app-dir`，而 `cordis.patch.yml` 里已经有 DS-Bot 设置界面写入的条目——条目级合并要借 DS-Bot 自带的 yaml 库，带上再跑 |
| `FAIL: --appimage 文件不存在` / `…没有执行权限` | `--appimage` 的路径写错（相对路径按当前目录算）或忘了 `chmod +x` |
| `FAIL: 无法从 AppImage 里取出自带运行时` | 它不是 DS-Bot 0.3.8 的 AppImage，或没有执行权限；也可以解包后用 `--app-dir ./squashfs-root` |
| 发消息报模型 401 | key 不对，或 key 没传到进程（同第一行） |
| `RESULT: SuperAgent 未就绪`（编排面回了 200） | 还没给 Chief 选模型——做第 4 步 |
| `RESULT: 路由 404 = 插件没激活` | `package.json` 的 `dsh.profile.bundles` 里没有 `dsh-superagent`——重跑第 3 步后重启 DS-Bot |
| AppImage 双击/运行没反应（系统缺 FUSE） | `"$APPIMAGE" --appimage-extract` 解包一次，之后运行 `./squashfs-root/AppRun`；安装器照旧用 `--appimage`，或 `--app-dir ./squashfs-root` |

## 组件与参数

| 文件 | 作用 |
|---|---|
| `cordis.patch.template.yml` | 模型路由 + 默认模型 + SuperAgent 的 stateDir/dataDir。插件条目和 worker / router preset 只定义在插件包内的 bundle 层，这里不重复。 |
| `provision.sh` | 渲染并并入 patch、装插件、注册 bundle；patch 最后才替换，前面任何一步失败都不动原文件 |
| `uninstall.sh` | 撤销上面三步：只摘安装器写进 patch 的那三项，其余只动 provision 写过的东西 |
| `patch-merge.mjs` | 把安装器写的三项并入 / 摘出 `cordis.patch.yml`，其余条目原样保留（内部用，不单独执行） |
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

patch 合并（`patch-merge.mjs`）的夹具测试：70 项，不变量是「你的原文件 → 并入 → 摘除」逐字节还原。条目级合并要借 DS-Bot 自带的 yaml 库，所以把上面解包出来的 `resources/app` 给进去：

```sh
DSBOT_APP_DIR=/tmp/dsbot-trial/squashfs-root/resources/app bash scripts/dsbot-provision/tests/patch-merge-fixtures.sh
```

判据只有一份：`scripts/fresh_boot_evidence.py`（A3 开场人格、A4 编排因果绑定）。

## 已知限制（2026-11-24）

- **Chief 没有 SuperAgent 的编排工具。** Chief 是 DS-Bot 原生 Main Bot，多 bot 编排走原生 TEAM_TOOLS（`list_bots → create_bot → message_bot`），不调用 `orchestrator_*`。
- **你在 Chief 对话里发的消息会触发 SuperAgent 评估并回灌卡片。** 这些消息被记成本地 trigger，评估产出的 candidate 卡投回同一个 Chief 会话，并提示用 `orchestrator_route` 处理——Chief 没有这个工具；同一张卡偶尔还会重复出现，Chief 会把它当成重复请求。改法（本地来源只记账、不回灌）待定。
- **接入后 Chief 会话的权限被放宽。** 插件认出 Chief 会话后会把它设成 `danger-full-access`（实测审批策略同时变为 never）——这是 SuperAgent 主会话的既有设计，在 DS-Bot 里等于给 Chief 全权，是否收窄待定。
- **「源码比产物新就重建」按 mtime 判断。** 系统时钟回拨、或 `lib/index.js` 的 mtime 在未来时会漏重建；现成的 `lib/` 也会被无条件信任。要保险就删掉 `app/superagent/lib` 再跑安装器。

Windows 见 `scripts/win-package/README.md`（`setup.bat` 一键：官方安装器 + overlay）。

## 环境地雷（开发笔记）

- `ELECTRON_RUN_AS_NODE=1` 会把 Electron 降级成 Node CLI——从带这个变量的环境起 GUI 要先 `env -u ELECTRON_RUN_AS_NODE`。
- npm 直连不通：安装器的构建与安装两步默认都走 npmmirror 镜像；换源设环境变量 `NPM_CONFIG_REGISTRY`。
- 同一个 home 上起两个引擎会互抢锁：安装、撤销前先完全退出；判活用 `pgrep -f 'resources/app/src/host[.]mjs'`（进程名是 node，`pgrep -x node` 认不出路径）。
