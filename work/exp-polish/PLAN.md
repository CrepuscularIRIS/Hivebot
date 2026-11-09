# PLAN：体验打磨轮（exp-polish）

> BRIEF：`work/exp-polish/BRIEF.md`（2026-11-09 用户原话 + 八项拆解；**注意**：BRIEF 现提交在 `app/ui/work/exp-polish/BRIEF.md`，待主 agent 挪来本目录）
> 队列：`work/tickets/queue.md`「体验打磨轮」节

| BRIEF 项 | 内容 | 落点 | 状态 |
|---|---|---|---|
| 1 | Workers 点进去只剩 2 个 + worker 跳 | T39 | open |
| 2 | computer / browser use 显示回传 | `COMPUTER-USE-TEST-PLAN.md`（E2）→ 实测后拆 E2a/E2b | 清单已出，待实测 |
| 3 | scout 覆盖度审计 | scout E/F | 调研中 |
| 4 | 与 dsh 生态 / 高 stars 仓逐功能对照 | scout E/F | 调研中 |
| 5 | 系统提示词微调 | E2 诚实性一栏 + scout | 待输入 |
| 6 | 桌宠 / 房间 / 社区 | scout E/F | 调研中 |
| 7 | SSH 推迟 | — | 推迟 |
| 追加段（2026-11-09） | 原版即规格：穷举功能面、找没集成的 | `AUDIT-0.79.3.md`（85 面：已接线 30 / 部分 9 / 未接线 24 / 不适用·阻塞 22）→ 第一批 E4–E8 = T40–T44（queue「体验打磨轮」节）；Q-039–Q-043 | T40 done 2026-11-09 @ 3bd9a250（+T40b）；T40c open；T41 done 2026-11-09 @ dd93ac50（+T41b/c/d，待合并 feat/T41）；T42–T44 草稿在 `next/` |
| 追加二-1（2026-11-09） | 桌宠实装，宠物动作反映 bot 状态 | T45a（骨架+事件链+默认大肥鱼）；路线 Q-044 | T45a+T45c done 2026-11-09 @ feat/T45a 7749653b（待合并） |
| 追加二-2/3/4 | 各家形象汇总、去登录、特色宠物 | scout G → T45b（形象库+本地导入）；T45c 打磨（提议） | 等 scout G |
| 追加二-5 | Windows exe 启动包，Windows 连 Ubuntu 测试 | T46a（打包链）→ T46c（Ubuntu `hivebot serve`）→ T46b（SSH 薄客户端）；Q-045 | T46a done 2026-11-09 @ dc864c0b（+T46ab/T46ac，待合并） |
