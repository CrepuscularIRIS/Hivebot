# UX-1 · 席 C（6.1 Sol）

> 代录，未经改写。该席受运行约束不能写文件，以下为其最终回报原文（P6-15 / P6-16 交互与视觉提案）。

1. **UX-1／席 C，全文回报**：本席运行约束禁止写报告文件，因此未创建本文件，以下供派发者代录；未改产品代码。结论是**首批用合成 section，不自建行下嵌套树；视觉重点放在「谁需要我、结果在哪里」，不是展示 agent 组织结构**。依据为 PLAN 决策 20–25、27–28 及所列 RE、现有源码；Cowork 只借监督机制，不声称复刻其未验证的 worker 侧栏。
2. **两方案比较与推荐**：①合成 section（第 2 级）：与 0.78.1 **状态语言一致、父子空间形态不完全一致**；复用现有 `sections`、`isSynthetic`、`isCollapsed`、agent 行、状态点与打开回调，主要改 shim 投影和 overrides，回退时去掉合成投影即可，不迁移 session 或持久归属。②主 bot 行下嵌套折页（第 4/5 级）：更接近 RE1 的 d8e/qA 父行＋chevron＋子行结构，但 RO §8 明确没有运行态复现，也未证明可移植；需处理父行导航与折叠分离、pin/窄侧栏、焦点、连线及拖拽，改动面更大；数据仍可逆，交互回归面却明显扩大。**推荐①**，不为「看着像」提前降到自建；②仅在补充 RE 证明可搬，或 GU 证明①归属不可理解时再选。注意现有 `overrides/modules/sidebar.tsx` 实际只有包装层，PLAN 的行号不能当作该文件已有分组实现的证据。
3. **核心旅程与层级**：打开主 bot→交代两件活→ack 后出现 `Messaging ‹name›`→worker section 实时出现→用户继续聊天→有事才看状态→完成看主 bot 汇总，必要时打开原 worker。最易卡住的是**「主 bot 提醒需要审批，却把用户带到 worker 底部而非原卡」**；解法是待人工入口携带已有 `workerId + eventId`，定位并聚焦原卡，不复制审批面。主 bot 屏第一重点是当前对话与最终答复；侧栏第一重点是阻塞；worker 屏第一重点是待决卡或正在进行的任务，工具细节维持现有折叠。
4. **侧栏 ASCII 草图**：
```
+----------------------------+
| Main Bot       [需你处理] |
| v Main Bot 的工作 (4)     |
|   [!] 修复测试  等待审批   |
|   (o) 市场调查  正在运行   |
|   [*] 汇总资料  找到3项…   |
| > Main Bot 已完成 (1)     |
|----------------------------|
| 原有 bot / 用户分组       |
+----------------------------+
```
斜杠代表换行；`[!]`、`(o)`、`[*]` 分别对应注意点、现有运行指示、未读点，不是新增图标库。复用**两个同属主 bot 的合成 section**承载活动与已完成，避免为了 done 折叠再写嵌套容器；放在 pinned 区之后、用户自建 sections 之前，不拆散原用户分组；标题明确父 bot 名。无 worker 不显示；活动组首次有 blocked/running 时展开，用户手动收起后不反复抢开，主 bot 汇总信号继续保留。合成组及其 worker 禁止拖移、置顶等会逃逸归属的动作；不能仅凭 `isSynthetic` 推断所有行操作已锁定。整侧栏收为窄轨时只保留主 bot 汇总入口，不让上游「折叠侧栏时平铺 section agents」的分支把 worker 泄漏成顶层联系人。
5. **状态、排序与预览**：四档为 **blocked → running → unread → done**；blocked 显「等待审批／等待回答」，绝不继续画忙碌 spinner；running 复用真实运行态，不造百分比；已完成但未读仍留第三档，读过的 completed 才入默认收起的 done。行状态文案另按决策 21 推导：待人工＞运行＞出错／已停止＞新结果＞空闲；error/stopped 不伪装成功、不因已读自动藏进 done，在第三档可见区保留异常文案且不伪造未读；尚未开始的空闲 worker 同区末尾显示「尚未开始」。档内沿用现有最近活动时间降序，以 sessionId 稳定打破平局。结果预览取已有 result 的首个非空行，最多 80 字符再按宽度省略，无结果用 outcome 文案；不露内部包装语、JSON 或工具原始参数。主 bot 汇总 blocked 优先于运行，未读作为独立语义保留；读主 bot 不等于读所有 worker，收起分组也不清未读。
6. **worker 侧 ASCII 草图**：
```
+------------------------------------------------+
| [返回 Main Bot]       修复测试                 |
| [主bot头像] 来自主 bot · Main Bot [打开]       |
| 请跑测试并修复失败项……                       |
|------------------------------------------------|
| [worker头像] 收到，我先复现失败……             |
| > Bash · 正在执行                            |
| [原审批卡：完整动作及原有批准/拒绝按钮]       |
| [给修复测试发消息________________________]    |
+------------------------------------------------+
```
`pbots-main` 是**跨 bot 入站任务**，使用 assistant 泳道的中性消息面，不冒充用户右侧深色气泡；来源标签 12/16、正文 14/22，任务正文默认可读，不折进 Thinking。主 bot 的名字/头像是可点击来源入口，与 worker 自己的答复明确分组；无名显示「主 bot」，并能从详情辨认 id。任务消息必须先于该 Assignment 的 worker 答复出现。
7. **主 bot 侧 ASCII 草图**：
```
+------------------------------------------------+
| [工具图标] Messaging 修复测试        [打开]   |
| [worker头像] 修复测试 · 已完成       [打开]   |
| 已修复2处失败，测试通过……                    |
| > 查看完整回报                               |
| [worker头像] 市场调查 · 需要你回答            |
| 请确认研究范围。            [前往原问题]     |
| [主bot头像] 两项工作进展如下……               |
+------------------------------------------------+
```
回报是 assistant 泳道、署 worker 名的**来源消息**，不是用户气泡、不是主 bot 本人的回答；正常回报复用消息壳和现有展开交互，摘要最多两行，全文按已有 result 展开，截断时明确「回报已截断，打开 worker 查看」。合批通知按 `source.items` 各展示一项，仍只对应一次主 bot 回合；同一 worker 连续来源消息可沿用作者归组，但不同 worker 不合并署名。ask 项只给定位入口，不渲染批准按钮。create/send 使用 PLAN 定稿文案；无名 `Messaging another assistant`；create 尚无目标 id 时不画假链接，成功解析后才可打开。此处 create 命名化是本项目定稿，并非声称 0.78.1 CreateAgent 原样如此。
8. **亮／暗 token 规格**：直接消费现有 `--sand-*`，不复制新色板；以下均为「亮／暗」：会话底 `--sand-bg-pane=#ffffff/#161616`；侧栏 `--sand-bg-sidebar=#f5f5f5/#0e0e0e`；来源消息面 `--sand-fill-bubble-agent=#1c1c1c0f/#f5f5f50a`；主文 `--sand-text-primary=#1c1c1c/#f5f5f5`；次文 `--sand-text-secondary=#1c1c1cad/#f5f5f5a8`；边 `--sand-border-tertiary-translucent=#1c1c1c14/#f5f5f50f`；hover `--sand-bg-hover=#1c1c1c0f/#f5f5f50f`；选中 `--sand-bg-active=#1c1c1c14/#f5f5f514`；链接/未读 `--sand-text-accent-primary=#0b6dd3/#4d9bff`；阻塞文字 `--sand-text-warn-primary=#aa6300/#e28600`，阻塞点 `--sand-icon-warn-primary=#da830e/#c8770c`；失败文字 `--sand-text-danger-primary=#cd2834/#ff6463`；完成文字 `--sand-text-success-primary=#00854a/#00ba69`；焦点 `--sand-border-focus-primary=#1e86fc/#1884fc`。dsw 兼容映射复用 RE-theme §5：`--dsw-specific-sidebar-fill`→sidebar、`--dsw-alias-bg-layer-2`→pane、`--dsw-alias-label-primary/secondary`→对应 text、`--dsw-alias-border-l2`→上述 border、`--dsw-alias-interactive-bg-hover/active`→上述 hover/active、`--dsw-alias-link`→accent；不误用 `--dsw-specific-bubble`，它是用户气泡。当前 renderer 未检出 dsw 消费点，映射仅供已有适配边界使用，不新引 dsh 界面。侧栏行沿用已有尺寸，消息圆角沿用原组件；状态点 6px，最多一种运行动效，reduced-motion 停动画；半透明值必须在真实底色上验收。
9. **状态全集与跳转**：加载时保留已知名单并标「正在更新」，首次加载用现有加载占位，不先显示「没有工作」；加载失败保留旧列表＋「更新失败／重试」，不能清成空；离线保留最后快照并明确「离线，状态可能已变化」，不得凭最后一次 running 断言仍在运行，作答与发送沿用现有连接可用性禁用；长任务保持真实活动入口，不加猜测耗时；create 超时按「创建结果未知，请查看工作分组」，不提供一键重派。点普通 worker 行打开**同一 session** 实时 transcript，保留既有未读定位；点 blocked 行或 ask 回报优先定位相应未决 eventId，必要时加载历史至原卡并聚焦。已作答/重启失效的历史 ask 仍可查看，但显示「已处理／已失效」，不重新给可操作按钮；目标不存在明确报错，不自动新建。来源链接回主 bot，保留原滚动锚点与草稿；导航上下文仅本地临时持有，不新增后端字段。所有入口有键盘焦点与可读状态名，状态不只靠颜色表达。
10. **反提案与实现边界**：不要默认做「主 bot 内联一张 worker 全过程大卡，并复制审批按钮」——它重复已有 transcript、扩大信息噪音，还会制造同一 eventId 的双作答面；也不复制 Tasks 页、DEV outline 浮层或 Cowork 整壳。P6-15 只负责归属投影、排序、汇总和打开；P6-16 贯通 reduce→fold→entries，对 `pbots-main`、`pbots-worker` 显式映射，其他内部来源继续隐藏；两类入站任务/回报均须形成确定的回合切段边界，不让 worker 新任务或主 bot 回报后的工具污染上一回合 result。特别检查现有 sidebar 头像预览分支 `presence==="working"` 优先于 blocked 的行为：不要直接复用到父 bot 汇总，造成「另一个 worker 在跑」掩盖审批。字段仅用 PLAN 已有 createdBy、source 及 items 字段、现有 session 运行/未读/审批状态；不新增 task 实体或云端线程协议。
11. **可证伪验收，直接转 e2e**：①fake 创建 worker 后，无 reload，普通/pinned bot 列表中该 session 出现 0 次、所属工作组出现 1 次；窄轨也不得泄漏，原普通 bot 导航不变。②同批注入 blocked、running、completed-unread、completed-read，断言前三者 DOM 顺序、done 标题默认 `aria-expanded=false`；同时 running＋pending ask 必须显示 blocked 而不是 working，读过 error/stopped 仍可见。③收起两组后父行仍有 blocked；处理最后一个 ask 后 blocked 消失但其他未读保留；仅打开主 bot 不得清 worker 未读。④点 worker 后主内容 sessionId 等于原 id、session 总数不变、composer 消息只进入该 worker；任务来源标签可见且 DOM 次序早于 worker 答复，用户发送仍为用户泳道。⑤两 worker 同批回报各一项、均在 assistant 泳道且分别署名，主 bot 仅一份 result；重放/重连后同 key 不重复；`runtime-context` 不显示；新回报首项后直接工具调用时，上一回合 result 仍是气泡。⑥点击 ask 入口后原 eventId 卡进入 viewport 并获焦；主 bot 区域批准/拒绝按钮数为 0，作答观测仅含 worker 原 eventId；第二次 ask 定位第二个 eventId，旧 ask 不能代答。⑦离线不变空、不显示假完成，重连同 session 恢复；无名、超长名、4000 字截断、创建结果未知均无假链接/自动重派。⑧亮暗分别保存整屏及局部截图；Tab/Enter 可完成展开和跳转，reduced-motion 无持续动画；实施后先 `pnpm build` 再跑 ui 单测、`pnpm test:e2e p6-workers` 及 `pnpm test:e2e p6-fold`。以上是待实现断言，本席未运行测试。
12. **可复用出处与核对路径**：首选 `b-nnett/grok-bot-0.18-reconstructed@a9f633e:frontend/src/recovered/features/conversation/workspace/{sidebar.tsx,sidebar-section-projection.ts,sidebar-section-header.tsx,transcript.tsx}`，无独立 LICENSE、闭源重构快照，仅按本项目私用约束使用，不当持续维护依赖；本地对应 `/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/`，覆盖层 `/home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/{sidebar.tsx,transcript.tsx}`，消息接缝 `/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/entries.ts`。MIT 备选 `OpenCoworkAI/open-cowork@e94ee2c:src/renderer/components/SubagentProgress.tsx` 仅参考状态头，不引整仓、不搬 5 秒清除历史策略；`deepseek-ai/deepseek-harness@ce7073d512:packages/client/ui-theme/src/styles/design-platform.css`（MIT）仅核对 dsw 别名。视觉证据 `/home/lingxufeng/bot/work/p6-orchestration/evidence/r05/`，token 实值 `/home/lingxufeng/bot/app/ui/renderer-grok/overrides/p5-55-palette.css`；r05 证明现有状态/密度语言，不证明 d8e/qA 已运行复现，p1-re 登录截图也不作为登录后侧栏运行证据。
