# D-2 p6 · 席 B（6.1 Sol）

> 席 B 回报，主会话代录，未经改写（2026-11-03）

seat: B
vote: ②(a)；③(a)；④(b，须补实证)；⑤(d：暂不定通道，先补 S-2(h))
confidence: medium
reverse_take: 最可能失败于把 renderer→SDK 的既有连接误当成 SDK→main 反向 RPC；先证明一条请求能完整往返，再冻结契约。
- ②(a)：main 单写 createdBy，归属与侧栏共用真源；原版是 task 线程，不能当作已有 createdBy 实证。证据：RE-sendmessage-ui.md:134。坑：归属必须落盘成功后才返回创建成功或启动 worker，否则重启会丢权限依据。
- ③(a)：确认无新增 cwd 接口；复用 P5-25 同一分配函数，工具不得传 cwd。证据：work/p5-parity/PLAN.md:103。坑：目前只是既有任务承诺，须待合并后验证 SDK 请求入口没有绕过该函数。
- ④(b)：按权威 mainBotId 动态判定，避免冻结 preset 与主 bot 身份形成双真源。证据：CONTRACT.md:87,130,142。坑：S-2(f) 尚未证明旧会话可动态获工具；隐藏不能替代执行鉴权，身份未知应拒绝，切换主 bot 后旧身份立即失权。
- ⑤(d)：现有 M1 是 renderer→main→SDK，M2 是受限 mux 流，不证明 SDK 能调用 main；不能凭"已有连接"选(b)，也不能凭推送能力直接选(a)。证据：CONTRACT.md:22-23；p6 PLAN.md:65,73 明定待 S-2(h)。
- ⑤补证后的最低契约：关联请求返回 {sessionId}；错误分别为 pbots/invalid-args、pbots/capacity、pbots/orchestration-failed，沿用 {ok,value/error}，编排底层错误保留 details；SDK 重启则旧请求作废、释放占位、拒收迟到响应，main 已建 bot 保留并完成归属写入。
- ⑤最关键的坑：请求作废不等于创建回滚；结果未知时禁止自动重试，避免创建重复 worker。
