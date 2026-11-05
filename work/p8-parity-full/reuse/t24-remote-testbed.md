# T-24 · 无容器/VM 条件下的 CU 测试床

调研日：2026-11-05。只查命令存在性和源码；未启动 Xvfb/应用、未连接 tailnet/SSH、未创建 namespace/chroot、未读取凭证。这里的“远端”不得与“本机隔离显示”混称。

| 能力 | 候选 | 阶梯（1～5） | 许可证 | 维护 | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| 本机安全日常回归 + 真远端验收分层 | 复用 app/ui/scripts/run-e2e.sh 的 Xvfb/死 DBus 模式；远端另接现成 dsh SSH+用户提供专机/tailscale 路由 | 1（现有能力组合；远端依赖维护响应待补） | 本仓按项目现状；dsh MIT；系统工具许可证本轮未逐一核对 | 现有脚本已含 P6-18 守卫；dsh commit 2026-11-04；系统工具安装版本/维护未验证 | 集成 | 先用 F1 专用屏验证日常行为，不自造 VM/手工沙箱；F3 需独立远端资源与授权，不能用 F1/F2 冒充跨机验收。 |

## 本机事实与已有复用

command -v 已确认有 Xvfb、xdotool、tailscale、bwrap、unshare、xauth、chroot；未找到 docker、podman、qemu-system-x86_64。存在二进制不等于具备 userns、uinput、tailnet 权限或网络可达性；这些本轮均未测。

`/home/lingxufeng/bot/app/ui/scripts/run-e2e.sh:8-12` 已将 DBUS_SESSION_BUS_ADDRESS 指向不存在的总线并 xvfb-run -a，1600x1000x24。本轮不启用脚本中 NO_XVFB 逃生门。UI e2e 直接复用该脚本；独立 CU helper 可复用相同隔离约束，但不能声称当前脚本已能启动任意完整测试桌面。

产品实际沙箱不是未经包装的 dsh profile：
- `/home/lingxufeng/bot/app/sdk/sandbox/bwrap-wrap.py:10-25,337` 恒定追加 --unshare-net，敏感根遮蔽，受控联网通过宿主 slirp helper，失败关闭；不能依据上游“没有 unshare-net”误判产品。
- `/home/lingxufeng/bot/repos/deepseek-harness/packages/sandbox/sandbox-local/src/profiles.ts` workspace-write 会 tmpfs /tmp。接隔离 Xvfb 时需要明确专用 pathname socket/Xauthority 的传递；不能为省事移除 netns、暴露整个 /tmp/.X11-unix 或真实用户授权。
- 当前 wrapper 没有专门 DISPLAY/XAUTH/DBUS 处理的证据；新增 CU/browser 服务若在宿主直接启动，也未证明自动经过该 wrapper。必须逐执行入口验，不靠环境变量声明安全。

## 三种路线比较

| 路线 | 能验证什么 | 代价与缺口 |
|---|---|---|
| F1 本机专用 Xvfb | screenshot/input、像素缩放、Session 冲突、取消/清理、审批与审计；无真实桌面弹窗 | 最短；Xvfb 只隔离显示，不隔离同 UID 的文件/进程。需临时 HOME、专用 DISPLAY/Xauthority、死 DBus、清除真实 WAYLAND_DISPLAY/会话路径；WM/AT-SPI 依赖是否齐全未测。 |
| F2 SSH 回环 | dsh helper 协议、hash、流、断线处理 | 本机 sshd/可用身份未查；不是跨机/独立故障域，不作为最终真远端验收。 |
| F3 tailscale 远端专机 | 跨机延迟/断线、独立主机环境、远端 helper 与沙箱、跨机文件边界 | 需要用户提供独立 Linux 测试机/账号和 tailnet ACL/SSH 授权；不读取/搬运宿主私钥，不开启 agent forwarding。tailscale 只是网络连通，不是桌面、安全沙箱或测试机供应器。 |
| 手工 chroot/namespace | 理论上可再隔离文件/进程/网络 | chroot 不是安全边界，通常需特权/rootfs；namespace 还需 rootfs、挂载、UID、设备、socket、网络与清理设计。本机已有 bwrap/产品策略，无理由再造一套；userns 可用性未验证。 |

## 外部测试床对照

OSWorld 为维护中的 GUI benchmark 候选：commit `8903ebeb0efdf74331bd7dc37ed91ccbbff22317`，2026-11-02，Apache-2.0 LICENSE 已读。实际读了 providers 工厂，其分支包含 docker、vmware、virtualbox、AWS/Azure 等云平台及其他远端服务，没有 simple local-Xvfb 分支。因此当前机器无相应已确认 backend 时，它不是零成本启动器；本轮未核实所有云资源费用与接口，也未用它整仓集成。

- https://github.com/xlang-ai/OSWorld/blob/8903ebeb0efdf74331bd7dc37ed91ccbbff22317/desktop_env/providers/__init__.py
- https://github.com/xlang-ai/OSWorld/blob/8903ebeb0efdf74331bd7dc37ed91ccbbff22317/LICENSE
- npm 不解决 X server/VM/rootfs 供应；可直接依赖的执行通道是 T-22 已查的 dsh SSH npm 包，匹配 helper 仍需构建部署。未找到已验证的“在当前无容器机器上一个 npm 包直接提供完整强隔离远端桌面”的方案；这不是全网不存在的断言。

## 推荐的最小方案与成本

1. **现在只规划 F1**：专用 Xvfb + 测试应用；UI 用现有 e2e 脚本。CU 运行身份/目录/显示不可由模型随意指定；临时 HOME 与空测试数据，不从真实用户目录导入浏览器 cookie、SSH 或桌面凭证。需要窗口枚举时额外固定 WM；AT-SPI 需要专用会话总线时不得连接真实总线，另做隔离设计。估计 0.5～1 人日建立低配测试夹具，完整护栏另计。
2. **真远端明确挂起到资源授权**：用户指定一台专用 Linux 主机，复用 dsh SSH 执行层并部署同等安全策略；tailnet 授权留宿主。机器现成时，连通与 helper 验证估计 1～2 人日，策略等价验收另计；当前未具备已验证资源，不能说已能跑。
3. **不做手工 chroot/VM 替代品**：现有 bwrap 与维护中的 SSH provider 已更短、更可审；不申请 sudo，不动桌面服务，不重启、不注销，不把真实 HOME 挂进任何容器/测试床。

## 验收不能省掉的区别

F1 通过只可报告“隔离显示回归通过”；真远端还要独立检查取消/断线结果不明、远端 lease 回收、禁路径、网络许可、凭证不可见及审批/日志归属。Xvfb socket 可达必须证明只到目标显示，不能用放宽全局沙箱解决；GUI prompt injection、剪贴板/下载/外发风险不因用了 Xvfb 或 tailscale 消失。Q-026、T-30/T-31 与 D-REMOTE 的授权仍按原流程处理，本报告不启动 builder。
