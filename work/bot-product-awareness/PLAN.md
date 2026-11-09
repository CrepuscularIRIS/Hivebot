# PLAN：bot 产品生态认知（2026-11-08 manager 任务 A）

## 1. 探针结论（纯读文件，2026-11-08）

1. **系统提示注入点**：默认 preset 的 persona 前缀在 `app/sdk/profile/patches/approval.yml:68-76`（「You are a coding agent…」+ 三段式回复），里面没有任何多 bot / 产品说明。可挂 section 的现成写法：`app/sdk/src/orchestration/routing-prompt.mjs`（`agent.ctx.systemPrompt.section`，每次组装重读）。kickstart（T25）只管自我介绍，不相关。
2. **编排层早就建好，只是闸门关着**：`app/sdk/src/orchestration/` 有 `create_bot` / `send_to_bot` / `stop_bot` 三个工具 + 主 bot 路由提示（`routing-prompt.mjs`，来源 0.18 `project-prompt.ts` COORDINATOR_TOOLS_GUIDANCE）；UI 侧 ⑤ 通道 `app/ui/main/m3-meta/orch-channel.ts` + `orchestrate.ts createWorkerBot` 已接进 `main/index.ts:18-19`；shim 侧 Workers 分组已在（`shim/src/data.ts` P6-15/16）。但 `profile/patches/orchestration.yml` **不在 `src/start.ts buildArgs` 默认链**（文件头：「开放闸 = P6-14b」），生产启动器也不叠 P2SDK_PATCH → 生产 bot 没有这三件工具。P6-14b 卡在 P6-22 定案（48 组）、启动顺序核对、persona/section 在场断言（`p6-orchestration/PLAN.md:66,74`）。另：dsh 子进程拿不到 `PBOTS_DATA_DIR`，`identity.mjs` 在自定义数据根下 fail closed（文件头 ponytail 注，也归 P6-14b）。
3. **路由提示是「强制委派」口径**：主 bot 凡写文件 / 跑命令都要 `create_bot` 派给 worker。开闸 = 主 bot 行为大改，不只是「多了建 bot 的能力」。
4. **subagent 工具一直都在**：默认 preset `delegation` 组（`approval.yml:148-175`）有 `subagent` / `subagent_fork` / subagent-control / workflow。bot 能用，只是不会主动提，界面上也看不到子任务过程（= T27 的 per-subagent tab）。
5. **「dsh 的 superagent」有歧义**：`repos/dsh-superagent-prototype` 是「监听 GitHub / 飞书、按工单干活的主动 agent + web panel」，Q-001=b 已整体移出 MVP（`p2-sdk/BRIEF.md:72,77`）。用户说的可能是它，也可能是 subagent 或主 bot 派活编排 → Q-036。
6. **原版 0.79.3**：主 bot 描述「Your main point of contact. It checks in proactively and coordinates work with your other Bots.」（i18n `mQQ/Uq`）；工具枚举有 `CreateAgent` / `UpdateAgent` / `SendToAgent` / `ReadAgentActivity` / `SearchBotTemplates` / `SetPrimaryBot`（`/tmp/grokbot-0.79.3/agent-tools.txt`）；CreateAgent 行文案「Creating {name}」（`nYlb+P`），跨 bot 行「Messaged N Bots」（`CFIQ32`）。i18n 里**没搜到**建 bot 的审批卡文案（证据级别：未见，不是证明没有）。原版这些工具在服务端执行，提示词不在产物里。
7. **名册数据源**：bot 名字 = dsh session title（shim `session/rename`，`data.ts:535-575`）；侧栏列表 = `session/list` 滤 subagent（`data.ts:338-343`）；bots.json 只有 `mainBotId` / `recipes` / `bots[id].createdBy`，没有名字（`ui/main/m3-meta/store.ts:15-20`）。shim 是渲染进程代码，bot 运行时够不着；bot 侧能力只能做成 SDK 插件。

## 2. 方案

- **① 看不到同伴、② 不知道怎么建**：先做纯提示的 T33（每个 bot 一段「产品认知 + 同伴名册 + 建 bot 路径 + 没工具就指路」），走默认链，用户马上能用。不加 list_bots 工具：名册放提示里不用调工具，几十个 bot 以内够用。
- **② 让 bot 代建**：编排层现成（搬运阶梯第 2 级，本仓），问题是开多大的闸 → Q-035。答了再定 T34。
- **③ superagent**：先问清是哪个（Q-036）。subagent 那块归 T27（queue U7），本需求作为 T27 的输入；T33 只带一句「subagent 是内部助手，不是 bot」。

## 3. 审批边界（写给 T34，T33 不涉及）

照 P6 现有 create_bot 的约束，不放宽：只有权威主 bot 能见到；只在用户亲自发起的回合可见（worker 回报 / goal / schedule 回合隐藏，`turn-origin.mjs` coordinatorTainted）；同时运行 worker ≤3；preset / connectors / cwd 由 main 定，bot 传了即拒（凭证、连接器不经 bot 之手）；cwd 强制 `workspaces/<botId>`。新 bot 跑同一套默认审批（shell-ask 逐条问、guard、fs-zone），所以**新 bot 的权限不超过主 bot**。原版没见审批卡 → 推荐不加卡（Q-035）。

## 4. 任务索引

| 单 | 内容 | 状态 |
|---|---|---|
| T33 | 产品认知 + 同伴名册 section（默认链） | done（2026-11-08 经理终验 a76a5cf9，待合并 feat/T33） |
| T34 | 编排开闸（Q-035=A）：orchestration.yml 进默认链 + `DSH_PBOTS_DATA_DIR` 数据根注入 + harness 播种 + 在场断言 + 生产真建 worker 旁证 | done（2026-11-08 经理终验 0de49c88，`tickets/done/T34-orchestration-default-chain.md`；待合并+生产旁证 7；⑤ 泄漏格补测 T34b+T34b2 done 2026-11-09 @ 68e6ce96，待合并 feat/T34b） |
| T35 | 生产模型路由复测（替 P6-22 定案） | 计划，T34 合并后 |
| — | superagent 归属 | 等 Q-036；subagent 部分并入 T27 |
