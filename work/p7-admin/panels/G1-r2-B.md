# G1-r2 席 B（6.1 Sol）

> 代录，未经改写。该席未能写文件，以下为其最终回报原文。

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能失败于把"提及目标"当成"授权动作"，或在首次 re-arm 后因 revision 改变而丢失 Mandate，导致越权执行或闭环停摆。

findings:
- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:103–104,162,172,175` — **H1/H2 仍不能构成所声称的授权边界**：只匹配目标，不核对动作及参数；用户说"看看 X 连接器的 issue，先别安装"，恶意正文要求安装 X，仍满足 H1。Mandate 内仓库同样不能证明任意派工内容已获授权；人类回合建 bot、重启还被直接豁免。证据：按规定的规范化字面包含运行 Node，以上原话对目标 X 返回 `true`；现有投毒验收只测目标不出现的情况。建议：执行器核对明确授权的「动作＋精确目标＋受限参数」，未授权默认拒绝；补同目标异动作、显式否定、同仓越出任务范围及豁免路径的反例。不能继续宣称"投毒最多只能在 Mandate 内做事"。
- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:49–50,161–162,174` — **disarm/re-arm 与 revision 绑定 Mandate 尚未接通**，Q-1 已提供会使闭环停住的新证据：公开 `disarm` 不改 revision，但 `resume` re-arm 会递增 revision；首次 worker 回报后或重启恢复后，旧 Mandate 因此不再匹配。证据：`reuse/q1-goal-mount.md:86–90`；已装 `dsh-goal/lib/index.js:691–703,813` 确认 resume 经 `withPhase` 增加 revision。建议：明确可信恢复 owner、何时允许恢复及授权如何随纯 resume 安全迁移，禁止 edit、用户暂停、撤销、过期或耗尽目标继承授权；L2/M6 增加"恢复后再次成功派工"及上述拒绝分支。Q-1⑦ 的触发条件钩子仍未得到回答，不应视为关闭。
