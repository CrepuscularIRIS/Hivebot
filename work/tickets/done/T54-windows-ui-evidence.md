# T54：Windows UI 错位取证——Win11 VM 与 Linux 同屏截图 + 元素几何对照（不改产品代码）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：work/ui-polish-win/BRIEF.md「已知线索·Windows UI 错位」；PLAN 行 W0
> 分支 / 作业目录：直接在集成分支，只加 `work/ui-polish-win/evidence/T54/`
> claimed：2026-11-11 main (GLM) @ 8146cba0
> blocked：2026-11-11 manager 任务 C（已解除）
> accepted：2026-11-11 2e57c35b（manager 任务 B，以 T54c 第三轮证据关闭：窗口层无错位；见 receipts/T54.acceptance.md §6）

## 目标
把用户说的「Windows 里 UI 错位一系列问题」变成一张**逐屏对照表**：每屏一对截图（Win11 VM / Linux，同窗口尺寸同状态）+ 关键元素的盒子坐标与实际字体，指出哪里错、错多少、像是哪类原因。修单按这张表开，不凭猜。

## 已知环境（经理 2026-11-11 只读探过）
- VM：qemu（`~/vm-store/run/qemu.pid`），Win11，**1280×800、96 DPI（100%）**；VM 内 Hivebot 0.1.0（T46a 安装包），连宿主 `hivebot serve`（T46b 链路）。
- 进 VM：`ssh -i ~/.ssh/hivebot_vm_key -p 2222 hivebot@127.0.0.1`；整屏截图：`vncdo -s :5 capture <png>`（宿主侧）。
- **VM 内的 Hivebot 是 0.1.0 包**，不含 T51 等新改动——取证对象就是用户手上的那版；Linux 对照用同一提交（`git log` 找 0.1.0 对应 SHA，记进回执；对不上就用当前 main 并在表头写明）。

## 怎么取（推荐路线，走不通照实记再降级）
1. **首选 CDP**：在 VM 里用 `--remote-debugging-port=9229`（只绑 VM 的 127.0.0.1）启动 Hivebot，宿主 `ssh -L 9229:127.0.0.1:9229` 转出来，Playwright `chromium.connectOverCDP` 连上主窗口。这样能在两边跑**同一份脚本**：导航到每个状态、截图、对一组选择器取 `getBoundingClientRect()` + `getComputedStyle().fontFamily/fontSize/lineHeight` + `document.fonts` 实际命中字体 + `devicePixelRatio` + `navigator.platform`。Linux 侧用现成 `launchShell`（`app/ui/tests/support/launch.ts`）跑同一份脚本，窗口设成与 VM 内一致的内容区尺寸。
2. 降级：应用拒绝 remote-debugging（main 里有拦截就是），改 vncdo 点击 + 整屏截图，几何数据只在 Linux 侧取，回执写明降级原因。
3. 取证完**关掉 VM 内的调试端口实例**、恢复原 schtasks 启动方式；不改 VM 系统设置（DPI、字体、主题都保持用户现状）。

## 屏矩阵（每屏：Win png、Linux png、几何 json；亮色为主，标 ★ 的加暗色）
1. 主界面空态（侧栏展开）★ 2. 侧栏折叠 rail 3. 有会话（含工具行、审批卡如能触发）★ 4. 窗口标题栏区域放大（最小化 / 最大化 / 关闭钮与自绘内容的相对位置）5. Connect apps 浮层（空态）★ 6. Settings → General ★ 7. 新建 bot 对话框（展开 More options）8. onboarding 任一步 + Connect 步 9. info pane（View agent settings）10. 窗口缩到 900×600 时的主界面（看溢出 / 折行）

几何选择器至少：`.sand-agents-sidebar`、侧栏头部按钮行、`.sand-agents-sidebar__plugins-entry`、会话头、composer、市场浮层容器与标题、设置对话框导航与面板、新建对话框各按钮。

## 边界
1. 只新建：`work/ui-polish-win/evidence/T54/`（脚本、png、json、`MATRIX.md`）与 `work/tickets/receipts/T54.receipt.md`。不碰 `app/**`、不改 VM 系统设置、不在 VM 里留常驻调试端口。
2. 不臆测根因：`MATRIX.md` 每条差异写「现象 + 量化（px / 字体名）+ 候选原因类（字体度量 / DPI / 标题栏 / 滚动条 / 平台分支样式 / 其它）+ 证据」，候选原因只能引用本单取到的数据。
3. 机器在跑 GPU 训练：load > 24 时暂停 Linux 侧 e2e，等降下来再跑（回执记 load）。

## 验收（写命令，不写感觉）
1. `ls /home/lingxufeng/bot/work/ui-polish-win/evidence/T54/*.png | wc -l` → ≥ 26（10 屏 × 2 平台 + 4 张 ★ 暗色 × 2 平台 ≥ 28，取不到的屏在 MATRIX 里写原因可扣）；经理用 Read 抽看每屏一对。
2. `ls /home/lingxufeng/bot/work/ui-polish-win/evidence/T54/*.json` → 每屏每平台一份几何数据；含 `devicePixelRatio`、平台、命中字体。
3. Linux 侧脚本可重跑：回执贴原样命令，经理重跑得到同一组 json（坐标误差 ≤1px）。
4. `MATRIX.md` 表格：屏 | 差异 | 量化 | 候选原因类 | 证据文件。至少把用户能看见的错位都列进去；「两边一致」的屏也要写一行「一致」。
5. VM 收尾：`ssh … 'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 9229 -State Listen -EA SilentlyContinue"'` → 无输出。
6. `git diff --stat <claimed>..HEAD` 只含边界 1 的路径。

## 为什么这样验收
「错位」可能是十种原因的任意组合，修错方向会把 Linux 也弄坏。一张同屏、同尺寸、带坐标和实际字体的对照表，能把「Windows 特有」和「两边都烂」分开，也能一眼看出是不是字体换成 Segoe UI 后撑破了写死的宽高。几何 json 让修单的验收可以写成「某元素在 Win 下与 Linux 差 ≤2px」，而不是「看起来对了」。

## 产出
- `work/ui-polish-win/evidence/T54/`（脚本、截图、几何 json、`MATRIX.md`）
- `work/tickets/receipts/T54.receipt.md`
