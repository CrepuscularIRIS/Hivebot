# Hivebot

DS-Bot AppImage + DSH SuperAgent 双插件产品形态。内部代号 pbots。

```
┌────────────────────────── Hivebot ──────────────────────────┐
│  app/superagent            DSH SuperAgent 插件（watch 记账 / 评估 / 兜底）
│  scripts/dsbot-provision/  安装器（provision.sh / uninstall.sh）
│  scripts/                  健康检查 / 验收回归 / Windows 增强包
└──────────────────────────────────────────────────────────────┘
```

基底：[DS-Bot](https://github.com/Fei2411/DS-Bot)（独立 Electron AppImage，自带 pinned DSH）。
SuperAgent 作为 dsh 插件与其同 profile 共存：Chief 仍是 DS-Bot 原生主 bot，多 bot 编排由 ds-bot 原生 TEAM_TOOLS 提供；SuperAgent 盯住 Chief 会话（masterId 自动发现）做 watch 记账、评估、ticket 异步兜底。

## 一键开始（Linux 桌面）

```sh
git clone https://github.com/CrepuscularIRIS/Hivebot && cd Hivebot
APPIMAGE="$HOME/DS-Bot-0.3.8-linux-x86_64.AppImage"   # 换成你的 AppImage 路径，记得 chmod +x
"$APPIMAGE"                    # ① 首启一次，窗口出来后完全退出
# ② 让 DS-Bot 进程看得到网关 key DSH_LITELLM_API_KEY——做法见 scripts/dsbot-provision/README.md 第 2 步
scripts/dsbot-provision/provision.sh "$HOME" --appimage "$APPIMAGE"   # ③ 安装
"$APPIMAGE"                    # ④ 启动，给 Chief 选「glm-5.3-flash · LiteLLM (local)」
DSBOT_HOME="$HOME" scripts/health-check.sh            # ⑤ 期望末行 RESULT: SuperAgent 就绪
```

需要：Linux x64、DS-Bot 0.3.8 AppImage、一个 OpenAI 兼容网关及其 key（默认 `http://127.0.0.1:4001/v1` + `glm-5.3-flash`）、能访问 npm registry。用 `--appimage` 不用另装 Node / pnpm。② 做漏了，首屏就没有模型按钮。

逐步教程与排障：`scripts/dsbot-provision/README.md`。Windows：`scripts/win-package/README.md`（`setup.bat` 一键）。

## 结构速览

| 目录 | 内容 |
|---|---|
| `app/superagent/src/` | Runtime（master 发现/重绑/锁自愈）、engine（eval→decide→ticket）、executor（worker 会话） |
| `scripts/dsbot-provision/` | `provision.sh` 安装（模板化 patch yml + 插件安装 + bundle 注册）、`uninstall.sh` 撤销，失败可安全重试 |
| `scripts/fresh-boot.sh` | 干净 home 回归（A1 引擎→A1.5 预配置→A2 Chief→A3 kickoff→A4 编排） |
| `scripts/health-check.sh` | 健康读数（引擎/web/Chief/orchestrator；桌面安装走到编排面） |
| `scripts/win-package/` | Windows 增强包（官方安装器 + SuperAgent overlay，`setup.bat` 一键） |
| `work/integration-rebuild/` | 状态汇总（STATUS-2026-11-20.md）、试跑记录、功能对照 |

## 文档

- 安装教程（Linux 桌面）：`scripts/dsbot-provision/README.md`
- Windows：`scripts/win-package/README.md`
- 更新说明：`docs-public/RELEASE-NOTES.md`
- 配置指南：`docs/CONFIG-GUIDE.md`
- 当前状态与证据：`work/integration-rebuild/STATUS-2026-11-20.md`
- 公开 README（发布树）：`docs-public/README.md`
