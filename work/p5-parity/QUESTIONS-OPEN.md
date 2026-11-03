# 待答问题（4 个）· 2026-11-03

> 完整版在 work/QUESTIONS.md（Q-001~Q-012 已答）。每题答 A/B/C 或一行文字即可。

## Q-013 [open] 审批默认档位表（L-AP 高风险，逐行确认；v2.1 终版）
- slug：p5-parity ｜ 类型：高风险（审批语义）｜ 阻塞：L-AP 中除 W1-AP-0（全入口纯收紧：wrapper、凭证拒读写、移除 plugin_manager、拒裸升权、子代理同表——**不等本答复**）与 W1-AP-q（ledger 修复）以外的实现 ｜ 提出：2026-11-03 00:30，v2 01:40，v2.1 02:30
- 背景（v2.1）：方向你已给（bot 自己完成，只有一些问题询问）。**真实后果 7 条**：①「无网络」只针对 bash——bot 读到的东西可能经 web 工具外发；②工具链（conda/pnpm 等）只读挂回：能跑 `python x.py`，不能 `pip install`；③今天批准升权 = 该命令完全没有沙箱，W1-AP-0 起先直接拒绝，受控升权路径（D-1）落地前 bot 不能联网也不能写工作目录外；④子代理里的 bash 今天不问，W1-AP-0 起改为拒绝（等你答复后按档位放行）；⑤连接器（MCP）进程不在沙箱里；⑥原版默认全部 ask（我们比原版更自主）；⑦沙箱加固前 `ls ~/.ssh` 可见——W1-AP-0 修；⑧新 NEVER 规则比清单更严：**HOME 下所有点目录（.ssh/.config/.claude/.codex 等）默认拒读**（白名单例外放行）、**/proc 整个拒**（防从 environ 读 key）——W1-AP-0 落地不等答复；⑨cwd 在 app/sdk 或仓根的旧 bot：策略代码只读保护后**迁移（P5-26）前连自己工作区都写不了**，需要先迁移。
- 档位表 v2.1（# / 类别 / 默认）：
  1. bash 沙箱内（工作目录内读写无升权；例 `python x.py`）→ **ALWAYS**（A0 通过前 ASK；现状：根会话每条都问、子代理不问）
  2. bash 升权（联网 curl/pip、写工作目录外、danger-full-access）→ **ASK 只走受控升权路径（凭证始终遮住）；D-1 落地前直接拒绝**，不可始终允许
  3. 文件工具工作目录内 → ALWAYS
  4. 文件读工作目录外 → **ASK，不可始终允许**（realpath 判定；子代理里为拒绝）
  5. 凭证路径（~/.ssh、credentials*、~/.grokbot、launch token/handoff、授权文件、DSH_HOME 等）→ **NEVER 读写都拒，代码常量，W1-AP-0 就落地不等答复**
  6. 连接器读（readOnlyHint=true）→ ALWAYS（**需 D-2 元数据桥；桥接前一律按第 7 行处理**）
  7. 连接器写/未标注 → **ASK 可「始终允许」**（唯一可始终允许类别，bot×工具；桥接前所有连接器按本行）
  8. 连接器 destructiveHint=true → ASK+警示，是否可始终允许：**推荐否**（否=桥接前任何连接器都拿不到 always）
  9. 权限 preset 切换 / permission 命令 / **plugin_manager 全部 action** → **NEVER（纯收紧，W1-AP-0 落地）**
  10. **web_fetch / web_search → 草案 ALWAYS（=现状不放宽）；备选 ASK——请你定（重点行）**
  11. 其他进程内工具（R4 全表 32 个）→ ALWAYS（=现状，信息列出，无异议不用答）
- 另定四件：
  - (b) 「始终允许」作用域：仅连接器写工具，**每 bot × 工具**（备选所有 bot 共享=原版做法，R1）；推荐按 bot
  - (c) bot 设置按连接器调读/写档位：**不做**（原版有三值档位 UI，我们 UI 只读+撤销）
  - (d) 全局「暂停自主」开关（只能收窄）：**推荐做**
  - (e) 现有 bot（含主 bot）：**推荐设置里手动迁移**（旧会话不动、文件不搬）
- 选项：
  - A（推荐）：整表按 v2.1 确认（含第 10 行 web=ALWAYS、b=仅连接器×每bot、c=不做、d=做、e=迁移）
  - B：部分行改（请指明行号和新档位；重点行 1、2、8、10）
- 答复：

## Q-014 [open] UI 基准：能否由你登录 0.78.1 截约 10 张参照图
- slug：p5-parity ｜ 类型：方向 ｜ 阻塞：仅 U5 并排对照的基准选择（U1-U4 不阻塞）｜ 提出：2026-11-03 00:30
- 背景：L-UI 的「与原版一致」目前缺登录后运行态截图（现有只有未登录页）。最准的基准 = 你本人登录后按清单截图（侧栏、会话流含工具行+审批卡、市场、设置 pane、权限页；亮暗各一套），个人信息自行打码后放 work/p5-parity/ref/。截图不经模型，凭证不进模型。不方便就降级：R3 桩数据渲染 → 0.18 重建仓渲染；**降级口径（G1-r1 B-M3）：旧版参照覆盖不到的 0.78.1 特有项标「未验证」，不因 GU PASS 自动消除**。
- 选项：
  - A（推荐，最准）：你来截（放 work/p5-parity/ref/ 后告诉一声）
  - B：不截，按 R3 → 0.18 降级基准
- 答复：

## Q-015 [open] 契约变更 C2：审批自主化的接口与不变式修订（v2 六件）
- slug：p5-parity ｜ 类型：契约 ｜ 阻塞：W1-AP/W2-AP 实现（调研与 W1-AP-0/q 不受影响）｜ 提出：2026-11-03 00:30，v2 修订 01:40
- 背景：BRIEF v2 §10.9，与 Q-013 配套，Q-013 答复前不合入。
- 内容六件（v2.1 增补两条语义）：① M1 新增 `pbots/approvals.alwaysAllow {eventId}`（main 反查工具+bot、**写盘成功后才代答 allowed-once**；仅连接器写工具的 eventId 有效）/ `approvals.list {sessionId}` / `approvals.revoke {sessionId, serverName+rawName}`（**稳定身份键，不用归一化 toolName**；v2 补充：配置层禁止 serverName 含 `__`，防 publicName 键碰撞串 server——D2-r1 A-HIGH）；② session/create 的 cwd 改由 main 强制为 `workspaces/<botId>`，renderer 传入即拒；③ P4B D3「无始终允许入口」修订为「仅连接器写工具可始终允许」，D9 其余不变，「renderer 只发 allowed-once/rejected」不变式保持；④ SDK shell-ask 由必问泛化为按档位查表；⑤ 新增 `pbots/bots.migrateWorkspace`（用户触发的旧 bot 迁移，Q-013 (e) 的落地）；⑥ M1/M2 增加对 dsh `user-questions/request` 提问事件的作答分支（A14/R7 落地）。
- 选项：
  - A（推荐）：六件全准（含 v2.1 增补两条语义）
  - B：有修改（请指明）
- 答复：

## Q-016 [open] D-2 分歧：连接器分档走 ②元数据桥 还是 ③统一ASK（含落行二选一）
- slug：p5-parity ｜ 类型：取舍（D 投票分歧）｜ 阻塞：P5-23（暂按 ③ 实现口径准备，等本答复定稿）｜ 提出：2026-11-03 04:3x
- 背景：两席投票分歧（panels/D2-r1.md）：Opus 席投 ③「不做 hint 分档、所有连接器统一按 ASK 处理」——理由：② 按 server 自报 hint 放行，server 报假值就静默放行且测不出（MCP 规范原文也警示不可信 annotations；destructiveHint 规范默认 true，「未标注归读」违反规范）；③ 最坏只是多点几次卡。Sol 席投 ②「自建桥读 hints 分档」——理由：若你把第 8 行（破坏性不可始终允许）答「否」，③ 下就没有任何连接器能「始终允许」，授权功能（P5-24）对所有连接器失效。
- 连带二选一（必答）：③ 下所有连接器统一落到——**第 7 行语义（ASK + 可「始终允许」，推荐，P5-24 保留）** 还是 第 8 行语义（ASK + 不可始终允许，P5-24 与身份桥一起砍）
- 选项：
  - A（推荐，暂定执行中）：③ + 落第 7 行（改动最小；以后想分档再补桥）
  - B：② 自建元数据桥分档（读类 ALWAYS 自动放行，代价：信任 server 自报）
  - C：③ + 落第 8 行（连接器全部不可始终允许，P5-24 缩水为纯 bash 外无授权对象）
- 答复：
