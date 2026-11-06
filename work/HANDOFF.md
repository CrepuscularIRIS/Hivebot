# HANDOFF · 2026-11-06 05:49

新会话从这里接手。先读本文件，再读 `work/REPORT-2026-11-05.md`（额度诊断 + 今日成果 + 待办全表）。

## 1. 开发架构

见 `CLAUDE.md` §1–§2（工单制）。要点：主 agent（GLM 5.3）施工；`manager`（Opus 5.5）任务 A 拆单 / 任务 B 验收；`reviewer`（6.1 Sol）批审，每条 CONFIRMED 必须实际复现。reviewer 席受自身约束不落盘报告——主会话机械代录进 work/tickets/review/。

## 2. 当前状态

- 分支 `docs/rebuild-p6-p5-plan`，T1–T6（含返修链 T2b/T2c/T3b 与复核修复）全部合并落地：合并后四文件回测 55/55 绿、`/tmp/dsh-ssh-*` 零新增、零遗留进程。
- 首批链路：L8-a（ssh 夹具+连接级）、L8-b（headless 真组合）、L4-a（skill RE）、L4-b（根收口+存 skill）。
- 关键事实都在 `work/p9-dsh-integration/PLAN.md` §3（十条，含 AllowTcpForwarding 耦合、dsh-ssh 硬编码 /tmp、硬杀残留豁免）与 receipts/T4.md §5（断连形态=运行整体终止、ReplayEntry 恰两键、插件失败只 warning）。

## 3. 待办（按顺序）

0. **收尾三件**（进行中）：① T5 设计复审（reviewer 重派中，首轮 Sol 被内容策略拦——防御性措辞重发；LEARNINGS 已有此坑条目）回来 → manager 任务 B 验收 T5（自检第 7 条口径一并裁）；② **T7a e2e 阻塞裁决**：presets.yml 全产品组合下 guard 的 workspaceRoot 豁免失效（诊断链在 receipts/T7a.md 附记，疑似产品级缺陷「UI 里 bot 写不了自己工作区」，也可能只是 presets 一行）——manager 开缺陷调查单或并入 T9；③ Q-028/Q-029 待用户。
1. **T5 设计已产出**：DESIGN-ssh-composition.md（13 节+89 锚点）+ T9–T13 实现单。核心：D4 远端 helper 默认 bwrap 不挡读（helper.js:541）→ ssh 进产品前必须先做 T10 包装层；D6 一个 runtime=一台电脑；D7 断连=专门提示+重启不重放；T9 首步删 ssh-headless.test.ts:111-122 死代码。
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
