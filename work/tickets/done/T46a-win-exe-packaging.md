# T46a：Windows 安装包打包链（在 Ubuntu 上产出 Hivebot-Setup.exe，「hello exe」）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：`work/exp-polish/BRIEF.md`「2026-11-09 追加二」第 5 项（「模仿一个 dsh 类似的安装内容，做一个 windows 的 exe 启动包，后续我会在 windows 连接到 Ubuntu 去测试」）。queue「桌宠 + Windows 分发」节 W1。
> 分支 / 作业目录：feat/T46a @ /tmp/bot-wt/T46a（只碰 app/ui 的打包配置，与 T45a 不撞文件，可并行）
> claimed：2026-11-09 main (GLM 5.3) @ feat/T46a // worktree /tmp/bot-wt/T46a
> accepted：2026-11-09 dc864c0b（经理任务 B，见 receipts/T46ac.acceptance.md）

## 目标
在这台 Ubuntu 上一条命令打出 Windows x64 的 NSIS 安装包 `Hivebot-Setup-<版本>.exe`（按用户安装、建开始菜单 / 桌面快捷方式、可卸载）。装好后双击能起 Hivebot 窗口（此时还没接后端，显示「未连接」的空壳——接 Ubuntu 是 T46b/T46c）。包里**只有界面**：没有 SDK、没有 launcher、没有任何凭证。

## 方案定案（经理探针，2026-11-09）
1. **工具链 = electron-builder**（搬运阶梯第 1 级）：dsh 官方桌面版就用它（`repos/deepseek-harness/apps/desktop/electron-builder.config.mjs`，NSIS + 自定义页 + 按用户装 + EV 签名 + electron-updater），dsh-pet 也用它（`dsh-pet/electron-builder.yml`，只出 `dir` 绿色版）。我们 `app/ui/package.json` 现在**没有**任何打包器（只有 electron-vite 构建出 `out/`）。npm 最新 `electron-builder@26.18.0`。
2. **Linux 交叉打 Windows 可行**：本机已有 `wine-11.0`（electron-builder 改 exe 图标 / 版本信息用）；`electron-v44.7.0-win32-x64.zip` 从 GitHub 与 npmmirror 都可达（curl HEAD 302，2026-11-09）。
3. **模仿 dsh 的安装体验，只取「装得上、点得开、卸得掉」**：NSIS 按用户安装（不要管理员）、开始菜单 + 桌面快捷方式、卸载登记。**不做**：代码签名（无证书，首次运行 SmartScreen 会拦，点「更多信息 → 仍要运行」；见 Q-045）、自动更新、`dsh` 命令行进 PATH、托盘、安装页美化——dsh 那些都是正式发行的工程量，用户是自测。
4. **为什么 exe 里只放界面**：现有 Electron main 本来就只是 dsh 的 HTTP + WebSocket 客户端（`main/dsh/connect.ts`：拿 handoff 里的 `base-url` + `launch-token` 换 cookie），SDK、沙箱（bwrap）、启动器（bash + flock + /proc）全是 Linux-only 且握着 LLM key。所以 Windows 侧 = 薄客户端，后端整个留在 Ubuntu（T46b/T46c 定）。**不走 T9 系 ssh 组合**：那是「dsh host 在本机、工具到远端执行」，会把 SDK 和 key 搬到 Windows 上，违反「凭证不进 exe」。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/ui/package.json`、`app/ui/electron.vite.config.ts`（main 用 `externalizeDepsPlugin`，`out/main/index.js` 里有 `require("ws")`——运行时唯一依赖）、`app/ui/scripts/stage-renderer.mjs`、`app/ui/main/index.ts:195-215`（appRoot 解析、无 `PBOTS_DSH_HANDOFF` 时走未配置分支）、`app/ui/main/ready.ts`
3. 参照：`repos/deepseek-harness/apps/desktop/electron-builder.config.mjs`（win/nsis 段）、dsh-pet `dsh-pet/electron-builder.yml`（「不带 node_modules / asar / npmRebuild false」的取舍注释）

## 边界
1. 只动：`app/ui/package.json`（devDependency `electron-builder` 精确钉版 + 一条 `dist:win` 脚本）、`app/ui/pnpm-lock.yaml`、新 `app/ui/electron-builder.yml`、`app/ui/.gitignore`（加 `dist-app/`）、新 `app/ui/tests/unit/shell/win-package.test.ts`（或同等的校验脚本，二选一，回执写明）。**不碰** main / preload / renderer 源码；若发现 Windows 下必须改源码才能起窗，停下写进回执存疑项，另开单。
2. `ws` 的带法二选一，回执写明选了哪个：a) electron-builder 把生产依赖 `ws` 打进 asar；b) electron-vite main 构建把 `ws` 内联（`externalizeDepsPlugin({ exclude: ['ws'] })`）、包里不带 node_modules。选 b 会改 Linux 产品构建，需加跑下面验收 6 的回归。
3. 先写失败测试：验收 3 的校验先跑一次（还没有 `dist-app/` → 红），再配置到绿。
4. **产物不外传**：不 push `dist-app/`、不发 GitHub release、不上传任何地方（renderer 含 0.18 重构树的上游资产，CLAUDE.md §5「私用不分发」）。用户自己拷到 Windows。
5. 构建会下 Electron win32 zip 与 NSIS / wine 相关二进制到 `~/.cache/electron`、`~/.cache/electron-builder`——这是缓存不是凭证，可以。网络不通时设 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`，回执写明。
6. 不跑全量 e2e；机器在跑 GPU 训练，打包前看一眼 load。

## 验收（写命令，不写感觉）
在 `app/ui` 下：
1. `pnpm --config.verify-deps-before-run=false build && pnpm --config.verify-deps-before-run=false dist:win` → exit 0；`ls dist-app/` 有 `Hivebot-Setup-*.exe` 与 `win-unpacked/Hivebot.exe`。
2. `file dist-app/win-unpacked/Hivebot.exe dist-app/Hivebot-Setup-*.exe` → 前者含 `PE32+ executable (GUI) x86-64`，后者含 `Nullsoft Installer`。
3. 包内容校验（`win-package.test.ts` 或脚本，用 `npx @electron/asar list dist-app/win-unpacked/resources/app.asar`）：
   - ⓐ 有 `/out/main/index.js`、`/out/preload/index.cjs`、`/out/renderer/index.html`、`/out/renderer/shim.iife.js`、`/package.json`
   - ⓑ `ws` 可解析：若 `out/main/index.js` 含 `require("ws")` 则必须有 `/node_modules/ws/package.json`；否则 main 里不得再有 `require("ws")`
   - ⓒ **白名单**：asar 里每个条目都在 `/out/**`、`/package.json`、`/node_modules/ws/**` 之内；不许出现 `app/sdk`、`launcher`、`work/`、`tests/`、`renderer-grok/frontend`（源码树）、`.env`、`*.map`
   - ⓓ `resources/` 下除 `app.asar`（及 electron-builder 自带的 `app-update.yml` 若有）外无别的文件
   - 跑一次让它红（无产物）再绿，回执贴两次尾部
4. 变异：在 electron-builder.yml 的 `files` 里多加 `../sdk/**`（或任一非白名单路径）重打 → ⓒ 红；还原。回执贴红尾。
5. 体积：`du -sh dist-app/Hivebot-Setup-*.exe` 回执记一行（预计 100 MB 上下；超过 250 MB 停下查是不是带进了 node_modules 全家）。
6. 若选了边界 2-b（内联 ws）：`pnpm exec sh scripts/run-e2e.sh tests/e2e/launcher.spec.ts tests/e2e/session.spec.ts` 照旧通过（Linux 产品构建没被改坏）。
7. **Windows 实机**（用户做，不阻塞经理验收）：回执末尾写一段给用户的三步——拷 `Hivebot-Setup-*.exe` 到 Windows → 双击（SmartScreen 点「更多信息 → 仍要运行」）→ 开始菜单「Hivebot」能起窗口；用户回报结果记进 `work/LOG.md`。

## 为什么这样验收
- 真正要保住的是两件事：**能产出 Windows 能跑的包**（1、2 证明是真的 PE GUI 与 NSIS，不是一个改了后缀的文件），和**包里不夹带后端与凭证**（3ⓒ 白名单 + 变异 4 证明白名单真有判定力——只查「有什么」查不出多带了什么）。
- ⓑ 防最常见的打包翻车：本机能起是因为旁边有 node_modules，装到 Windows 一启动就 `Cannot find module 'ws'`。
- 不在 Linux 上用 wine 跑 Electron：结果不可信（GPU / 沙箱在 wine 下都不正常），真跑留给用户的 Windows。

## 产出
- `app/ui/electron-builder.yml`、`app/ui/package.json`（+devDep + `dist:win`）、`app/ui/pnpm-lock.yaml`、`app/ui/.gitignore`
- `app/ui/tests/unit/shell/win-package.test.ts`（或 `app/ui/scripts/check-win-package.mjs`）
- 回执 `work/tickets/receipts/T46a.receipt.md`（含给用户的 Windows 三步）
