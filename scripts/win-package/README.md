# DS-Bot 0.3.8 · DSH SuperAgent 增强包（Windows）

一个包 = 官方 DS-Bot 0.3.8 Windows 安装器 + DSH SuperAgent 插件 + 预配置。
**注意：exe 本身是官方原版安装器，不带 SuperAgent**——SuperAgent 由其后的 overlay 安装（`setup.bat` 会把两步串起来）。
装完后 Chief 仍是 DS-Bot 原生主 bot，多 bot 编排走 DS-Bot 原生 TEAM_TOOLS；SuperAgent 盯住 Chief 会话做 watch 记账、评估与 ticket 异步兜底。

## 安装（推荐：一键）

1. 解压后双击 `setup.bat`：输入 LiteLLM ApiKey（可回车跳过）→ 官方安装向导 → 完全退出自动启动的 DS-Bot → 自动装 overlay → 完成。

## 手动安装（等价三步）

1. **装 DS-Bot**：双击 `DS-Bot-0.3.8-win-x64.exe`（官方 NSIS 向导，可选安装目录）。
2. **装 SuperAgent overlay**：在本目录右键 `install.ps1` →「使用 PowerShell 运行」，或：
   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1 -ApiKey <你的litellm-key> `
       -BaseUrl http://<litellm地址>/v1 -Model glm-5.3-flash
   ```
   先装 exe 还是先跑脚本都可以（幂等，重复运行收敛同一状态）。
3. **启动 DS Bot**。首屏若是「Pick a model for me first」，点你的 LiteLLM 模型那一项。完成。

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `-ApiKey` | 无 | litellm 网关 key，写入用户环境变量 `DSH_LITELLM_API_KEY` |
| `-BaseUrl` | `http://127.0.0.1:4001/v1` | LLM 网关地址（Windows 本机要有 litellm，或指向局域网内网关） |
| `-Model` | `glm-5.3-flash` | 默认模型 id（须是网关里存在的模型名） |
| `-DataRoot` | `%USERPROFILE%\.ds-bot` | 只在 DS-Bot 里把数据目录挪过位置时才需要传 |

## 装了什么

- `%USERPROFILE%\.ds-bot\profiles\ds-bot\node_modules\dsh-superagent\`——预构建插件（目标机**不需要** Node/npm）
- `%USERPROFILE%\.ds-bot\profiles\ds-bot\cordis.patch.yml`——模型路由（litellm）+ 默认模型 + SuperAgent stateDir/dataDir
- `package.json` 的 `dsh.profile.bundles` 注册 `dsh-superagent`——**关键一步**，漏了插件静默不激活
- 用户环境变量 `DSH_LITELLM_API_KEY`（传了 `-ApiKey` 时）

## 验证与排查

- **插件激活了吗**：DS-Bot 运行中，在 PowerShell 里执行
  `Invoke-WebRequest -Uri "http://127.0.0.1:<端口>/orchestrator/api/state" -Headers @{"x-orchestrator-request"="1"} -UseBasicParsing`
  （端口取引擎日志里 `dsh web` 那一行的地址）：200 = 插件已激活；404 = 没激活 → 重跑 `install.ps1`（幂等 repair），
  再完全退出并重启 DS-Bot。不带这个头恒为 403，不能当判据。（判据在 Linux 桌面版实测，Windows 未单独实测。）
- **日志**：`%USERPROFILE%\.ds-bot\` 下引擎日志若出现 `declares no dsh.bundle`，
  说明 bundles 注册没生效 → 打开 `profiles\ds-bot\package.json` 确认 `dsh.profile.bundles` 数组含 `dsh-superagent`。
- **模型 401**：环境变量没生效（要新进程）或 key/BaseUrl 错。
- **升级 DS-Bot 版本**：本包只配 0.3.8（引擎 peerDeps 版本锁定）；升级后需重新制作增强包。

## 卸载 SuperAgent（回到原生 DS-Bot）

```powershell
Remove-Item -Recurse "$env:USERPROFILE\.ds-bot\profiles\ds-bot\node_modules\dsh-superagent"
```
再把 `profiles\ds-bot\package.json` 里 `dsh.profile.bundles` 中的 `dsh-superagent` 删掉，重启 DS-Bot。
