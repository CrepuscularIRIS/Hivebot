# T-23 · Linux X11 computer-use 上游比较

调研日：2026-11-05；最近六个月窗口自 2026-05-05 起。仅静态读取，不安装、不执行外部代码、不连真实桌面。用户要求 repos/ 只读，本轮不新增 clone、不追加 MANIFEST；外部候选通过 GitHub MCP 读源码。实施前若决定深度适配，应另获准按项目规则 clone 留档。

| 能力 | 候选 | 阶梯（1～5） | 许可证 | 维护 | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| Linux X11 截图/输入/应用窗口驱动 | @trycua/cua-driver 0.38.0（trycua/cua） | 1（候选；issue 响应与 Linux 制品验证未闭环） | MIT，LICENSE.md 已读 | commit 814ee18f，2026-11-05；npm modified 2026-10-28；#3894 仅验证外部 contributor 回应 | 集成 | 真实 Linux native 实现，优先直接依赖而非搬旧脚本或整套 agent；需薄 dsh provider 与显示/审批隔离，完整 dsh CUA 协议仍需翻译。 |

## 候选对照与证据

### 1. trycua/cua：首选驱动候选，不搬整套 agent

- 固定 SHA：`814ee18f14f0607341690c8fa2a49814a9fc3fbd`，GitHub list_commits 核实 2026-11-05T11:36:40Z。
- Linux 源码确实有 x11、input、capture、AT-SPI、installed_apps、xauth 等模块。X11 模块开头使用 x11rb、EWMH 窗口列表及 PID 关联；大文件返回被折叠，本轮未完成全模块审计。
- TypeScript entry 暴露 create/connect/private worker 等；npm 包有 /embedded、/electron 导出并使用 Rust native binding。是否适合 MCP 直挂还是 SDK 包装，要按锁定版本实测，不凭目录存在宣布可用。
- xauth 源码注释涉及自动发现 Xwayland cookie：部署必须显式隔离 DISPLAY/XAUTHORITY/运行目录，不能让它探索真实会话授权文件。
- 路径：
  - https://github.com/trycua/cua/tree/814ee18f14f0607341690c8fa2a49814a9fc3fbd/libs/cua-driver/rust/crates/platform-linux/src
  - https://github.com/trycua/cua/blob/814ee18f14f0607341690c8fa2a49814a9fc3fbd/libs/cua-driver/typescript/src/index.ts
  - https://github.com/trycua/cua/issues/3894

### 2. TideSparrow/computer-use-dsh：三级改造后备

MIT；commit `a7c546c868476a94470707c285cb08d000aca73f`，2026-09-14，合并键盘修复 PR #1；npm computer-use-dsh 为 E404。实际读了 host.js 和 linux-helper.sh，而非只看 README。

Linux helper 用 xdotool 输入、grim/scrot/import/gnome-screenshot 截图。host 是旧 harness.registerTool API，固定 /tmp/dsh-computer-use、全局 lastShot；trusted 无条件返回 1，open 会走 gtk-launch/xdg-open/gio。没有当前 dsh 的 Agent 隔离、app 授权和完整 NativeChannel 协议，不能整仓原样集成。若首选确证不能用，才复制最小输入/截图逻辑并修 DISPLAY 固定、Session 状态、临时目录、停止/超时、输入参数终止与中文、禁真实 DBus；不复制 trusted/open 行为。

复制来源必须记为：
`https://github.com/TideSparrow/computer-use-dsh@a7c546c868476a94470707c285cb08d000aca73f:native/linux-helper.sh`

源码：https://github.com/TideSparrow/computer-use-dsh/blob/a7c546c868476a94470707c285cb08d000aca73f/src/host.js 。低配适配估计数人日，仍不含 AX/窗口身份同构；不比先试维护中的 native driver 更稳。

### 3. bytedance/UI-TARS-desktop：可发布 operator，但不整仓引入

Apache-2.0；commit `3ac2cb8d946d78d5ff92ad17b318eaafa18c178c`，2026-10-09。正确 npm 包是 **@gui-agent/operator-nutjs 0.3.1**，modified 2026-10-08；不是 @ui-tars/operator-nutjs（该名字 E404）。维护者 issue 响应未验证。

已读 NutJSOperator.ts：screen.grab、坐标缩放、mouse/keyboard、Jimp 图片编码、drag/hotkey；依赖 @computer-use/nut-js 4.2.0。存在输入 trim/换行语义、动作日志写入输入内容、全局 keyboard.config 修改等，不能把 operator 当作现成权限/审计/并发层。npm 该 native 输入 fork modified 2025-01-09，超过六个月，且本机 Xvfb 制品未验证。比直接驱动多一层 GUI agent 类型体系；作为备选，不搬整套模型循环。

证据：https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/multimodal/gui-agent/operator-nutjs/src/NutJSOperator.ts

### 4. xdotool / ydotool 封装与 Open Interpreter 类

- xdotool 已在本机，适合专用 Xvfb 的低级输入；它本身不是截图/授权/会话隔离方案。TideSparrow 是已读的实际 X11 封装对照，避免另造未经比较的 shell 驱动。
- ReimuNotMoe/ydotool 最新 commit `708e96ff27e381a8c549418a9d34cdde12305317` 为 2025-12-22，**不满足六个月 commit 窗口**，不能把仓 updated_at 当维护证据。已读 CMakeLists.txt（client/daemon 两程序）；官方运行说明要求 /dev/uinput，通常需 root，且无截图/窗口层。本任务禁止 sudo，Xvfb 输入不需要扩大到主机 uinput，故不选。许可证全文本轮未读，记未验证，不影响技术否决。
  - https://github.com/ReimuNotMoe/ydotool/blob/708e96ff27e381a8c549418a9d34cdde12305317/CMakeLists.txt
  - https://github.com/ReimuNotMoe/ydotool/blob/708e96ff27e381a8c549418a9d34cdde12305317/README.md
- OpenInterpreter/open-interpreter 与 open-interpreter/open-interpreter：GitHub 当前返回 Validation Failed / 404；未能验证源码、许可证和维护，不能据此说“不存在”或“停更”。Anthropic quickstarts 目标及 user:anthropics computer-use-demo 搜索亦无可读目标。此类整套 agent 通常不是当前 dsh 驱动接缝的直接证据；本轮不把不可核实项目列作可用依赖，也不虚构对比结果。

## 结论边界

“GitHub 没有现成 Linux CU”不成立：trycua、UI-TARS operator 和 X11 helper 都已查到。严格维护标准的 issue 响应尚未闭环，首选只是条件式一级集成，不可直接批准上线。最小下一步是锁包后专用 Xvfb+WM 下截图→点击→中文输入→取消/清理，验证原生库、无真实屏/cookie/凭证访问；失败先用有证据的三级后备，不默认五级自建。驱动接线估计 1～3 人日；完整 app/window/AX 同构及护栏不在此估计中。
