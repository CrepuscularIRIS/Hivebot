# D-1 投票 · 席 B（6.1 Sol）

> 代录，未经改写（席 B 运行约束禁写文件，主会话机械转录，2026-11-03）

seat: B
vote: ⑤ 会话级联网许可（次选①，仅当必须逐命令授权时）
confidence: medium
理由：复用现有 bash 执行器与 wrapper，不自建第二套执行链；②不可行，③④把 git clone / pip install 留给用户（PLAN.md:139–143）。
理由：slirp4netns 官方固定版静态包与 ready/exit FD 已有复用证据，但完整 SDK 接线尚未验证；优先它，不选滚动 pasta 构建（reuse/d1-netns.md:46–64,97–100）。
理由：接受限时窗口内同会话所有 bash 可联网；审批必须明确展示会话范围和期限，不能让用户误以为只批准下一条命令（PLAN.md:143）。
最关键的坑：`--disable-host-loopback` 不够，DNS 别名仍可能绕回宿主；须关闭内建 DNS、禁止宿主 stub 回退，并通过网关／DNS 别名／代理 CONNECT（IP、localhost）及差分验证（reuse/d1-netns.md:103–109；panels/G2-r2.md:14）。
reverse_take: 最可能失败于把"helper 能联网"当成"联网仍安全"；隔离验证未通过时保持断网，绝不删掉 `--unshare-net` 兜底。
