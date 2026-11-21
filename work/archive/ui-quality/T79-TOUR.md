# T79 版式逐面收尾巡检（2026-11-16 manager 任务 A）

HEAD 1ff84016（T74-T78/T84/T77 链/T96 链/T85 链已全合）；renderer 产物 02:44 晚于最后一次合并 72005cc5（02:23）。
取证脚本：`harness/t79.spec.ts`（主巡检）、`harness/t79b.spec.ts` / `t79c.spec.ts`（补拍：头像像素、More 菜单、jump）。跑法同 PLAN.md L6，把 `TOUR_SPEC` 换成对应文件名。Xvfb，DPR2，窗口 800×600。
证据目录：`evidence/T79-tour/*.{light,dark}.png` 和 `probes.json` / `probes-b.json` / `probes-c.json`。下文「探针」指这几个 json。

## 定级清单

### P0 破版（2 条）

| # | 面 | 现象（量化） | 证据 | 原版锚 |
|---|---|---|---|---|
| P0-1 | 会话列 | **时间戳浮层脱锚**：鼠标在 transcript 上时，行时间戳停在视口固定位置（css 约 x306,y270），叠在别的消息正文上；两条时间戳叠成一处，读出来是「2:56/2:57 AM」重影。 | `jump.dark.png`（叠在长回复正文上）、`more-menu-userLast.light.png`（孤零零停在两行之间、靠左） | 0.78.1 时间戳跟随所在行（`ref/conv-done.light.png` 只有一条居中日期分隔）。**根因未查**——施工方先查 hover 时间戳的 position 基准是不是丢了 relative 祖先（虚拟列表行换成 transform 定位后常见） |
| P0-2 | 侧栏 / 会话头 / palette | **bot 头像整片空白**：每个 `.sand-grok-bot-mark` 都有 36×36（侧栏）/16×16（头）的位，但 canvas `getImageData` 不透明像素 **0**（`ink:0`，状态 idle）。svg 是作为 `<canvas>` 的子节点插进去的，只算 fallback 内容，不会被渲染。亮暗、选不选中都一样。18p 当时怀疑「测试环境专有」——**不成立**：T88e 自己的拼版证据 `work/session-presence/evidence/T88/mascot-vs-0781.light.png` 右半边，侧栏和头部也是空的，只有状态行（thinking）画出来了。 | `sidebar-rows.*.png`、`multiselect.*.png`、探针 `probes-b.avatar` | 原版每行都有彩色吉祥物（`ref/conv-done.light.png` 侧栏三行和头部药丸）。疑点：引擎只在非 idle 或 rAF 播放时才栅格化；idle 首帧没画（`agent-avatar.tsx:107-128`） |

### P1 可感差异（3 条，另有 2 条承接 PLAN D 行）

| # | 面 | 现象 | 证据 | 锚 / 备注 |
|---|---|---|---|---|
| P1-1 | More 菜单（T77 系） | **菜单盖住用户气泡**：用户消息的 More 菜单 rect [634,252,150,38]，气泡 rect [623,260,161,34]，几乎完全盖住。菜单在按钮上方弹出、右对齐。assistant 消息上也一样（菜单盖住本行）。另外 More 钮挂在行上，不在 `.sand-message` 里（探针 `messages[].more=0`）。 | `more-menu-userLast.*.png`、`more-menu-last.*.png`、探针 `probes-c.more-*` | 菜单是上游 inline 版（T77b 追认）。原版落点要查 RE-UI-FACES §4.1：hover 条在哪，菜单 side/align 怎么取 |
| P1-2 | jump 钮（T85） | 「Jump to latest ↓」水平居中正确（dx=0），但**悬在 transcript 中段**，离 composer 顶 140px，盖在正文上；12px，白底，pill 形，有阴影。 | `jump.*.png`、探针 `probes-c.jump` | RE-MOTION §1.8 `jumpToLatestPill`。原版应贴近 composer 上沿，具体 bottom 偏移要取锚 |
| P1-3 | 设置 General | **「Connector preferences」+「Clear」没进卡片**：文字和按钮挤在卡片外、贴在一起，没有行容器。 | `settings-nav-hover.*.png` | RE-SETTINGS General 分组行；T73c 遗留 |
| P1-4（PLAN D 已登记） | 设置账户卡 | 复制钮还在 email 下一行（原版在同一行） | 同上 | RE-UI-LAYOUT L76 |
| P1-5（PLAN D 已登记） | 设置导航 | Models 用的还是齿轮图标（和 General 重复） | 同上 | — |

### P2 打磨（4 条）

| # | 面 | 现象 | 备注 |
|---|---|---|---|
| P2-1 | 设置导航 hover（暗色） | 我们 hover 用 `--cursor-bg-hover`（暗 #f5f5f50f，6%），原版是 `--sand-bg-secondary`（暗 #f5f5f50a，4%）；亮色两者都是 6%，相同 | 0.78.1 锚：`chunk-layout` navItem 经 `_.interactive`（`sand-1ecwv3n:hover{background-color:var(--sand-bg-secondary)}`），选中 `sand-kr7fhf` = bg-active 8%。改一个 token 就行（`p5-55-layout.css:556`） |
| P2-2 | palette | tabs 下分隔线只画到面板一半宽（css 约 376/560） | 原版要不要整宽，待核 |
| P2-3 | 建 bot 对话框 | 对话框本身就是滚动容器，thin thumb 从右上圆角处开始，贴着圆角弧 | T78 已知，原版滚动容器在内层 |
| P2-4 | 设置 / 市场入场 | `getAnimations()` 在打开后 0-150ms 内采样 6 次，都没采到动画（建 bot 能采到 `pb-dialog-in` 180ms） | 可能 T87 wipe 走的不是 CSS animation 机制，**先核实再定级**，不直接开单 |

### 18p 四问复核结论

| 18p 项 | 结论 |
|---|---|
| 头像位空白 | **成立，升为 P0-2**（不是环境问题，见上） |
| More 菜单盖用户气泡 | **成立，P1-1**（已量化） |
| 多选头矮 16px、行位跳 | **不复现，关闭**：多选前后 header 都是 [0,0,280,52]，selection-actions 也是 [0,0,280,52]，12 行 y 坐标前后完全一致（探针 `multiselect.before/after`）。旁见：选中后头部只有「Clear」小药丸，没有「N selected」字样，Delete 被门控（T96b 有意为之）——不另立项 |
| 设置导航 hover 底≈选中底 | **亮色和原版一致**（原版也是 6% 对 8%），暗色差 2% → 降为 P2-1 |

### 本轮已过、无需动的面
- T78 滚动条：会话列、info pane、市场、建 bot 对话框都是 thin 拇指，占位 8px，和 T78 验收口径一致，没有经典箭头。
- T77 右键菜单：项左对齐，hover 底 rgba(28,28,28,.06)，入场 `t84-menu-in` 160ms。
- T84 palette：水平居中 dx=0，top 0.135vh，入场 `t84-menu-in` 160ms；hover 时选中项跟着走（aria-selected 跟随，底 10%）。
- T96 选中行：accentSelected 蓝调（亮 rgba ~26%），和 active 灰、hover 灰都能分清。
- 市场行 hover：0 → 6%。

### 未验到
- 未读 pill（「New messages」，`transcript.tsx:198` data-unread）：两轮补拍都没拿到滚动中途来的新回复（fake runtime 第二条 script 没被消费），**留给 T79 修单里做断言**。

## 修复单建议（写进 queue 当提议，经理开单时再细化）

1. **T79a 时间戳脱锚（P0-1，独立单，先开）**：碰 transcript 行布局。先写失败 spec：hover 两行，断言每条时间戳 rect 落在自己行的 rect 内、时间戳之间不重叠。
2. **T79b idle 头像不出图（P0-2，独立单）**：碰 `agent-avatar.tsx` / 引擎接线。先写失败 spec：侧栏 idle 行 canvas ink>0，和 `ref/conv-done.light.png` 拼版。和 P0-1 文件不相交，**可以并行**。
3. **T79c 会话浮层定位（P1-1 + P1-2，一张单）**：More 菜单落点 + jump 钮 bottom 偏移。都在 transcript 浮层；先取 0.78.1 锚（RE-UI-FACES §4.1 / RE-MOTION §1.8），未读 pill 断言也并进这张。**要等 T79a 合并**（同一文件）。
4. **T79d 设置面收尾（P1-3/4/5 + P2-1，一张单）**：Connector preferences 行入卡、复制钮同行、Models 图标、暗色 nav hover 改 bg-secondary。只碰 settings css/tsx。
5. **P2-2/P2-3/P2-4 合批进 queue 提议**；P2-4 先核实机制，不急着开。

合计：P0 2 条、P1 5 条（3 条新发现 + 2 条 PLAN D 承接）、P2 4 条 → 建议 4 张单（T79a ‖ T79b 并行先开，T79c 跟在 T79a 后，T79d 随时可开），P2 先当提议。
