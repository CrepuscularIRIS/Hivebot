# VERIFY P6-10

> 代录，未经改写。Sol 验收员受其运行环境约束未写 VERIFY 文件，以下为其最终回报原文。证据：`evidence/P6-10-vfy/`（probes-final.log 及脚本）。

- **SHA**：`b1552a2b2b04d89b57bdc643ec48d75aec5f5735`
- **总结论：FAIL**。定向复跑 SDK 27/27、main 元数据 96/96；独立探针 5 PASS、3 FAIL

| 项 | 结论 | 证据 |
|---|---|---|
| diff 范围（含 2 处申报的区域外断言型小改） | PASS | 逐行确认属断言现值 |
| 定向测试复跑 | PASS | SDK 27/27、main 96/96 |
| 通道安全（白名单拒绝、错 Peer、超时 unknown/释放占位、防提升、rename 降级） | PASS | probes-final.log |

## [FIX]

- `[FIX][major]` **污染回合仍能 create_bot**：回报（pbots-worker 来源）注入的回合里调 create_bot，真实 Loader 捕获到 1 次 main 建 bot 请求。位置 `app/sdk/src/orchestration/create.mjs:57-60, 82-87`
- `[FIX][major]` **人工启动的 worker 已 running，共享容量仍为 0**：slots 不认既有 worker（启动对账缺收养）。位置 `app/sdk/src/orchestration/slots.mjs`
- `[FIX][minor]` **不存在 session 的 createdBy 被隐藏但无日志**；且 ⑫ 现有测试测的是「creator 不存在」，不是「worker session 不存在」，测错了对象。位置 `app/ui/main/m3-meta/orchestrate.ts:269-275`
