# T91：消息 Add reaction（原版 hover 两钮之一；A5 P0 三件之一）

> 开单：main 落单（侦察完成）| 2026-11-15 | 施工：main (GLM 5.3)
> 来源：RE-UI-FACES-0.78.1.md §4（hover=Add reaction+More 两钮；菜单 Reactions 子菜单）；依赖 T90 目录（已合）+T83 二批（已合）
> 分支 / 作业目录：feat/T91 @ /tmp/bot-wt/T91（已建，依赖已装）
> claimed：bc0c9102 @ /tmp/bot-wt/T91（2026-11-15）
> accepted：

## 侦察结论（施工直用）
- **上游链全在**：`ProductionRenderer:1137` createProductionReactionRootScope（source=client）→ `renderReactionActions/renderReactionPills`（:1150/:1161）；pills 读 `props.entry.reactions`（数组）+`myReactions`
- **断点 1**：`overrides/modules/transcript.tsx:114` 传 `renderMessageReactionActions={undefined}`（当时因「reactToMessage 无 handler」剥掉——本单恢复）
- **断点 2**：coordinator 无 `reactToMessage` case（上游 `source.call("reactToMessage", input)` 到 shim 落空）
- **reaction picker 数据**：`reaction-picker.tsx`（上游）用 emoji catalog（T90 已供 npm 数据）
- 输入形状：`ReactToMessageInput`（reaction-actions.ts:28 附近）——读上游接口定义照抄

## 做法
1. shim `data.ts`：内存 reaction 状态（`Map<sessionId, Map<entryId, {reactions: string[], myReactions: Set<string>}>>`，localStorage 可选）+ `reactToMessage(input)` 实现（toggle：myReactions 增删→reactions 重算→投影重推）
2. shim `coordinator.ts`：`case 'reactToMessage'` → deps（data.ts 的 CoordinatorDeps 加方法）
3. 投影：`serialize`/entries 序列化处给 message item merge `reactions`/`myReactions` 字段（ProductionRenderer :1155 读的就是这两个）
4. `transcript.tsx` 覆盖：`renderMessageReactionActions` 撤 undefined（透传 props 让 production 的进）+`renderMessageReactionPills` 同
5. 失败吞错口径照上游（「swallowed failure」@evidence）——shim 实现不抛

## 边界
1. 只动：shim data/coordinator、transcript.tsx 覆盖、新单测+e2e `t91-reaction.spec.ts`
2. 先红：e2e ① hover 消息出 Add reaction 钮（.sand-message-hover-actions 现有两钮在）——现状必红（renderMessageReactionActions undefined）
3. 验收：①hover 出钮+点开 picker（T90 目录真数据）②选 😄 → 气泡下 pills 出现（reactions 含）③再点同 emoji → toggle 掉 ④换行亮暗截图 DPR2
4. 回测：t73c（transcript 覆盖同文件）+t83

## 产出
- shim 两文件+transcript 覆盖、`receipts/T91.receipt.md`、evidence

## 经理验收（manager 任务 B，2026-11-15，HEAD bc0c9102）——**不通过，返修 T91b**
**重跑（隔离 HOME/TMPDIR/DBus）**：e2e `t91-reaction`+`t83-enter` **2 passed**（8.5s）；单测 `t91-reaction-toggle` **2 passed**。与回执一致。
**改动范围**：97b266b6..bc0c9102 共 5 文件 +118/-3（data.ts/coordinator.ts/transcript.tsx 一行 + 两测试），在边界内。
**正确性核**：
- TranscriptReaction 对象形态 ✓：`reaction-actions.ts:11` `{emoji, by}`，`SAND_REACTION_SELF="me"`（:7）；`reaction-root.ts:34` `applyOptimisticReactionUpdate` 同形态。shim 另送的 `myReactions`（数组）是冗余但无害——`production/model.ts:334 transcriptReactionFields` 用 `projectTranscriptReactions` 从 reactions 重算成 Set，覆盖掉数组。
- transcript family 推送 ✓：`views` 以 agentId 为 key（data.ts:408），`reactToMessage` 找到含该 entry 的 view→`pushTranscript(key)`，投影 `reactionsByEntry.get(agentId)` 对得上。
- 死代码：`reactionsOf`（coordinator 接口 + data.ts 实现）无任何调用方 → T91b 删。
- 持久化：只在内存（reload 即失）。工单写「localStorage 可选」，不算违约；queue 第 7 行原计划「落 dataDir 重启仍在」——降级记档，不另开单（原版也只是乐观本地+RPC）。
**不通过的原因（截图亲看 evidence/T91 三张）**：
1. hover 笑脸钮是空白方块（`data-icon-name="smiley-happy"` 无字形）；
2. 快捷条是浏览器默认灰框按钮（`sand-reaction-picker*` / `sand-reaction-pill*` 全仓无 CSS）；
3. 👍 pill 被挤进用户黑气泡内被裁掉，不在气泡下方；
4. 只有亮色，缺暗色（验收④要求亮暗 DPR2），且三张都拍在淡入过渡中途。
**记档裁决**：
- 「③ toggle 转单测」：**可以**，但现单测第一格只测了测试里自写的闭包，没碰 shim，等于没测 → T91b 改成经 createShimData 的 deps 真打两次。
- 「被 @ 的 bot 收到 reaction 的语义外置」：**同意**，与 queue 第 7 行「reaction 只显示，不进 bot 上下文」一致，留 queue 提议。
**下一步**：主 agent 在 feat/T91 上做 T91b（`open/T91b-reaction-visual-toggle.md`）；T91+T91b 一起再验收后合并。本单留 doing/。
