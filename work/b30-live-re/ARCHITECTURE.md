# B30 架构方案：DSH + SuperAgent 主副 bot 适配

用户原话（2026-11-18 12:07）：「推荐使用开源的DSH和DSH SuperAgent, 这两个可以更新. 推荐SuperAgent作为Grok Bot的主bot, 剩下的是副手Bot.」

## 一、语义模型（先定语义再接后端）

### 身份与作用域
| 角色 | 承载 | 会话归属 | 记忆归属 |
|---|---|---|---|
| 主 bot（Grok Bot 本体） | SuperAgent（dsh-superagent-prototype，repo 已在 repos/） | mainBotId 会话（持久） | 主 bot 工作区（skills/memories 挂主 bot） |
| 副手 bot | 独立 DSH 实例（每 bot 一个 workspace） | 各自 sessionId，主 bot 可委派 | 各自 workspace，互不越界 |

### 委派与交接（跨 bot 互动的最小语义）
- 主 bot → 副手：SuperAgent 已有的 work-item 派发（GitHub/Feishu 源→work item→自有 session→回 PR 链路，B27 调研已挤）
- 副手 → 主 bot 汇报：dsh-subagent 的 completion notice 语义（startActivation({provider,label,request,delivery})→childId，完成自动通知父）——T36/T37 已把 Workers 分组接上（origin==='subagent'&&parentSessionId===mainBotId）
- 提及/转发：0.78.1 无跨 bot 转发 UI（B27 定案），不建装饰按钮

### 生命周期
创建 bot（new-bot-dialog 已实装）→ 选 preset（B28 等价）→ 开 workspace（main/skills 已有 <dataDir>/workspaces/<botId>/.dsh/）→ 副手闲置不杀（dsh session 持久）→ 删除=workspace 级清理

## 二、能力面映射（真机证据 → DSH 后端）

| 真机能力（B30 证据） | DSH/SuperAgent 对应 | 状态 |
|---|---|---|
| 定时采集 bot（Design Atlas/Harness RSI/CUA/VLA 每日跑） | dsh schedule（RRULE→schedule/create timing typed 对象，B26 已接 Routines 区） | ✅ B26 |
| computer use（ComputerUse 264 条会话） | DSH 无原生 computer-use；bash+文件工具覆盖大部分「控制本机」语义；像素级 UI 操控=ego-browser 系（浏览器内）可接 | ◐ 评估中 |
| inbox 落盘+GitHub 回写 | dsh 文件工具+git（我们自身就是 git 仓库工作流） | ✅ 天然 |
| 副手并行（多 bot 同时采集） | dsh-subagent maxActiveSubagents 默认 8 | ✅ T36/T37 |
| 主 bot 常驻响应 | SuperAgent 自有 session+监听源（GitHub issue/Feishu） | ✅ 原型已有 |
| markdown 富文本回显 | transcript 渲染链（B19） | ✅ |

### computer-use 差距判定
真机 ComputerUse 会话本质=「agent 操作电脑完成任务」——DSH 侧等价物分两层：
1. **CLI/文件层**（已全覆盖）：bash+read/write+grep——RSI/CUA/VLA 类采集 bot 实际只用这层（arXiv fetch→过滤→jsonl 落盘→git push）
2. **GUI 层**（部分）：ego-browser 系工具（navigate/click/fill/screenshot）覆盖浏览器内操控；原生桌面 app 操控无 DSH 等价物——判定 **不新建 GUI 自动化框架**（自建=超复刻范围），复刻面到浏览器层为止

## 三、实施路径（候选批次）

### B31 SuperAgent 主 bot 实装（首个真施工批）
- shim 侧把 mainBotId 会话的执行面从 dsh session 换成 SuperAgent 循环（repos/dsh-superagent-prototype 只读参考，改造进 app/）
- 保留现有 transcript/composer UI 不动——只换引擎
- 验收：主 bot 对话经 SuperAgent 路由，work-item 派发生效

### B32 副手 bot 委派面
- 主 bot 回复中派任务给指定副手（「让 Design Atlas 去采集」→ subagent startActivation）
- Tasks 岛（B21）进度联动：副手任务在 task board 显示 progress

### B33 预设能力包（presets as capabilities）
- new-bot-dialog 的 preset radio 扩展为「能力预设」：采集 bot/computer-use bot/代码 bot 模板（prompt 模板+工具白名单+schedule 预配置）
- 对齐 0.78.1 onboarding-flow 的 30 bot 原型目录形态（6 角色×5 bot）

## 四、硬约束沿用
- 凭证不进模型/git；SuperAgent 监听源（GitHub/Feishu token）走 dsh 凭证面
- repos/ 只读；改造复制进 app/
- 每批 TDD+e2e+合并回测记 LOG


## B41a 后运行边界实测（2026-11-19）
- local-only 部署（无 GitHub setup）：engine intake 完整可用（trigger 表+disposition fanout+thread 建立，真模型验证 trigger 6 行）；**eval→decide→ticket 链在 pass 层被 `configured()` 短路**（passes.ts:52——setup 未完成不 assess/dispatch，queued 等 setup restart）。这是 upstream 部署语义（work item→PR 绑 GitHub）非断链。
- 要跑通 decide→ticket：settings 配 sources.github（repository+agentCli 签到）→ setup.resolve 过 → restart 后 pass 放行。Feishu 可选（resolveFeishuBot 失败仅 warn 降级）。
- shortcut: 本地无 GitHub 时若要「本地任务派发」形态，需在 evals/executor 层加 local executor profile——属新能力非复刻，暂不做。
