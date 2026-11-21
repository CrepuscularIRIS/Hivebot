# DS-Bot 预配置发行形态

把 goal-0acebfbf R1-R18 验证过的 SuperAgent 接入配方，以一条命令应用到全新
DS-Bot AppImage 解包环境，直接得到完整产品体验（kickoff 人格 + 多 bot 编排 +
崩溃自愈）。

## 全流程（四步）

```bash
# 1) 下载并解包 AppImage（无 FUSE 环境）
curl -L -o /tmp/DS-Bot.AppImage \
  https://github.com/Fei2411/DS-Bot/releases/download/v0.3.8/DS-Bot-0.3.8-linux-x86_64.AppImage
cd /tmp/dsbot-trial && chmod +x DS-Bot.AppImage && ./DS-Bot.AppImage --appimage-extract

# 2) 首启引擎产 profile 骨架（一次）
env -u ELECTRON_RUN_AS_NODE HOME=<home> DISPLAY=:0 ELECTRON_DISABLE_SANDBOX=1 \
  npm_config_registry=https://registry.npmmirror.com DSH_LITELLM_API_KEY=<key> \
  <trial>/squashfs-root/resources/primary-runtime/dependencies/node/bin/node \
  --expose-internals <trial>/squashfs-root/resources/app/src/host.mjs
# 等 log 打出 "dsh web: http://…" 后 kill（骨架已生成）

# 3) 一条命令预配置
DSH_LITELLM_API_KEY=<key> scripts/dsbot-provision/provision.sh <home>

# 4) 验收回归（四断言：引擎/provision/Chief/kickoff 人格/worker 编排落盘）
scripts/fresh-boot.sh
```

## 组件

| 文件 | 作用 |
|---|---|
| `cordis.patch.template.yml` | 配方真源（litellm provider + agent-default-model + superagent 插件 + worker/router preset）；占位符 `__STATE_DIR__` `__DATA_DIR__` `__BASE_URL__` `__MODEL_ID__` |
| `provision.sh` | 渲染 patch yml + pnpm 安装 superagent（npmmirror 镜像）+ skills 随包 + stale 锁清理 |
| `../fresh-boot.sh` | 验收回归（A1/A1.5/A2/A3/A4 四断言；A1.5 即调用 provision.sh） |
| `../health-check.sh` | 四段健康读数（引擎进程/web 端口/Chief/orchestrator） |

## 参数

`provision.sh <home> [--state-dir DIR] [--base-url URL] [--model ID] [--superagent-src DIR]`

- 默认 state-dir `<home>/.ds-bot/superagent-state`；base-url `http://127.0.0.1:4001/v1`；
  model `glm-5.3-flash`；superagent 源 `<repo>/app/superagent`。

## 环境地雷（历史实证）

- `ELECTRON_RUN_AS_NODE=1` 会把 Electron 降级成 Node CLI——GUI 启动必须 `env -u` 剥掉。
- npm 直连被墙：一切 pnpm/npm 安装带 `--registry=https://registry.npmmirror.com`。
- 引擎多进程互抢锁：重启前 `ps aux | grep 'resources/app/src/host.mjs'` 逐个 kill
  （`pgrep -x node` 匹配不到深路径进程名）。
- `kill -9` 残留 proper-lockfile 锁：runtime.ts R17 已有清除重试；provision.sh 双保险。
