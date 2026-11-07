# HANDOFF · 2026-11-07 11:3x（UI 链第 8 张进行中）

> 快照：T20-T25+T29+T21b 全部合并主线（GitHub 同步）；**T26（onboarding）A 段核改完成、下会话续**——worktree /tmp/bot-wt/T26（feat/T26，1f0ee18f），工单 doing/T26-onboarding.md 末有交接记录（已完成/未做/续接入口/e2e 基线 3 passed）。关键发现：0.18 gate「agentCount>0 自动 seen」——六步 UI 在 e2e 不可达（恒有 main bot），真首启才进。经理 agent 立项超时 75min 被 TaskStop 的教训已隐含在 T26 开单说明。UI 链剩：T26 续（landing 前奏/attribution 页/kickstart 通道/变异/截图）、T27（等用户编排结论）、T28（42 模板）、T30/T31/T32。生产实例健康（launcher+SDK）。

> 2026-11-07 快照（UI 复刻链第一波收口）：T21（outline 侧板）+ T22（主聊天只留首答/终答）+ T21b（⑤ 咬合）全部终验合并进 docs/rebuild-p6-p5-plan；T20（0.79.3 参照台）S1/S2/S4 出图回执齐、经理验收中。全仓已推 GitHub（CrepuscularIRIS/Hivebot，private，73+ 分支；127MB evidence blob 已剥、B-env 隔离 HOME 垃圾已从 HEAD 树清+gitignore）。UI 复刻链下一张：T23（状态行短语引擎——0.79.3 短语原文已从 T20 拿到：thinking→"Mulling it over"，12s 不轮换）。用户在用产品实例（启动器拉起）；用户研究方向=编排（跨 bot 交流/subagent 呈现），T27 等其结论。

新会话从这里接手。先读本文件，再读 `work/REPORT-2026-11-05.md`（额度诊断 + 今日成果 + 待办全表）。

## 1. 开发架构

见 `CLAUDE.md` §1–§2（工单制）。要点：主 agent（GLM 5.3）施工；`manager`（Opus 5.5）任务 A 拆单 / 任务 B 验收；`reviewer`（6.1 Sol）批审，每条 CONFIRMED 必须实际复现。reviewer 席受自身约束不落盘报告——主会话机械代录进 work/tickets/review/。

## 2. 当前状态

- 分支 `docs/rebuild-p6-p5-plan`，T1–T6（含返修链 T2b/T2c/T3b 与复核修复）全部合并落地：合并后四文件回测 55/55 绿、`/tmp/dsh-ssh-*` 零新增、零遗留进程。
- 首批链路：L8-a（ssh 夹具+连接级）、L8-b（headless 真组合）、L4-a（skill RE）、L4-b（根收口+存 skill）。
- 关键事实都在 `work/p9-dsh-integration/PLAN.md` §3（十条，含 AllowTcpForwarding 耦合、dsh-ssh 硬编码 /tmp、硬杀残留豁免）与 receipts/T4.md §5（断连形态=运行整体终止、ReplayEntry 恰两键、插件失败只 warning）。

## 3. 待办（按顺序）

**当前快照**（2026-11-06 16:4x）：今日合并链全部落地——T7a/T7c/T9a（四单）/T16+T16b（**dsh 已升 0.2.2-rc.1**，主仓 pnpm install 已切）/T7ce/T9ae（Sol 审查 C1/C3/C4 修复）。Sol 审查 4 条 CONFIRMED 全部修复或终验中（C2=T9af 施工完等终验）。H7r 孤儿进程 30+ 已清、全量日志归档 work/H7/evidence/。剩余：T9af 终验→合并→**T9b 开工**（fs-zone-ssh 五入口，设计 D1/D2 已按 rc.1 更新）→T10-T12；T7b 等 Q-030（用户）；T13 等用户；H7 正式双全量等低负载窗口。L5-a 已随 T16 修绿（rc.1 rrule 形态）。

0. **并行两线**（10:35 经理更新）：① **T7bb**（open/T7bb-skill-picker-visual.md：T7b 终验不通过第 1 次——功能链全过，截图破版：对话框无 css 文字粘连、暗色 Pick 按钮字不可见；先 `bot-reap 2149395` 残留 Xvfb）→ 经理验收 → feat/T7b 整枝合并 ② **T9a**（open/T9a-l8d-ssh-skeleton.md，与 T7b 不碰同文件可并行）。GLM 并发≤2、同一时刻 e2e 一套。
1. **已完成链**：T1–T6、T5、T14(REFUTED)、T15、T7a+T7ab+T7ac（整枝合并，回测 e2e 2 passed + unit 114 绿）。BRIEF 验收②后端全通。
2. **其后**：T7c（skill 写入审阅卡，Q-028=B）→ T16（升 rc.1+三安全件，等低负载跑全量）→ T9b（按 rc.1 五写路径）→ T10–T13/T7d/T8/L5-a 按序；H7 等窗。
- T5：ssh × 安全层组合设计（原 architect 活）。输入：PLAN §2（fs-zone/guard/shell-ask 与 ssh 同挂点）、§3 十条、receipts/T4.md §5（断连形态/宿主直连清单：tool-fs-search、attachment-local、spill-local、agent-instructions、skill-filesystem）、§5-1（preset 隔离问题）。顺带删 queue 里记的 T4 死代码（ssh.patch.yml 重复 llm-replay insert）。
- T7：账户 skill 库 + 按 bot 启用（RE-skills Q2/Q7：启用=复制快照；库不能放 $DSH_HOME/skills 或 agents/skills——全员共扫）。
- 其后按 queue：T8（e2e mkdtemp 收尾）、L5-a、P5-H7 双全量实证（等 load<8）。

阻塞（不要动）：P7-F3 等 **Q-027**；P7-F2 冻结；P6-24 等原版删除语义；Q-023 等用户确认。**用户待办：`kill 3051833`（探针 sshd，沙箱外）；旧 worktree 13GB 清理批准（/tmp/bot-wt 下 25 个旧时代目录，见 LOG 2026-11-06 02:34）。**

## 4. 踩过的坑（直接照做）

- 全部旧坑见 `work/LEARNINGS.md`。本轮新增（已进各回执）：变异测试的绿版备份必须先落盘、还原用 cp（git checkout 对未跟踪文件无效且会抹掉未提交改动）；批量改文件后逐文件核 import 落点；headless 插件失败只报 warning 不致命；dispose 的 -O cancel 是 fire-and-forget（stop 要限界宽限）；LOG 时间戳必须 date 实测（本会话错了四次都当场改）。
- pnpm 旗标 `--config.verify-deps-before-run=false` 放 pnpm 之后；测试隔离 HOME/TMPDIR（/tmp/bot-<任务>-* 前缀）；长跑后台等通知不轮询。

## 5. 文件地图

- 工单/回执/审查：`work/tickets/{open,doing,done,receipts,review}`、`queue.md`。
- p9 状态：`work/p9-dsh-integration/PLAN.md`（§4 工单表）；RE 规格：同目录 RE-skills.md。
- 全局日志 `work/LOG.md`；经验 `work/LEARNINGS.md`；问题 `work/QUESTIONS.md`（Q-023/Q-027 open）。
