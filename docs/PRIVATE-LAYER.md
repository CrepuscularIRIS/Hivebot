# 私有 UI 层拼装（完整体验）

公开仓不含 0.18 移植的 UI 树（`frontend/`、`source/`、运行时资产）——`install.sh` 会把上游拉到 `vendor/grok-bot-0.18-reconstructed`。拼装完整可跑 UI 还需要：

1. 把 `vendor/grok-bot-0.18-reconstructed/frontend` 链接/复制到 `app/ui/renderer-grok/frontend`，`source` 同理；
2. 我们的接线层（`app/ui/renderer-grok/{shim,overrides}`，在本仓）负责把 0.18 ProductionRenderer 接到 dsh 协议——差异文件与增量补丁在 Windows 研发线（T46 系）整理成 `pack/` 的 patch 清单后，`install.sh` 将全自动拼装；
3. `pnpm -C app/ui build && ./app/launcher/hivebot`。

> 0.18 上游无许可证：拉取与拼装仅限私用；不要把拼好的树再分发。
