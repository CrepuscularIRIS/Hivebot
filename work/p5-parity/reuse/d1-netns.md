# D-1 · slirp4netns / pasta 的免 sudo 可行性

调研：2026-11-03；输入：`/home/lingxufeng/bot/work/p5-parity/PLAN.md:134–143`（v2.1）。本文件只核实事实，不代替 /panel D 选项投票。未改系统、未安装到真实 HOME、未启动实际联网沙箱；下载仅检查 ELF，已清理下载文件。

## 0. 结论与 D-1 决策行

**“没有 newuidmap/newgidmap，所以这两条免 sudo 路线不成立”不正确。** 对本题所需的单 UID/GID userns + netns，bwrap 可以自行建立映射；slirp4netns / pasta 可加入该 userns/netns，不需要 subordinate-ID 多用户映射。两家 x86_64 静态 ELF 都已从发布渠道实际下载并确认。需要区分：slirp4netns 是正式官方 release asset；pasta 是项目官网托管、官网自己标为 **unofficial packages / static builds** 的滚动产物，不是正式版本 release asset。

| D-1 选项 | “免 sudo”判定 | 依据与限制 |
|---|---|---|
| ① 受控执行工具 | **有条件成立** | 可直接调用 slirp4netns 官方静态二进制，保留 bwrap `--unshare-net`，从宿主侧接入独立 netns；无需 newuidmap/newgidmap。仍要做启动握手、DNS、进程生命周期和 loopback 防护。尚未实测完整 SDK 链路，不能写“已集成可运行” |
| ② wrapper 一次性许可 + danger-full-access | **仍不成立，但不是 sudo 问题** | `PLAN.md:140` 已说明 dfa 跳过 wrapper；静态二进制不能修复该执行路径 |
| ③ 本 slug 不做联网 | **成立（无需新增网络组件）** | 保持现有 bwrap 断网；没有可用联网能力，不应将“不需要 sudo”误写为解决了联网 |
| ④ 上游 PR，当前按③过渡 | **当前成立** | 当前过渡态无需新组件；未来上游方案未知，不能提前保证其权限前提。①⑤可免 sudo，并不消除④等待上游的成本 |
| ⑤ 会话级联网许可 | **有条件成立** | 网络接入层与①相同，无需特权映射助手；会话许可文件与 wrapper 的授权语义是另外的实现，不由网络二进制提供 |

建议给 panel 的精确口径：**①⑤有无需 sudo 的上游组件路线，已验证本机单 UID userns/netns 原语，但完整联网沙箱尚未验证；pasta 的官网静态构建并非正式 release asset。不是“下载即完成安全集成”。**

## 1. 本地与已有复用检查

- `repos/MANIFEST.tsv` 调研前没有两家源码；`work/*/REUSE.md` 仅 p5 有 bwrap/dsh wrapper 复用，没有已选 slirp/pasta 组件。已 depth-1 clone 到 `repos/rootless-containers__slirp4netns`、`repos/passt-top__passt` 并追加 MANIFEST；参考仓只读。
- 既有真实 SDK 探针已经证明 bwrap `--unshare-net` 可用：`work/p5-parity/reuse/r5-sandbox-probe.md:57–74`；当前依赖行：`work/p5-parity/REUSE.md:9`。
- 用户指定的本机检查，原样运行的 stdout：

```text
$ ls -l /usr/bin/newuidmap /usr/bin/newgidmap /usr/bin/bwrap 2>/dev/null
-rwxr-xr-x 1 root root 72160 Sep 17 16:12 /usr/bin/bwrap
$ grep -c subuid /etc/subuid /etc/subgid 2>/dev/null
/etc/subuid:0
/etc/subgid:0
```

补充存在性核实：`/usr/bin/newuidmap`、`/usr/bin/newgidmap` **均不存在**（不是“安装了但没 setuid”）；bwrap **不是 setuid**，版本 0.9.0。两个 subordinate 配置文件均存在，各 1 行非空非注释记录，未输出其内容。**grep 的 0 仅说明未匹配字面串 subuid，不能证明无配置**，通常记录格式也不含这个词。

无特权小探针（均退出 0，不持久化配置、不联网）：

```sh
/usr/bin/bwrap --unshare-user --unshare-net --ro-bind / / /usr/bin/true
unshare --user --map-root-user --net /usr/bin/true
```

这直接证明本机不靠映射助手也能创建本题需要的命名空间；不证明 slirp/pasta TAP 连接、DNS 或 SDK wrapper 已接通。

## 2. 二进制、下载与供应链

### slirp4netns：正式官方静态 release，有版本锁定和校验和

- 官方仓：<https://github.com/rootless-containers/slirp4netns>。
- 最新正式版 v1.3.7，2026-10-30 发布：<https://github.com/rootless-containers/slirp4netns/releases/tag/v1.3.7>。
- release 明写 statically linked，包含 libslirp 4.9.7、libseccomp 2.5.3；GitHub Actions 构建，并提供可复现构建命令。
- x86_64 URL：<https://github.com/rootless-containers/slirp4netns/releases/download/v1.3.7/slirp4netns-x86_64>。
- 校验文件：<https://github.com/rootless-containers/slirp4netns/releases/download/v1.3.7/SHA256SUMS>。
- 本次下载 `file` = `ELF 64-bit ... x86-64 ... statically linked`；sha256 与官方 SHA256SUMS 对应行一致：`1c177694fe6bf299debfd8ff601a2ee3c4f7554d9983acdf1f854a6b34d53e70`。

用户日后安装形态（本次未执行安装）：下载到独立空目录，核验 SHA256SUMS，再 `install -m 0755 <下载文件> "$HOME/.local/bin/slirp4netns"`；目标目录由用户拥有则无需 sudo，不设置 setuid、不加 file capabilities。

### pasta：官网有静态 ELF，但不是正式 release 二进制

- 官方源码与正式 tag：<https://passt.top/passt/>、<https://passt.top/passt/refs/tags>；最近正式 tag `2026_10_02.cba3570`。GitHub 搜到的 `ethever/passt` 自述镜像，不用它冒充官方仓。
- 官网 Availability 将这些列在 **unofficial packages**，链接 x86_64 static builds：<https://passt.top/>、<https://passt.top/builds/latest/x86_64/>。
- 可直接下载通用 x86_64：<https://passt.top/builds/latest/x86_64/pasta>；另有 `pasta.avx2`，本题不需要挑 AVX2。
- 目录本次显示 2026-10-25 构建，同列包名 `passt-g6aa4f88-1.x86_64.rpm`、`passt_6aa4f88-1_all.deb`，目录未列 SHA256SUMS。`latest` 是滚动位置，**不能作为可重现的固定版本 URL**。
- 本次下载 `file` = `ELF 64-bit ... x86-64 ... statically linked`；观察到的 sha256 = `b971f70b000d0a0097dc41d0b7cec9b99977d0d35f0090cd0720a04349155cb4`。此值只是本次下载指纹，**不是官方签名/可信校验来源，也没有验证 ELF 内嵌版本与源码 SHA 一致**。
- 若选 pasta：用户目录可放置，不需 sudo；要留存经过核验的具体构建及 digest，或用固定源码自行构建。源码 `Makefile:89–91` 有 `static` target，`:110–111` 将 pasta 链到 passt，`:147` 的 `pkgs` 依赖 `static`。自编译需要编译工具/静态库，缺依赖时不能保证免 sudo 补齐；既有静态构建不需要本机编译。

## 3. rootless 的真实前提

1. 内核支持且策略允许非特权 userns/netns；Ubuntu AppArmor / LSM、seccomp、userns 数量限制都可能阻止。静态链接不会绕过这些限制。本机上述 bwrap/unshare 探针已经通过；换机器仍需前置检测，失败必须 fail closed，不能静默去掉 `--unshare-net`。
2. 只映射当前 UID/GID 的单条映射，与 rootless Podman 等需要 subordinate UID 区间的多 UID 容器是不同需求。后者可能需要管理员部署 setuid/file-capability 的 newuidmap/newgidmap；不要把该依赖搬到本题。
3. slirp4netns 本体不调用 newuidmap/newgidmap：`main.c:41–87` 打开目标 namespace 并先 `setns(CLONE_NEWUSER)`、再 `setns(CLONE_NEWNET)`，`:237–241` 调用该过程。官方 man 的示例直接使用 `unshare --user --map-root-user --net --mount`，而非多 UID 映射助手：<https://github.com/rootless-containers/slirp4netns/blob/1f61fbeb2ccf64ef56c994636ba713967599aa14/slirp4netns.1.md>。
4. pasta 的源码进一步明确单 ID 映射：`util.c:1115–1150` 写入 `0 <当前 uid> 1`、`setgroups=deny`、`0 <当前 gid> 1`；`isolation.c:352–363` 创建 userns 后调用它。加入 bwrap namespace 可显式指定 `--userns /proc/<PID>/ns/user`，无需自身再建立多 UID 映射。
5. TAP 的 CAP_NET_ADMIN 在目标 userns 所拥有的 netns 中取得，不是要求宿主 root 的 CAP_NET_ADMIN；需可用 TUN/TAP 内核接口。**本次没有运行完整 helper attach，TAP 权限、目标 namespace 可访问性与实际 DNS 仍标未验证**。
6. 不要为普通 HTTPS/git/pip 出站加入低端口绑定能力；ping sysctl/ICMP 权限不是普通 TCP 出站的必需条件。

## 4. 与 bwrap 的接线形态（参数有上游证据，组合未做运行验收）

**保留 `--unshare-net`**。接入外网不等于删除它；必须由宿主网络 namespace 中的 helper 转发到新 netns。helper 不能作为断网 sandbox 的普通内部命令启动，否则其出站 socket 同样断网。

宿主 supervisor 先启动 bwrap 并阻塞执行待批准命令，拿到宿主视角的 sandbox child PID；再启动 helper，待网络完成后解锁。示意中的 FD 都由 supervisor 创建并传入；不是可直接复制到终端的完整脚本：

```sh
bwrap --unshare-user --unshare-net \
  --info-fd <STATUS_FD> --block-fd <GATE_FD> \
  <现有只读挂载/凭证遮蔽/工作区参数及专用 resolv.conf> -- <命令>

# 宿主侧，PID 是 STATUS 中的 child-pid，不是简单取 $! 的 bwrap supervisor PID
slirp4netns --configure --disable-host-loopback --disable-dns \
  --userns-path=/proc/<PID>/ns/user \
  --ready-fd=<READY_FD> --exit-fd=<EXIT_FD> <PID> tap0

# 或者 pasta，显式加入同一个 userns 和 netns；不要用 --netns-only
pasta --foreground --config-net --no-map-gw --map-host-loopback none \
  -t none -u none -T none -U none \
  --userns /proc/<PID>/ns/user --netns /proc/<PID>/ns/net
```

- bwrap 的 `--info-fd`/`--block-fd`/`--json-status-fd` 均在本机 `bwrap --help` 和 `/usr/share/man/man1/bwrap.1.gz` 中；后者写明 child-pid 是调用 bwrap 时 namespace 里的 PID。不要误用 **`--userns-block-fd`**：它特意把 UID 映射交给外部 newuidmap/newgidmap，正是本题无需引入的路径。
- slirp ready/exit FD、configure 与 userns 参数：本地 `slirp4netns.1.md:34–76`。通过 `--exit-fd` 关联 bwrap 生命周期，不能在 helper 已失败时仍解锁命令。
- pasta namespace 参数：本地 `passt.1:681–704`；转发默认 auto，需显式禁用 `-t/-u/-T/-U`，不能无意把宿主和 sandbox 的监听端口互通。`--netns-only` 跳过 userns，普通宿主用户单独加入目标 netns 可能 EPERM，不是免 sudo 捷径。
- pasta 完成初始化的可用握手机制、与 bwrap 锁的具体时序，本次未验证；不能仅“子进程已启动”就释放命令。
- 挂载顺序沿用现有 wrapper：保护根不能因重 bind 而暴露；联网 helper 的二进制无需挂给 sandbox 内命令。目标 PID/namespace 的定位与持有必须由宿主完成，不是让模型访问宿主 `/proc`。

### 必须补进 D-1 的安全校正：slirp 的 DNS 旁路

上游 man **明确警告 `--disable-host-loopback` 单独不充分**：宿主 resolv.conf 若指向 loopback，内建 DNS 别名 `10.0.2.3` 仍可能通宿主 loopback（`slirp4netns.1.md:194–200`）。因此上述基线关闭内建 DNS（`--disable-dns`），sandbox 用只读专用 resolv.conf 指向批准的公网 DNS；无法使用该 DNS 时应报联网失败，而非回退宿主 stub。选其它隔离方式也必须证明 DNS 别名不能转发到宿主任意端口。

pasta 使用 `--map-host-loopback none`（隐含 no-map-gw，显式重复便于审计）；依据 `passt.1:375–394`。其它映射、DNS 转发与 IPv6 也需覆盖，不接受仅测 sandbox 的 127.0.0.1。两种工具都不是“只允许公网”的完整 egress ACL：LAN/宿主非 loopback 地址、外部代理绕回等不由这些开关全面解决。

最小待验矩阵：helper ready 后公网 HTTPS 成功；宿主 stub 从 sandbox 的 lo、网关别名、DNS 别名、IPv6 别名全部不可达；IPv4/IPv6 及 IP/localhost 的代理 CONNECT 仍不可达；关闭防护开关的对应差分应命中；helper 启动/运行失败时 fail closed；DNS 不回退宿主 loopback。代理若无效或未配置，不能拿“CONNECT 失败”充正对照。

## 5. 复用比较与维护

| 能力 | 候选 | 阶梯级别 | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| bwrap netns 外网接入 | `rootless-containers/slirp4netns@main.c` + v1.3.7 静态 release | 1 | GPL-2.0-or-later；静态依赖另含各自许可 | commit `1f61fbeb…` 2026-10-30；release 2026-10-30；维护者 AkihiroSuda 在 issue #350 有人工回应 | **集成** | 优先候选：固定版、官方静态 ELF、校验和、ready/exit FD 齐全；包装层补 bwrap 握手、专用 DNS、授权开关与失败收紧，不复制网络实现 |
| bwrap netns 外网接入 | 官方 `https://passt.top/passt`，`pasta.c` / `isolation.c` / `util.c`，官网静态 build | 1 | GPL-2.0-or-later，`checksum.c:1` / `virtio.c:1` 另有 BSD-3-Clause | commit `6aa4f88…` author 时间 2026-10-15；release tag 2026-10-02；2026-11-02 Laurent Vivier 公开评审回复 | **集成** | 可行备选，不复制网络实现；“正式官方 release 静态 asset”不成立，但官网静态构建存在。滚动 latest、校验来源与 ready/退出时序需额外锁定/验证，不能用“须本机编译”作为唯一成本 |

维护证据：
- slirp commit：<https://github.com/rootless-containers/slirp4netns/commit/1f61fbeb2ccf64ef56c994636ba713967599aa14>；人工 issue 回应：<https://github.com/rootless-containers/slirp4netns/issues/350#issuecomment-2646094616>（2025-02-09，证明有人回应，不宣称近期 issue 响应 SLA）。
- pasta commit：<https://passt.top/passt/commit/?id=6aa4f88bd9846411edff3ed70460475b538addca>（不要用目录构建时间冒充 commit author 时间）；近期评审：<https://archives.passt.top/passt-dev/15a03a23-c8fb-49dc-8f65-6620e48b2941@redhat.com/T/#t>，2026-11-02 Laurent Vivier 回复 “Thank you for your patch, it looks correct.” 并具体讨论 `udp_tap_handler()`。pasta 走 Bugzilla/邮件而非 GitHub issues；独立 Bugzilla 工单响应未核验。
- slirp LICENSE：`repos/rootless-containers__slirp4netns/COPYING` + `slirp4netns.1.md` 末尾；pasta LICENSE：`repos/passt-top__passt/GPL-2.0-or-later.txt`、`BSD-3-Clause.txt`、源码 SPDX。
- npm：`npm view slirp4netns version time.modified repository --json` 返回 E404；同命令查 `pasta` 得 0.4.1、2022-06-23、`github.com/nrn/pasta`，与本题 C 网络工具无关。没有据此引入 npm 包；直接消费上游 CLI 比新增 npm 包装层短。

**无需逆向或自建网络栈**。新代码边界仅是现有 wrapper/supervisor 的授权与生命周期胶水；选择①还是⑤留给 panel，不因“免 sudo 已成立”自动放宽凭证/审批不变量。
