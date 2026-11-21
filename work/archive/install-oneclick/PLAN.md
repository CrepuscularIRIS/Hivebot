# PLAN：GitHub 一键安装（Windows 优先）

> manager (Opus 5.5) 任务 A，2026-11-11。BRIEF 见同目录。

## 1. 现状（只读探针结论）

**发布链**（`scripts/publish-hivebot.sh` → 公开仓 CrepuscularIRIS/Hivebot，main = e21b6312）
- 「start.mjs 没有」的根因：rsync 排除项未锚定，`--exclude=scripts` 吃掉所有层级的 `scripts/`：`app/sdk/scripts/start.mjs`、`app/ui/scripts/{stage-renderer,check-win-package,run-e2e}`、`app/ui/renderer-grok/scripts/*` 均不在公开仓（gh api 树已核）。`docs`/`work`/`out`/`evidence` 同病。同步源是工作区而非 git 跟踪集，靠一串杂物排除兜底。
- 即使修好：公开仓**按设计**没有 0.18 移植树（无许可证），clone 下来只能跑后端（`hivebot serve`），拼不出 UI；`install.sh` 的 `--full` 拉 vendor 也拼不出（我们对 0.18 的本地改动 ~320 个文件差异没有 patch 化）。
- Release 页：**零 Release**，无任何预构建产物。
- **合规事故**：公开仓上有 83 个开发分支（私仓 `origin` 就是公开仓），如 `feat/P5-50` 含 376 个 `renderer-grok/frontend/` 文件——0.18 树已公开可见，与「合规公开」的决定相反。→ Q-053。

**Windows 链**
- T46a（NSIS 按用户装、asar 白名单、`check-win-package.mjs`）+ T46b（remote.json → ssh 隧道连 Ubuntu `hivebot serve`）+ T46c/d（serve / `--connect`）均已验收，代码在集成分支。
- 本机已产出 `app/ui/dist-app/Hivebot-Setup-0.1.0.exe`（124 MB，2026-11-10 22:54，早于今天的 T56/T57c/T59 等 UI 修复——是旧的）。Linux 上 wine-11 可交叉打包；无 .deb、无 Linux 打包目标。
- exe 是**薄客户端**：只有界面，SDK / key / 沙箱都在 Ubuntu（Q-045 定案）。Windows 上「装好」= 装 exe + 写 remote.json + Ubuntu 上 serve 在跑。T46b 的 Windows 实机清单用户还没做过。
- exe 里打包了 0.18 衍生的渲染层产物 → 放到公开 Release = 分发无许可证代码 → Q-052。

## 2. 方案

Windows 预构建 exe（不从源码构建——Windows 侧本来就没有可构建的源码），类 Unix 源码脚本（只到后端可用）。exe 的来源按 Q-052 默认 A：**从用户自己的 Ubuntu 经 SSH 拷**（Windows 本来就必须能免密 ssh 到 Ubuntu），不经 GitHub 分发任何 0.18 衍生物；install.ps1 本身是自写代码，可以放公开仓。用户选 B（公开 Release）时只需把 T65 的取包步骤换成下载，其余不变。

| # | 单 | 目标 | 依赖 | 状态 |
|---|---|---|---|---|
| I1 | **T63** 发布链修漏 + install.sh 后端默认路径 | 公开仓 clone → `./install.sh` → `hivebot serve` 起得来 | — | **open** |
| I2 | T64 `install.sh --win`（私仓树）在 HEAD 构建 exe + 过 `check-win-package` + 拷到 `${XDG_DATA_HOME:-~/.local/share}/hivebot/Hivebot-Setup.exe`（固定路径给 T65 取）；公开 clone（无 frontend）一行报错退出非 0 | install.sh 与 T63 同文件 → T63 合并后 | 计划 |
| I3 | T65 `install.ps1 -Host <别名>`（仓根，自写，可公开）：校验 host（同 `ssh.ts` HOST_RE）→ `ssh -o BatchMode=yes` 免密探测 → `serve --status`（不碰 `--connect`/token；没在跑只警告）→ scp 固定路径的 exe → `/S` 静默装 → 写 **无 BOM** UTF-8 `remote.json` 到 userData（第 0 步从 asar 的 package.json 定实际目录名）→ 启动 | T64 定的路径（可先并行写） | 计划 |
| I4 | 用户 Windows 实机：一条命令装起来并完成 T46b 清单 4–6 | T65 | 用户做 |

## 3. 不做
- 公开仓 clone 出完整 UI（0.18 差异 patch 化）——许可证灰区 + 工作量大，用户没要求。
- Linux .deb / AppImage、代码签名、自动更新——当前用户在 Ubuntu 上直接用私仓树。
