# G1-r2 · 席 B（6.1 Sol）

> 主会话代录：本席运行约束禁止写文件，以下为其回报原文，未经改写。

seat: B
verdict: REVISE
confidence: high
findings:
- [HIGH] /home/lingxufeng/bot/work/p3-contract/CONTRACT.md:49,59-61,95 — 配方先落盘消除了「session 存在但无配方」窗口，但引入失败配方污染：传入未安装的连接器可通过当前 main 参数检查，recipe 已提交后 dsh 创建失败；#Q-008=A 时下次启动仍逐个 ensure 该配方，而全部完成前 M1/M2 不就绪，单次失败创建可能阻断所有 bot — 证据: §2.2 只约束 connectors 为非空字符串数组；/home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:86-103,125-137 在读取未安装 bundle/无效 patch 时抛错且不创建 session；契约第49行设置全局恢复屏障、第95行先写 recipe — 建议: P4 必须规定失败/孤儿配方处置及恢复失败隔离；已知失败不能无限毒化启动，孤儿处理不得删掉其他已有 session 共用的 recipe；新增「未安装连接器创建失败→重启→其他 bot 仍可用」验收。无需恢复 renderer 两步写入，也不要求引入跨库事务。
- [MEDIUM] /home/lingxufeng/bot/work/p3-contract/CONTRACT.md:32,90-95 — #4 允许省略 agentPreset，但 main 生成 id/写 recipe 前未规定补齐默认值，Recipe 与 #21 却要求 string；main 和 p2temp 可分别对 undefined 与 standard 计算不同 id，恢复又依赖 header id 精确匹配 — 证据: #4 的 agentPreset? 与 Recipe.agentPreset:string 不一致；/home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:125 默认值为 'standard'；契约第94行直接以 agentPreset 参与 JSON.stringify — 建议: 在 main 编排第一步归一为显式有效基础 preset，将同一值用于校验、presetIdOf、recipe 和 dsh 请求；加「省略与显式 standard 同 id，重启后非只读」测试。
核对结论：G1-r1 四条 HIGH 的要求均已写入 v1.2：recipes/presetIdOf/has-check（32、49、90-96行）、原样 ConnectionRpcResult（22行）、参数守卫及三类拒绝测试（58-61行）、postMessage 转交与失败清理（63-74行）；这不等于实现已验证。
偏离裁定：由 main 先持久化配方再创建 session 的方向成立，比 renderer 两次调用更稳；但「任何时刻崩溃」的表述不能替代失败配方与恢复失败的处置，上述 HIGH 应成为 P4 首批附加要求。
MEDIUM 吸收：专用桥、streamId 归属、session/control、roster 只读判定、never 过滤、spike 四场景/时限/止损/增补审批均已明确（18-23、29、56、61、96、139行）；未发现需要推翻 carrier 路线的新证据。
reverse_take: 最可能失败的是一次失败创建留下不可恢复的配方，下一次冷启动被全局恢复屏障卡死；更稳的是保留 main 写前配方，但隔离失败并用一条失败创建后重启测试守住全局可用性。
落盘说明：运行约束禁止写评审报告文件，未写 G1-r2-B.md；请主会话将本完整原文代录。
