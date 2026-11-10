# Hivebot

桌面 AI bot 工作台——多 bot 编排、审批沙箱、桌面宠物、Windows 客户端。内部代号 pbots。

```
┌────────────────────────── Hivebot ──────────────────────────┐
│  app/ui       Electron 壳（main/preload）+ 桌宠 + 打包链     │
│  app/sdk      dsh 之上的编排/认知/审批/市场 插件链（自写）   │
│  app/launcher hivebot 一条命令拉起 SDK+Electron             │
│  pack/        modpack 式资源清单（外部资源一键拉取）         │
│  install.sh   一键安装引导                                    │
└──────────────────────────────────────────────────────────────┘
```

## 一键开始

```sh
git clone https://github.com/CrepuscularIRIS/Hivebot && cd Hivebot
./install.sh          # 依赖 + 外部资源（UI 上游/桌宠资产）拉取
./app/launcher/hivebot
```

需要：Linux x64、node ≥24、pnpm（`corepack enable`）。数据在 `~/.config/pbots-ui`，状态在 `~/.local/state/hivebot`。

## 结构速览

| 目录 | 内容 |
|---|---|
| `app/sdk/src/{awareness,orchestration,policy,market,admin}` | bot 认知（同伴名册进 system）、编排开闸（create_bot/send_to_bot）、审批信封、技能市场——全部 dsh 插件 |
| `app/sdk/scripts/start.mjs` | SDK 拉起（handoff 目录交接 base-url/token） |
| `app/ui/main` | Electron 主进程：dsh 连接、M1-M3 载波、审批卡、系统通知、宠物窗 |
| `app/ui/preload` | contextBridge 白名单（pbots/pet） |
| `app/ui/pet` | 桌宠页（六态动画/点击唤主窗/拖动）——资产经 `pack/manifest.json` 拉取 |
| `app/ui/electron-builder.yml` | Linux 交叉打 Windows NSIS 安装包（`pnpm dist:win`） |
| `app/ui/tests` | 单测（vitest）+ e2e（playwright，隔离 HOME/DBus） |

## 测试

```sh
pnpm -C app/sdk test        # SDK 插件链
pnpm -C app/ui test         # 壳 + shim
pnpm -C app/ui test:e2e     # e2e（需要先 pnpm -C app/ui build）
```

## 许可证

本仓库自有代码 **MIT**（见 LICENSE）。两类内容不在本仓库、由 `install.sh` 拉取：

- **UI 移植层**（`frontend/`/`source/`）来自 [grok-bot-0.18-reconstructed](https://github.com/b-nnett/grok-bot-0.18-reconstructed)，无许可证——仅本地拉取私用，不随本仓分发；完整拼装见 `docs/PRIVATE-LAYER.md`。
- **桌宠形象**来自 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)：代码 MIT，形象 **CC BY-NC-SA 4.0**——私用可，商用分发前须替换。

见 `docs/LICENSE-SCOPE.md`（逐目录四分类）。

## 状态

早期开发（0.1.x）。当前能力：多 bot 编排+审批、提问卡协议、subagent 进 Workers、隐藏 bot、桌宠骨架、Windows 安装包交叉构建。路线：SSH 远程（Windows ↔ Ubuntu）、形象库、交付卡、通知面板。
