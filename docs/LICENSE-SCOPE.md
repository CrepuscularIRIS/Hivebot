# 许可证范围（逐目录四分类）

> 本仓（公开）只含第一、二类。第三、四类由 `install.sh` 按 `pack/manifest.json` 拉到本地，不随本仓分发。

| 类 | 内容 | 许可证 | 在公开仓？ |
|---|---|---|---|
| 自写 | `app/sdk/src`、`app/ui/{main,preload,tests,pet 代码}`、`app/ui/renderer-grok/{shim,overrides,配置}`、`app/launcher`、`install.sh`、`pack/` | MIT（本仓 LICENSE） | ✅ |
| MIT 上游引用 | `app/sdk/profile/patches` 引用的 `@deepseek-ai/*` npm 包（运行时依赖，非复制源码） | 上游各自 | ✅（仅引用） |
| 0.18 移植 | `renderer-grok/{frontend,source,assets,harness}` | 无许可证（[grok-bot-0.18-reconstructed](https://github.com/b-nnett/grok-bot-0.18-reconstructed)） | ❌ 本地拉取 |
| 第三方形象资产 | `app/ui/pet/assets/fish/*.webm` | 代码 MIT / 形象 CC BY-NC-SA 4.0（[dsh-pet](https://github.com/PC2005-cloud/dsh-pet)） | ❌ 本地拉取 |
