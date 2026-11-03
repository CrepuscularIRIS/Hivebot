# REPORT · P5-22 受控升权路径（D-1 定稿 ⑤）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-22 @ d957d17（基 03910c4），2 commits。request-net.mjs（request_network 工具+issuePermit：argvHash/TTL60s/0600/O_EXCL/用后即删）、bwrap-wrap.py（--permit-root/--slirp、claim_permit 原子抢占、run_networked supervisor：info-fd/block-fd/ready-fd 握手、--disable-host-loopback --disable-dns、--unshare-net 恒保留、helper 失败 fail closed 杀 bwrap、专用只读 resolv.conf）、bin/slirp4netns（官方 v1.3.7 静态 2.3MB sha256 与官方一致，GPL 私用记 README）、shell-ask 恒 ASK 硬分支（表前不可改）、approval.yml+start.ts 接线。测试 unit7+wrapper3+e2e5。

## 通道判断（偏离 D1-r1 字面，论证在案）
未走 S-2(h) stream：审批 waterfall 已把用户决定带回 SDK；许可复用决策 16 文件模式（SDK 受信 execute 签发、wrapper 校验兜底，argvHash+TTL+session+用后即删 wrapper 独立验）。director 若坚持 main 签发，改造点集中在 execute。

## 验收全 PASS
四类探针（网关别名 101/差分 conn+200；localhost/直连 111 既有防护；LAN conn+DNS 真解析）+ 差分必命中 + 一次性/跨会话/过期全拒 + 哨兵批准后仍不可见（ppp 按 f2 恒空语义）+ fail closed（marker 未写 isError）+ dfa 照拒（全量 37/304）。

## 新发现
①resolv unlink 毫秒竞窗（方向不变仅多一行错误）②slirp 非 egress ACL（LAN 非 loopback 不过滤——d1 已知上限）③全量偶发 1 红=/tmp 并发同面复跑绿 ④P5-31 依赖已满足 ⑤P2SDK_TEST_NET_TTL_MS 留未用。
复测注意：须用 app/sdk/node_modules/.bin/node（v24，系统 v22 不满足 devEngines）。
