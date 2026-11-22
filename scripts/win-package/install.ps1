# install.ps1 —— DSH SuperAgent overlay 安装器（Windows，PowerShell 5.1+）
# 把预构建的 dsh-superagent 插件 + DSH 预配置落进 DS-Bot 的 profile，
# 使主 bot 变为 SuperAgent 编排（Chief -> worker 多会话）。
#
# 用法（在解压后的目录里，右键「使用 PowerShell 运行」，或）：
#   powershell -ExecutionPolicy Bypass -File install.ps1 -ApiKey sk-xxx
#   powershell -ExecutionPolicy Bypass -File install.ps1 -ApiKey sk-xxx -BaseUrl http://192.168.1.5:4001/v1 -Model glm-5.3-flash
#   powershell -ExecutionPolicy Bypass -File install.ps1 -DataRoot D:\dsbot-data        # 数据目录挪过位置时
#
# 幂等：重复运行收敛到同一状态（先装 DS-Bot 或先跑本脚本都可以）。
# 前置：DS-Bot 0.3.8 已安装（或即将安装）。升级 DS-Bot 到其它版本后请重跑本脚本前先确认版本兼容。
[CmdletBinding()]
param(
    [string]$ApiKey = '',
    [string]$BaseUrl = 'http://127.0.0.1:4001/v1',
    [string]$Model = 'glm-5.3-flash',
    [string]$DataRoot = (Join-Path $env:USERPROFILE '.ds-bot')
)
$ErrorActionPreference = 'Stop'

# DS-Bot 正在跑会锁文件且引擎只在启动时读 profile——提示但不阻塞
if (Get-Process -Name 'DS Bot' -ErrorAction SilentlyContinue) {
    Write-Warning 'DS-Bot 正在运行：完成后请完全退出 DS-Bot 再重新启动，配置才会生效。'
}

$ProfileDir = Join-Path $DataRoot 'profiles\ds-bot'
$PluginDst  = Join-Path $ProfileDir 'node_modules\dsh-superagent'
$Overlay    = Join-Path $PSScriptRoot 'overlay'
$Template   = Join-Path $PSScriptRoot 'cordis.patch.win.yml'

foreach ($p in @($Overlay, $Template)) {
    if (-not (Test-Path $p)) { throw "缺文件: $p（请在解压后的完整目录里运行）" }
}

# 1) 插件目录：预构建产物直接落盘（目标机无需 node/npm/pnpm；
#    runtime 依赖 proper-lockfile/zod 已 vendored 在 overlay\dsh-superagent\node_modules）
New-Item -ItemType Directory -Force -Path (Split-Path $PluginDst -Parent) | Out-Null
if (Test-Path $PluginDst) { Remove-Item -Recurse -Force $PluginDst }
Copy-Item -Recurse (Join-Path $Overlay 'dsh-superagent') $PluginDst
if (-not (Test-Path (Join-Path $PluginDst 'lib\index.js'))) { throw '插件落盘失败：lib\index.js 缺失' }

# 2) 渲染 cordis.patch.yml（Windows 路径一律正斜杠，YAML 安全）
$StateDir = (Join-Path $DataRoot 'superagent-state') -replace '\\', '/'
$DataDirF = $DataRoot -replace '\\', '/'
$yml = Get-Content -Raw -Encoding UTF8 $Template
$yml = $yml.Replace('__STATE_DIR__', $StateDir).Replace('__DATA_DIR__', $DataDirF)
$yml = $yml.Replace('__BASE_URL__', $BaseUrl).Replace('__MODEL_ID__', $Model)
# WriteAllText 默认 UTF-8 无 BOM（PS5.1 的 -Encoding utf8 会带 BOM，YAML 不想要）
[System.IO.File]::WriteAllText((Join-Path $ProfileDir 'cordis.patch.yml'), $yml)

# 3) 注册 bundle 层：引擎只对 package.json dsh.profile.bundles 列出的包应用包内补丁，
#    漏注册则插件静默不激活（/orchestrator 404——2026-11-22 Linux 侧实证过的缺口）。
#    首启前就跑本脚本时自行生成骨架：必须含引擎默认 4 bundle（丢 web-app 会没界面），
#    形状镜像 0.3.8 引擎自生成版（name=dsh-profile-ds-bot）。
$PkgPath = Join-Path $ProfileDir 'package.json'
if (Test-Path $PkgPath) {
    $pkg = Get-Content -Raw -Encoding UTF8 $PkgPath | ConvertFrom-Json
    if (-not $pkg.dsh) { $pkg | Add-Member NoteProperty dsh ([pscustomobject]@{}) }
    if (-not $pkg.dsh.profile) { $pkg.dsh | Add-Member NoteProperty profile ([pscustomobject]@{}) }
    if (-not $pkg.dsh.profile.bundles) { $pkg.dsh.profile | Add-Member NoteProperty bundles @() }
    if (@($pkg.dsh.profile.bundles) -notcontains 'dsh-superagent') {
        $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles) + 'dsh-superagent'
    }
} else {
    $pkg = [pscustomobject]@{
        name = 'dsh-profile-ds-bot'; private = $true
        dependencies = [pscustomobject]@{ 'dsh-superagent' = 'file:overlay/dsh-superagent' }
        dsh = [pscustomobject]@{ profile = [pscustomobject]@{ bundles = @(
            '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app',
            '@deepseek-ai/dsh-experimental-voice-input-bundle', 'ds-bot', 'dsh-superagent') } }
    }
}
[System.IO.File]::WriteAllText($PkgPath, ($pkg | ConvertTo-Json -Depth 10) + "`n")

# 4) API key 写进用户环境变量（引擎经 apiKeyEnv: DSH_LITELLM_API_KEY 读取）
if ($ApiKey -ne '') {
    [Environment]::SetEnvironmentVariable('DSH_LITELLM_API_KEY', $ApiKey, 'User')
    Write-Host "已写入用户环境变量 DSH_LITELLM_API_KEY（新启动的进程可见）"
} else {
    Write-Warning '未传 -ApiKey：请自行设置用户环境变量 DSH_LITELLM_API_KEY，否则模型调用会 401'
}

Write-Host ''
Write-Host '安装完成。落盘位置：'
Write-Host "  插件:   $PluginDst"
Write-Host "  配置:   $ProfileDir\cordis.patch.yml"
Write-Host "  状态:   $StateDir"
Write-Host ''
Write-Host '下一步：'
Write-Host '  1. 若尚未安装 DS-Bot：双击本目录的 DS-Bot-0.3.8-win-x64.exe 安装'
Write-Host '  2. 启动 DS Bot，新建/进入会话即为主 bot（Chief）编排'
Write-Host '  3. 验证激活：会话里让 bot 访问 http://127.0.0.1:<端口>/orchestrator/api/state，'
Write-Host '     或看日志无 "declares no dsh.bundle" 警告（详见 README.md 排查节）'
