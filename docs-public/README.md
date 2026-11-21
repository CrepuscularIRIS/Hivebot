# Hivebot

桌面 AI bot 工作台——基于 **DS-Bot（独立 AppImage）+ DSH SuperAgent 双插件**的
多 bot 编排产品。内部代号 pbots。

> 2026-11-20 集成转向：砍掉自建 Grok Bot 复刻 UI 树，改为在开源 DS-Bot 基底上
> 以零 fork 双插件形态接入 DSH SuperAgent（用户已拍板，路径 A）。历史复刻体系
> 归档于 tag `archive/grokbot-replica-final`。

```
┌────────────────────────── Hivebot（当前形态）──────────────────────────┐
│  DS-Bot AppImage   独立桌面 app（Electron 壳 + pinned DSH 0.2.2 引擎） │
│  dsh-superagent    编排插件：接管 Chief 主 bot 会话（规划/决策/记账）  │
│  ds-bot            原生插件：TEAM_TOOLS 30 个多 bot 编排工具          │
│  scripts/          provision.sh 一条命令发行 + fresh-boot.sh 验收回归 │
└────────────────────────────────────────────────────────────────────────┘
```

## 一键开始（预配置发行形态）

```bash
# 1) 下载解包 DS-Bot AppImage（371MB）
curl -L -o /tmp/DS-Bot.AppImage \
  https://github.com/Fei2411/DS-Bot/releases/download/v0.3.8/DS-Bot-0.3.8-linux-x86_64.AppImage
mkdir -p /tmp/dsbot-trial && cd /tmp/dsbot-trial
chmod +x DS-Bot.AppImage && ./DS-Bot.AppImage --appimage-extract

# 2) 首启引擎产 profile 骨架（一次，等 "dsh web:" 后停）
#    细节见 scripts/dsbot-provision/README.md

# 3) 一条命令预配置（litellm provider + SuperAgent 插件 + presets）
DSH_LITELLM_API_KEY=<key> scripts/dsbot-provision/provision.sh <home>

# 4) 验收回归（引擎/provision/Chief/编排落盘四断言）
scripts/fresh-boot.sh
```

完整四步文档：`scripts/dsbot-provision/README.md`

## 架构（路径 A：零 fork 双插件）

- **主 bot（Chief）**：ds-bot 原生 Main Bot。SuperAgent 经 `watchLocalSession`
  钉定 Chief 会话（masterId 自动发现 + 段轮转重绑 + 崩溃自愈），在其上叠加
  编排决策层（eval/ticket/orchestrator HTTP 面）——不替换、不改名（keepTitle）。
- **多 bot 编排**：ds-bot TEAM_TOOLS（create_bot/message_bot/post_to_group 等 30 个）
  为主执行层；模型自然选择（R13 实证）；SuperAgent 提供增值（watch 记账/
  eval_read/ticket 异步队列兜底）。
- **kickoff 人格**：建 bot 即主动开场（roster kickoff→waitForModel→applyModel 路径），
  UI 选模型后释放——「打开进入会先回复我」原生满足。
- **崩溃自愈**：proper-lockfile stale 语义 + mtime 强制过期（强杀后立即重启可恢复）。

## 组件

| 路径 | 作用 |
|---|---|
| `app/superagent/` | DSH SuperAgent 插件（orchestrator 引擎：trigger/eval/ticket/executor） |
| `scripts/dsbot-provision/` | 一条命令发行器（patch 模板+provision.sh） |
| `scripts/fresh-boot.sh` | 验收回归（A1-A4 结构化断言） |
| `scripts/health-check.sh` | 四段健康读数（引擎/web/Chief/orchestrator） |
| `app/ui` `app/sdk` `app/launcher` | 历史自建体系（归档态，见 tag archive/grokbot-replica-final） |

## 已验证能力（2026-11-20，证据见 work/integration-rebuild/STATUS-2026-11-20.md）

接入与自动发现（R1/R5）· kickoff 人格（R8/R11）· 多 bot 编排真任务（R6/R9/R13/R16）·
崩溃恢复（R17 纠错轮）· provision 干净安装（纠错轮）· fresh-boot 结构化验收（纠错轮）

## License

见 `LICENSE` 与 `LICENSE-SCOPE.md`（0.18 移植树等法律排除边界）。
