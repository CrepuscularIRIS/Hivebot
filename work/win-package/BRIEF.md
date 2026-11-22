# BRIEF · DS-Bot 0.3.8 + DSH SuperAgent 单一 Windows 安装包

- 日期：2026-11-22
- 用户原话（m00482）：「OK, 那么更小到0.3.8, 然后是这样的, 我需要你把整个作为一个安装包, 后续我们希望到Windows一侧做安装, 将其中的ACP, 一个DSH配置为DSH SuperAgent, 我们只需要做这个强化」
- 解读（含口误处理）：①停留在 0.3.8（不升 0.3.9）；②整套（DS-Bot + SuperAgent 插件 + 预配置）打成**一个安装包**；③目标是 Windows 侧安装；④包内 DSH 预配置为 DSH SuperAgent（= provision 的产物形态内建，SuperAgent 为主 bot 编排）。「ACP」无对应实体，按口误处理，不改变工作内容。

## 方案（搬运阶梯第 2 级：上游官方安装器 + 包装层）

- **A（采纳）**：单 zip = 官方 `DS-Bot-0.3.8-win-x64.exe`（构建时下载 + sha256 钉死）+ `overlay/`（预构建 dsh-superagent 目录，含 vendored proper-lockfile/zod）+ `install.ps1`（渲染配置 + 落盘 + 注册 bundles + 幂等 repair）+ 中文 README。
- **B（否决）**：wine 下 electron-builder 自建 NSIS——`npmRebuild:false` + node-pty/sharp/koffi 平台预编译二进制使 Linux→win 交叉构建走不通，且违反搬运阶梯。

## 已钉死的事实

- 官方 0.3.8 Windows 安装器存在：`https://github.com/Fei2411/DS-Bot/releases/download/v0.3.8/DS-Bot-0.3.8-win-x64.exe`（305MB，NSIS oneClick:false）。
- Windows 数据根 = `%USERPROFILE%\.ds-bot`（0.3.8 源码 first-run.mjs:60 `dataDir: join(homedir(), '.ds-bot')`），profile 落 `profiles\ds-bot`，与 Linux 同构。
- 插件 runtime deps 仅 proper-lockfile@4.1.2 + zod@4.4.3（vendored 进 `dsh-superagent\node_modules\`）；`@deepseek-ai/*` 为 peerDependencies 由引擎供给（Linux 0.3.8 实证）。
- bundle 层生效前提：profile `package.json` 的 `dsh.profile.bundles` 含 `dsh-superagent`（de19fee3 修复的缺口）。
- 引擎接受预创建的 profile（fresh-boot：先 provision 后首启，A2.5 激活断言过）——install.ps1 先跑后跑都收敛（幂等）。

## 验收（构建侧）

- `build-win-package.sh` 在 Linux 产出自检通过的 zip：内容清单断言 + exe sha256 断言 + 模板占位符断言。
- Windows 侧冒烟留给用户实机（README 提供 install.ps1 落盘自检输出 + 首启后 `/orchestrator/api/state` 期望）。
