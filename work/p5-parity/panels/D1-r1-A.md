seat: A
vote: ⑤（加一处收紧：许可绑定 argv 哈希、一次性、短 TTL）；次选 ③
confidence: medium

## 理由（≤5 行）
1. 两条不变量 ① 与 ⑤ 打平：凭证遮蔽和 loopback 防护都落在同一个 wrapper 和同一个网络组件（slirp4netns `--disable-host-loopback --disable-dns`），差别不在安全层（reuse/d1-netns.md §4）。
2. 实现量和漂移面差别很大：① 要自写执行器，pre-execute 不能换执行器（PLAN:136 约束①），流式输出、超时、取消、cwd、后台进程都得重做，上游 shell 服务每次升级都会漂；⑤ 执行器仍是上游 bash，新代码只有一个小工具、一个许可文件和 wrapper 里的一个分支。
3. ⑤ 的唯一硬伤是粒度太粗，跟 BRIEF:125 第 2 行「每次都问，卡片显示完整命令」冲突。修法：`request_network{reason, command}`，main 签发的许可写 `sha256(argv)`、一次性、TTL 约 60s；wrapper 拿到的 argv（约束③）哈希一致才放网，用完即删，不一致就照常断网（fail closed）。这样逐命令粒度和卡片上的完整命令都回来了，也不用自写执行。
4. 「多放开一个写目录」：⑤ 不覆盖。本 slug 内工作区外写照旧不可用，Q-013 第 2 行写明（YAGNI；联网 + 工作区内 venv 已经覆盖 pip / git clone 的主要场景，BRIEF:68 死因 3）。
5. 次选 ③ 而不是 ①：如果 wrapper→supervisor 这一步做不稳，老实退回 ③，也比背一个自写执行器强。

## 若选 ⑤，实现上最关键的一个坑
wrapper 要从「exec bwrap」改成留在宿主侧的 supervisor，并且严格按顺序执行：bwrap `--info-fd` 拿 child-pid，命令先卡在 `--block-fd` 上 → 启动 slirp4netns `--userns-path=/proc/<pid>/ns/user --disable-host-loopback --disable-dns --exit-fd` → 等 `--ready-fd` 回报后才放 block。helper 启动失败或中途退出，就杀掉沙箱并报联网失败，绝不能「去掉 --unshare-net 继续跑」。DNS 只能走只读的专用 resolv.conf 指向公网，不回退宿主 stub，否则 10.0.2.3 就是绕开 loopback 防护的口子（d1-netns.md:105）。差分探针必须同时覆盖 `--disable-dns`。

## findings
- [HIGH] PLAN:143 选项⑤ / BRIEF:125 第 2 行 — 会话级窗口违反「每次都问、卡片显示完整命令」，窗口内被注入的内容可以无卡外传工作区数据 — 证据: BRIEF:125「离开边界，每次都问，卡片显示完整命令」；PLAN:143 自述「窗口内所有 bash 都能联网」 — 建议: 许可绑定 argv 哈希、一次性、短 TTL（见理由 3）；P5-22 ⑤ 的验收补「用 A 命令申请的许可跑 B 命令 → 断网」「同一命令第二次跑 → 断网」
- [MEDIUM] PLAN:100 P5-22 ⑤ 验收「许可过期后同会话 bash 断网」 — 只测了新调用；窗口内启动的后台进程会一直持有 slirp 连接，过期管不到 — 证据: helper 的生命周期绑在 bwrap 的 `--exit-fd` 上（d1-netns.md:98），跟许可 TTL 无关 — 建议: 写明「过期只影响新调用」；若要求更严，supervisor 在 TTL 到期时杀 helper，并加一格验收
- [MEDIUM] PLAN:100 P5-22 ② 三类探针 — 缺 DNS 别名格 — 证据: d1-netns.md:105、:109（`--disable-host-loopback` 单独不足，10.0.2.3 可绕） — 建议: 加 (d) 格：`10.0.2.3:53` 不可达，宿主 resolv.conf 指向 loopback 时解析不回落；差分时去掉 `--disable-dns` 必须命中
- [LOW] PLAN:139 选项① — `write_dir` 维度没有用户场景证据（BRIEF 的死因都是联网） — 建议: 无论选哪项，本 slug 都不做 write_dir

reverse_take: 三个月后最可能的失败：supervisor 握手某次竞态，helper 没起来，命令照样放行，或者 DNS 回落到宿主 stub。测试一直绿，因为探针只测了 127.0.0.1 和 10.0.2.2。更笨更稳的替代是 ③：本 slug 不联网，pip / git 由用户在 bot 外跑。
