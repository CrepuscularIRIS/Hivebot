# 私有 UI 层拼装（完整体验）

公开仓不含 0.18 移植的 UI 树（`frontend/`、`source/`、运行时资产）——`install.sh` 会把上游拉到 `vendor/grok-bot-0.18-reconstructed`。拼装完整可跑 UI 还需要：

1. 把 `vendor/grok-bot-0.18-reconstructed/frontend` 链接/复制到 `app/ui/renderer-grok/frontend`，`source` 同理；
2. 我们的接线层（`app/ui/renderer-grok/{shim,overrides}`，在本仓）负责把 0.18 ProductionRenderer 接到 dsh 协议——差异文件与增量补丁在 Windows 研发线（T46 系）整理成 `pack/` 的 patch 清单后，`install.sh` 将全自动拼装；
3. `pnpm -C app/ui build && ./app/launcher/hivebot`。

> 0.18 上游无许可证：拉取与拼装仅限私用；不要把拼好的树再分发。

## 0.78.1 吉祥物引擎（vendor-078，2026-11-14 起）

`app/ui/renderer-grok/assets/vendor-078/`（index.eager-common-DbK3Oi_r.js + chunk-rolldown-runtime-BCiCTKAo.js）来自 grok-bot 0.78.1 官方 deb，**闭源产物、无分发许可——只作本地依赖，不进本仓**。install.sh 第 2.5 步从你自备的 deb（`GROK_BOT_DEB` 或 `~/Downloads/grok-bot_0.78.1_amd64.deb`）解包就位；完整性校验见 `assets/SHA256SUMS`。缺它时 UI 构建不可用（`overrides/modules/agent-avatar.tsx` 静态引用）。
