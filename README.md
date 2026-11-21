# Hivebot

DS-Bot AppImage + DSH SuperAgent 双插件产品形态。内部代号 pbots。

```
┌────────────────────────── Hivebot ──────────────────────────┐
│  app/superagent   DSH SuperAgent 插件（编排引擎，零 fork）  │
│  scripts/dsbot-provision/  一条命令安装器（provision.sh）   │
  scripts/dsbot-trial/       引擎管理（engine.sh/fresh-boot.sh）
│  scripts/         健康检查/回归/发布                        │
└──────────────────────────────────────────────────────────────┘
```

基底：[DS-Bot](https://github.com/Fei2411/DS-Bot)（独立 Electron AppImage，自带 pinned DSH）。
SuperAgent 作为 dsh 插件与其同 profile 共存：接管 Chief 主 bot 会话（watch/trigger/kickoff 人格），
多 bot 编排由 ds-bot 原生 TEAM_TOOLS 提供，SuperAgent 负责 watch 记账、评估、ticket 异步兜底。

## 一键开始

```sh
git clone https://github.com/CrepuscularIRIS/Hivebot && cd Hivebot
# 1) 解包 DS-Bot AppImage（独立运行时，不依赖本机 dsh）
./DS-Bot-0.3.8-linux-x86_64.AppImage --appimage-extract
# 2) 预配置（litellm provider + SuperAgent 插件 + patch yml）
DSH_LITELLM_API_KEY=… scripts/dsbot-provision/provision.sh \
  --appimage-dir squashfs-root --home /path/to/home
# 3) 起引擎（headless）或直接跑 AppImage GUI
scripts/engine.sh start
```

需要：Linux x64、node ≥20、pnpm 或 npm（registry 可达）。验收回归：`scripts/fresh-boot.sh`（干净 home 首启→kickoff 人格→首条编排全链断言）。

## 结构速览

| 目录 | 内容 |
|---|---|
| `app/superagent/src/` | Runtime（master 发现/重绑/锁自愈）、engine（eval→decide→ticket）、executor（worker 会话） |
| `scripts/dsbot-provision/` | provision.sh：模板化 patch yml+插件安装，失败可安全重试 |
| `scripts/fresh-boot.sh` | 干净 home 回归（A1 引擎→A1.5 预配置→A2 Chief→A3 kickoff→A4 编排） |
| `scripts/health-check.sh` | 四段健康读数（引擎/web/Chief/orchestrator） |
| `work/integration-rebuild/` | 状态汇总（STATUS-2026-11-20.md）、试跑记录、功能对照 |

## 文档

- 当前状态与证据：`work/integration-rebuild/STATUS-2026-11-20.md`
- 公开 README（发布树）：`docs-public/README.md`
