# BRIEF · 会话呈现切 0.79.3 形态（动态 bot：状态行+头像动画+outline）（2026-11-13）

## 用户原话

> 继续. 我觉得问题不大, 然后剩下依然是体验这块, UI啊, 很多的连接, 动画, 比如我怎么记得最新版本的UI很多bot是会动态的. 例如thinking部分是UI在动态的

## 取证（已有报告，主 agent 摘录）

**work/grok-0.79.3-re/RE-UI-0.79.3.md 已覆盖**（用户记忆正确）：

1. 0.79.3 主聊天流**没有 thinking/tool-call 条目**（entry kind 全集：message/tool-call/send-message/user-attachment/notice/event/feedback/labeler-question/voice-call/mcp-app——thinking 只在派生结构）；复刻建议（报告 §「复刻建议（最小集）」）：聊天流只渲染 message（含归属）+ notice 子集，thinking/tool-call 喂状态行与 outline 数据源。
2. **动态状态行**（transcript 尾部 kind:'working'/'typing' row）：活动短语引擎——新活动 ≥800ms 才切、working 短语 5s 轮换（Gjn=5e3）、thinking 短语 2.5s（Kjn=2500）、显示满 60s 加 elapsed、退场 140ms（锚点：function Yjn/ / function ren(）。
3. **头像状态动画**：状态目录 53 个（Lifecycle 17：idle/listening/thinking/streaming/searching/reading/working/coding/running/computing/controlling/waiting/blocked/finished/failed/sleeping/waking；Reactions 17；Morphs 13：orbit/radar/progress/spawning/loading/dictating/sending/receiving/uploading/writing/alerting/bouncing/powering-down；Product 3；Brand 3）。动词→头像状态映射 v5e（thinking→thinking、searching→searching、browsing→reading、coding→coding…）。活动来源 currentActivity（kind:'thinking' 或 tool 名+detail）。
4. **Full conversation outline 侧板**：user/thinking/assistant-text/tool-call/send-message 行、行首图标、pending=旋转/failed=叉、预览 80 字符、chevron 展开 pre 详情；数据 conversationOutline store（IPC getConversationOutline+outline 推送）。
5. 报告差距表第 1/4 条即此（我们=0.18 形态进流）。

## 关键决策点（要经理分析/用户拍板）

- **规格版本切换**：既有定调「原版=0.78.1」主要锚视觉（边框/布局）；0.79.3 的会话呈现是另一代结构。用户此刻参照「最新版本」=0.79.3。切多大：仅会话呈现层（状态行+头像+outline）按 0.79.3，其余维持 0.78.1？还是全面对齐 0.79.3？
- 头像动画资产：53 状态的动画怎么来（Lottie/帧序列/CSS？）——0.79.3 产物里查实现载体；工作量可能大，或先做子集（thinking/searching/coding/waiting 高频几个）
- 与在途单的关系：T83（会话动效 G1）是 0.18 形态的打磨（typing 三点/shimmer）——若切 0.79.3 形态，typing 三点可能被状态行**取代**；T81a（supersede）不冲突
- 依赖链：状态行动画依赖 currentActivity 数据源（thinking/tool 事件→活动映射）——shim 层要产这个投影

## 经理结论（2026-11-13 manager 任务 A，Opus 5.5）

**结论：不涉及版本切换，是我们漏搬了 0.78.1 的东西。** 下面每条都在 0.78.1 产物（`/tmp/t78-asar/dist/renderer/assets/`）里逐条 grep 命中：
- 状态行：`isStatusQuiet`、`kind:\`working\``/`typing`，组件 `$Ht` @app 2431710，`if(a===\`quiet\`)return null` @2430541
- 活动映射：`lO`（`if(e.kind===\`thinking\`)` @1058900）、动词→状态 `JZe` @1062742（与 0.79.3 `v5e` 逐项相同）、`hO`（awaiting→blocked，结算保持 `YZe=8e3`）
- 吉祥物：状态目录 `on`（`label:\`Lifecycle\`` @common 171148，53 个，与 0.79.3 相同）；引擎 `p_`（canvas 加 rAF，`maxFrameRate`，IntersectionObserver 不可见即停帧，reduced-motion 时静止），从 `index.eager-common-DbK3Oi_r.js` 导出为 `T`；React 包装 `GrokBotMark`（`dT` @app≈892000）
- outline：`getConversationOutline`、`show_full_conversation`、`thinking-medium`
- 隐藏谓词：`qP`（`e.kind===\`tool-call\`||` @app 1651621）、entry kind 表 `rc`（无 thinking）
- 短语 shimmer：`sand-shimmer-text`（@704488），`shimmerDuration:1400ms`

**BRIEF 的前提「我们是 0.18 形态，thinking/tool-call 进流」已经过时。** T21（outline）、T22（主聊天隐藏过程）、T23（状态行短语引擎）2026-11-07 都已合并（`74cbeda0` 等）。真正缺的有两样：
1. **吉祥物是静态 SVG**，只会浮动和倾斜，不会变形；T24 自定的「不移植 3D」偏差。状态行泛 working 前 5s 是原版规定的静默期，只显示吉祥物不出字，所以这几秒里屏幕上什么都不动。这是「不动态」的主因。对照 `work/grok-0.79.3-re/ours/conv-working.cmp.light.png`：原版侧栏和状态行都是变形后的三点，我们是静止的形状。→ **T88**
2. **状态行短语没有 shimmer 扫光**。→ **T83 修订**（同时删掉 T23 之后已是死代码的 typing 三点项）

载体：引擎是程序化 canvas，不是 Lottie 也不是帧序列。`index.eager-common` 是独立 ES module，只依赖 rolldown runtime chunk，可以逐字节拷进来直接调用，不用重写，也不用挑子集，53 个状态全都能用。拷到 `renderer-grok/assets/` 下，这个目录已在 `publish-hivebot.sh` 的排除名单里，不进公开仓。
用户拍板：无新增。版本问题已消解；资产范围不用选子集，整件拷贝就带全部状态。

## 用户定调追加（2026-11-13）

> 继续开发与打磨. 目前距离一模一样的Grok Bot还是有差距, REA目前内容还是很少, 或者说没有完全尽全力去REA

**目标口径升级：一模一样**（行为级+视觉级全覆盖）。REA 现状盘点：9 份报告（FULL/UI-LAYOUT/CONNECTORS/CONNECT-PRESETS/CONNECTOR-GRANT/SETTINGS/BORDERS/STOP/MOTION）——相对 0.78.1 全量功能域仍是少数面。路径：先做覆盖度地图（0.78.1 功能域全枚举 vs 已 RE 面），缺口逐面派 REA，报告全部可核对锚点化（同 RE-BORDERS/RE-MOTION 形态）。
