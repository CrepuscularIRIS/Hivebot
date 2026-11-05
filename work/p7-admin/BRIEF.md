# BRIEF · p7-admin · v2.4（原版即规格，首批收敛）

> 2026-11-05，6.1 Sol 按用户指令代 director。**当前有效规格为本版§1–11与PLAN v1.1**；§12–14保留旧panel回应作历史，里面的独立Mandate体系、P7-SB阻塞契约、U-3重复授权、全量7b/7c出口不再约束首批。旧有条件通过不等于新版本已获panel通过；主会话确认RE映射即可，不替作者跑闸门。

版本沿革：v1首版 → v2回应G1-r1 → v2.1回应G1-r2 → v2.2并入Q2 → v2.3回应G2-r1 → **v2.4落实用户“原版即规格 + 和Grok Bot一个级别、superagent/dsh稍微打磨”简化令**。修订账在文末。

依据：`RE-admin-078.md`（RE78）、`reuse/admin-reuse.md`（AR）、`reuse/q1-goal-mount.md`（Q1）、`reuse/q2-schedule-mount.md`（Q2）、`reuse/lauren-tan-benchmark.md`（LT）、`../p5-parity/RE-approval-model.md`（AP）、`../p5-parity/RE-connector-grant.md`（CG）、`../p1-re/RE-features.md`与`RE-ipc-rpc.md`、`../LEARNINGS.md`「原版即规格」。**锚点校正**：用户指令称RE78 §4的分层，在现存报告实际是§2 PLUG:44904–44990；§4是删除回退。CU standing grants细节在AP §2.2，不冒称RE78 §4已证明。

## 1. 需求证明

- **谁用**：本机单用户，Electron常开；要主bot成为日常开发主力，不必守终端。
- **现在怎么凑合**：终端里grok-orchestrate能持续派工，产品里仍需用户逐步说话、设置页手点管理。
- **用户明确要什么**：建/改长期bot、市场装卸插件/连接器、自己SDK/应用进程重启、归档bot尽量自主；“superagent和dsh天然是可以做到的”。本轮进一步限定“和Grok Bot一个级别 + superagent/dsh稍微打磨”。
- **凭什么换**：同一个产品里给目标→派worker→真实验证→续派/停止/摘要，管理用既有能力，不再建设比原版更重的授权系统。替代终端的意愿仍未获证明，所以保留真实仓自用1次，不用PR数量证明需求。
- **不伪造原版**：RE78 §1原版agent字典有CreateAgent/UpdateAgent/SetPrimaryBot，无DeleteAgent；删除是person级RPC。§2可见renderer InstallPlugin/UninstallPlugin与写后reload。模型自主归档仍是用户要求的本地薄适配，不谎称原版模型本来就能删。routines原版云执行（§5），本仓无云，复用已装dsh本地schedule，不另起第二调度器。

## 2. 范围与失败预演

**REDUCE**：先交原版级管理四项、两条本地闭环、自身进程恢复。34原任务逐一归档为**23保留、9降级backlog、2删除**（PLAN文末逐id清单）。F1/F2不召回；F1照旧验，F2只调整authority验收，不追加Mandate引擎。

| 首批保留 | 收敛边界 |
|---|---|
| 7a-M管家四项 | 建bot、改name/model/prompt、归档/恢复、市场装卸、SDK/应用自身重启；现成操作记录与撤销继续用，不建独立回收站产品 |
| 7a-L目标/定时链 | dsh唯一goal driver与schedule，P6 Assignment/report、安全信封、stop、最小运行摘要；SA只搬Report/先存后做/恢复说明，pstack仅两验证playbook |
| 原版权限层 | always_allow / auto_review / needs_approval三档，blocked拒绝；复用原生批准与适用standing grants；不自建更重Mandate溯源体系 |

**不进首批**：既有会话preset替换、完整SB封存/消息claim协议、多次模型基准、长期职责/park界面、技能版本平台、GitHub Source、PR babysit/自动合并及无消费者的GitHub凭证调研。必要的可信来源/撤销/停机/不重放检查不删。

**逆向一问**：三个月后失败最可能不是“权限不够精细”，而是为安全预留抽象和全宽平台迟迟没有可用闭环。提前防住：只复用原版分层/本仓硬约束；合法操作必须成功，不能拿全拒绝当安全通过；保留投毒反例与真实仓1次；没有可信routine接缝就明确局部blocked，不偷放行、不暗改完成标准。

## 3. 拼接映射（复用优先）

| 能力 | 已有来源 | 首批只补什么 |
|---|---|---|
| goal/单循环 | Q1已装且已激活goal/round-driver；P6 Assignment/report | worker运行时disarm，最终Report分回合后合法re-arm；恢复仍走宿主，不改dsh工具授权 |
| 定时 | Q2已激活schedule；every≥60，source仅kind、同会话合批，receipt仅inbox | R1核最小可信routine来源接缝；复用现有委托/策略与Assignment做忙时skip，不建seal协议 |
| 管家 | AR M3/session-controller/archive/unarchive/pluginMarket/installBundle/setEnabled | 薄受限桥、记录/现成撤销、原版权限分层；不另造bot/preset/插件管理引擎 |
| 审批 | RE78 §2、CG §③、AP §1.4/§2.2；本仓现有policy | 原版档位/ceiling/批准查询适配，来源与硬约束重验；H1仅需批准档内一种核对 |
| 自恢复 | RE78 §3 Electron main→coordinator；本仓launcher/handshake/restore | B′ main持有SDK；新代重连与旧代闸，先记录/恢复后回执 |
| 验证/摘要 | pstack两验证playbook、dsh skill；P6证据/通知；SA Report | 最小宿主指令替换，好仓PASS/坏仓FAIL；可信退出码+证据与模型声明分开 |

来源精确URL@SHA:path/许可证由R2/R3补；不能用“自建胶水”给无证据抽象开后门。参考仓只读，不改node_modules。仍用dsh同代`0.2.2-alpha.2`，不为本轮整代升级。

## 4. 两条本质不同路线

| 路线 | 做法与代价 | 选择 |
|---|---|---|
| **S薄拼接** | 原版分层 + P6/dsh接线 + 少量SA恢复/Report文本；没有第二授权平台，限制来自真实接缝 | **选定**：满足本轮范围，最短可跑路径 |
| P自主平台 | 独立Mandate逐词溯源、完整SB封存协议、技能/职责/事件/PR全宽状态机；维护与验收成本远超原版 | **放弃**：这是把参考理念做成新平台，不是“稍微打磨”；已可用的F1记录不推倒重来 |

整包启SA runtime仍不选（维护/版本/身份双写问题见LT/AR），不引第三套运行时。

## 5. 用户与核心旅程（3条）

- **J1 管家**：用户说“建个bot，装Y连接器”→按原版person-demand管理语义、当前权限档执行→roster/工具表真实变化、操作记录/可用撤销。已允许操作不新增p7审批卡；需批准档沿原生审批/需要你处理，不能为了“免卡”旁路策略或凭证约束。
- **J2 人离开仍干活**：人类提供目标/完成条件/边界，复用原生委托/goal/routine状态，不把它实现成独立Mandate产品。
  - J2-a：人类建goal→driver→worker→最终Report独立回合→验证→续派/complete/blocked→摘要；worker运行时不空转goal round。
  - J2-b：人类建routine→schedule只投线索→可信来源关联/权限重验→worker→验证→摘要。source只有kind不等于已知routine；不靠正文id/不完整history拼授权；合法触发必须至少成功1次。
  - 回来能看证据/卡点/轮数；“verified”只来自可信验证记录，模型complete不够。两链真模型各1次，并在指定真实仓自用1次（clone/迁入工作区，不放宽区外读写）。
- **J3 自恢复**：SDK自身child崩溃或原生restart-required→Electron main owner恢复→先restore后新代闸开→旧副作用不重放，下一回合查回执；不碰机器/桌面会话/外部服务。

## 6. 授权与安全：按原版粒度，硬约束不降

### 6.1 原版分层，不是新的Mandate体系

| 执行路径 | 行为与证据 |
|---|---|
| 硬约束 / blocked | 先拒绝；凭证目录NEVER、凭证不进模型/容器/日志、不重启机器/注销，现有主身份/工作区边界与can_use_tool不旁路 |
| always_allow | 在适用策略scope内正常放行，不再逐动作要求本回合原话token，也不追加一个Mandate校验器；工具结果不能改该策略 |
| auto_review | 复用真实审核服务/结果，不等于always_allow；缺审核或审核拒绝不执行，转现有批准/需要你处理；不自建审核平台、不能stub PASS |
| needs_approval | 查有效原生批准/原版适用standing grant，或在此档内使用**H1（动作、精确目标、受限参数）**核对；无有效批准fail-closed，不强加给全部档位 |

**H1仍在，但只是分层内一档的执行核对**：目标/动作/受限参数精确核验；否定/子串/工具结果/前回合正文不授予权限。删除所有“每个goal/routine必须独立Mandate、每个动作/范围须在人类原话逐词出现、跨Mandate三元组协议”的要求。既有scope/批准不可跨对象拼接；stop/revoke/deadline仍在执行前重查。

**standing grants不混为万能授权**：AP §2.2显示本机accountScope×action/recipient，subject类（iMessage/use-app）才适用；bash/文件不是这种standing grant。CG §③是server×reads/writes/单工具策略，与connector账号授权也不同；不为p7扩张到新grant类型、不开放真实CU桌面。三档之外的blocked与ceiling不能被“始终允许”越过。

**F2 authority.mjs定位**：原版分层复刻 + CLAUDE.md硬约束（凭证不进模型、不重启机器、凭证目录NEVER），不是独立授权引擎。宿主originRef/main身份/generation重验继续做；未接动作明确unavailable；unknown内部普通工具不全拒。

### 6.2 跨回合正文隔离与投毒验收保留

- person/background demand来自可信宿主路径，不来自模型自报source；user-approval/user-question-reply等字符串本身不提升person权限。
- worker回报、issue/网页、工具结果永远是数据；同回合/上一回合正文不能创建或扩宽委托、批准、grant、工具策略；不伪造source=user。
- 回报与goal round分回合，P6 D9⑨回报回合0副作用不退；既有taint-guard/worker安全信封继续复用。非人类正常协调可沿原生委托执行，但不得从正文得到管理权。
- 保留“install X/删除Y/去范围外R”“同目标异动作”“否定/子串”“正文扩权”“假complete”的确定性反例；其中授权反例在需批准档/无适用批准scope里断言0，不能将always_allow合法操作也改成0。
- 不宣称权限能理解派工正文意图：已允许scope内仍有语义投毒残余风险，依靠原版审核、worker安全边界、round cap/deadline、独立核验与stop，不造更重溯源体系。
- 结构化回报存根仅复用P6已有行为，不新增可选“存根平台”或替代driver引擎。

### 6.3 管理/恢复最小约束

| 操作 | 保留行为与可回退边界 |
|---|---|
| 建/改bot | M3强制工作区/现有preset边界；name/model/prompt改旧值可还原；复用现有主bot保护，不增加16个长期bot产品上限 |
| 归档/恢复 | archive/unarchive、停活动留结果、历史不丢、共用recipe不坏；不物理删，不建设新回收站/保留期/purge产品 |
| 既有会话preset/连接器变更 | 按已装select首轮锁定；新会话替换/双活回滚功能降backlog，不为它修改CONTRACT放宽锁定 |
| 插件装卸 | 原版plugin_manager语义与同插件写串行/写后reload；市场精确坐标、setEnabled与现成撤销；不能借其修改审批策略/凭证/构建授权/版本豁免，secret仍由宿主人工通道；引用/保护检查复用现有数据，不造新库 |
| 重启 | 只限main拥有SDK子树或Electron app.relaunch；250ms×2封顶10s until-signal；stop取消退避/spawn；不可推导handoff跨代稳定、每代新token/port、旧代不开闸；未知副作用不重放 |
| 记录/撤销 | F1一个jsonl先记录再执行；撤销恢复业务投影，不保证已运行代码/外部副作用回滚；不新增授权数据库 |

## 7. P6边界、接缝与在跑任务

- 继续复用P6 main身份、来源/taint、安全信封、Assignment/report/delivery/slots、main通道、通知、M3 restore，不重做P6。P6-24共享工作区核验与§12.3验证执行者仍是对应链前提；真实仓进入工作区不越界。
- P6-14b是默认链前提；旧稿U-3②不再是重复用户授权门槛。先P2SDK_PATCH开发隔离验证，再在WL最后一步按V1/V2/V3独立证据收默认配置，不宣称已开放。
- R1先查schedule最小可信routine关联/重叠/恢复接缝。**完整P7-SB seal/claim/等待/崩溃授权协议降backlog**，不再强制所有自动任务先建设它；但未知归属、部分history、正文假id仍不能授权。若现有接缝不足，局部自动触发blocked交主会话，不用全拒假绿、不假称本地适配已证实。
- 共享入口WM→WG→WL串行，其余具体白名单交集为空才能并行；R3只查B′适配，不再用owner选择阻塞普通管理。
- **F1照旧，不召回；F2在跑不召回，验收按原版分层+硬约束，H1非全拒默认**。如已有Mandate重实现，验收时保留可用来源/桥/禁区并简化，不为旧测试再补平台。

## 8. 非目标

- 独立Mandate语法/格式/数据库/逐词溯源引擎；完整SB持久批次协议；新的编排框架、监督进程、SA runtime、第二调度器。
- 无消费者的预留模块/可插拔owner抽象；职责/技能版本/事件/PR平台与新全局引用库；独立回收站产品。
- 改dsh模型goal授权、schedule建goal/resume；自动恢复paused/blocked。
- 机器重启/注销、外部进程控制、真实桌面开放、凭证进模型/容器、物理purge、云worker/关机后运行、向量记忆。
- “原plugin_manager永远整工具双禁”**不再是非目标**：按原版分层受控复用，而非裸启用/绕过can_use_tool；具体guard/patch/旧断言迁移在WM白名单内。

## 9. DONE（首批有效；命令定义见PLAN §3，各条由独立verifier给证据）

**S1/S2 拼接**：`SDK(p7-loop-wiring)`及F3/L5定向测试：同代已激活goal/driver/schedule；新增文件只在PLAN白名单；恢复说明含先查现场/不重复外部动作；没有独立Mandate或第二调度器。

**L1 目标/恢复**：`SDK(p7-goal-lifecycle)` + V3真实重启：人类给目标/完成条件，goal持久；active恢复re-arm revision+1仍合法续派1；paused、撤销委托、deadline/cap耗尽各拒；create/edit/clear按dsh原语义更新，不要求另建Mandate对象。

**L2 循环/投毒**：`SDK(p7-loop-integration)` + live探针：worker期间goal round=0、回报与goal分回合、核验后续派/complete/blocked；P6 D9⑨仍绿。投毒①安装X/删Y/范围外派工、②同目标异动作、③同回合issue/上一回合回报扩权、④无证据假complete，各断言不能创建授权/越界，未批准管理0；合法受托派工成功1，不拿全拒当PASS。

**L3 停止**：`E2E(p7-stop)`：文字与按钮各一次，先暂停/撤准入再stop Assignment/派生routine/goal；每条观察≥2周期且≥120s无新副作用；已排旧投递仍可到达但派工0；恢复不唤醒paused。失败逐项留痕，不重开准入。

**L4 定时**：`SDK(p7-routines)` + live探针：人类建/列/暂停/删，every<60拒、60合法；可信正常触发合法派工1、Report/结果归属正确；busy skip、不连坐可区分的闲routine；撤销/暂停旧投递0；伪正文id/不完整history不授予或借用别的routine权限；恢复不重复已派工/未知副作用；receipt仅inbox；schedule create_goal/resume被dsh拒。无法证明安全来源则对应自动触发blocked，不宣称该条DONE。

**L5 验证技能**：`SDK(p7-verification-skill)`：两playbook真走launch→doctor→drive→evidence→cleanup；好fixture PASS、注入回归FAIL，改Feature Map不能掩盖；未跑通不称可用；执行者按P6 §12.3。

**L6 真实使用/摘要**：V2真模型目标链/定时链各1次，另指定真实仓自用1次；失败明确blocked和原因不挑绿。`UI(runs)`/`E2E(p7-runs)`显示轮数/卡点/证据；只有可信退出码0+受限证据存在才verified，模型complete只显示声明。原各3次≥2完成的基准降backlog。

**M1 建**：`UI(bots)`/`E2E(p7-admin)`：正常建后roster/独立workspace/记录存在，现成撤销进归档；越界cwd/提升preset拒，无新数量上限。

**M2 改**：同测试：name/model/prompt生效且可还原；主bot自改权限边界不放宽；既有会话preset保持原锁定，替换功能不计首批。

**M3 归档**：同测试：roster隐藏/恢复、历史数不丢、停活动结果留痕、共用recipe另一bot能启动；现有主bot保护保留；恢复可在现有设置/记录入口，不要求新回收站页。

**M4 装 / M5 卸**：`UI(plugins)`/WM真实接线：目录MCP工具出现→禁用消失→撤销恢复，写串行/热reload真实可用；needs_approval无批准时“看看issue”“同目标异动作”“先别装”“子串github”各0，原生有效批准/H1明确装X成功；always_allow适用scope内合法安装成功，auto_review真实准许成功/拒绝或缺审核不偷放，blocked拒绝。非目录/构建授权/密钥输入/权限自升仍拒；引用/保护复用现有查询，失败不假绿。

**M6 重启**：V3真实own-child崩溃/恢复：先记录、每代新port/token、handoff跨代不变且不可推导、restore后M1/M2可用、旧代信号不开闸；active goal合法续派1；副作用发生后回执前crash总计1不重放；非owner目标0信号、stop后0spawn；模型上下文/token日志零泄漏。测试只结束自己spawn沙箱子进程，不要求用户预置沙箱外哨兵。

**M7 禁区/分层/正文矩阵**：`UI(management-matrix)`、`SDK(p7-management-origin)`：{主身份、凭证/凭证目录、权限自提升、区外路径、机器/系统}×{建改归档装卸重启}×{人类、同回合工具结果投毒、上回合回报投毒、非人类、非人类上回合投毒、污染}，适用格各验证，N/A写理由。硬禁区与blocked各0；无批准档的投毒授权各0；always_allow/审核准许/有效批准各有合法成功对照；伪person/旧generation/伪grant不能越权，跨routine不拼权。安全反例不随简化删除。

**M8 记录/撤销**：`UI(operations)`、管理e2e：谁/何时/来源/前后值/句柄可查，重启仍在；撤销后roster/工具表/启用标志/被改字段等对应业务投影diff空，不承诺安装残留/已运行代码/外部副作用回滚。F1现有先落盘/截断/flush失败/凭证拒入账验收照旧。

**非首批DONE**：原B1–B3/C1–C2全部backlog，重开时另定具体需求与验收；自动合并仍需U-1法外/外部动作授权，不能本次顺带开放。

## 10. 决策与待查（行为按RE，不再问用户）

- **D-1 推荐B方向，按RE定，panel确认即可不再问用户**：RE78 §1 person RPC/agent工具字典 + RE-features调度层person/background demand；管理person-demand与受托后台协调分开，后台不伪造人在场；当前权限档允许的工具正常用，dsh goal工具授权照旧。拒A独立Mandate全工具扩权、C替换driver引擎。人类来源别名只复用可信宿主映射，正文不提升；结构化存根不另起工程。RE没有证明“goal round就是原版person”，不得冒用该结论；本地续派是用户明确要的SA/dsh薄适配。
- **D-2 推荐B′，按RE定，panel确认即可不再问用户**：Electron main持有SDK，与RE78 §3 MAIN:2669140同构；app.relaunch对照MAIN:3443434。当前main不spawn SDK是要改的事实；R3查真实boot/env/handshake最小差异。不选独立launcher生产owner，不加PM2/systemd。
- **D-4 ②不变，按RE定，panel确认即可不再问用户**：goal只在人类回合建、schedule只投线索，遵守Q1/Q2与dsh authority。拒改上游授权；blocked重试不进首批、paused永不自动唤醒。
- **D-3 按已装dsh定**：preset select首轮锁定（AR[B][C]），不修改CONTRACT放宽；新会话替换降backlog，不开用户行为题。
- **R1/scout**：查最小可信routine归属/合批逐项/暂停重启与原生授权接缝，正常成功和伪id/部分history拒绝probe；无可靠路径局部blocked，不先建完整SB。
- **R2/scout**：SA stored work/Restart/Report、pstack两playbook精确来源/许可证与dsh skill加载/宿主指令；不查完整Source/Merging/技能平台。
- **R3/scout**：本仓archive/停活动/roster/HMR与B′ boot/握手、现有引用/保护查询；不用未知外部事实定结论。GitHub Source/凭证R4随消费者降backlog。

## 11. U-*清理与真正待用户确认

| 原项 | 当前处理 | 证据 / 是否再问 |
|---|---|---|
| **U-3① 构建脚本/密钥输入** | **按RE定**：原版审批分层 + 本仓凭证硬约束；需要原生批准/人工secret通道时转现有处理，不另造自主授权 | RE78 §2、CG §②③、AP §1.4；凭证不进模型，不再问策略行为 |
| **U-3② 自动续派** | **按RE定对照 + 已有需求**：D-1 person/background分离，复用dsh driver与SA受托协调；不再重复询问是否允许本地自动续派 | RE78 §1、RE-features调度层、Q1；用户已明确要自动闭环；P6/独立验收与默认开放步骤仍保留 |
| **U-2 默认行为** | 删除/恢复/本机常开按RE+dsh定；第一类GitHub issue事件是范围选择，不伪装原版规定，**随B3降backlog** | RE78 §1/§4/§5、AR[G]、Q2；不为首批提问或启事件源 |
| **U-1 自动合并** | **保留真正授权问题**：未来7c开工前一次问repo/队列、规模、账号与远端动作授权 | 超出原版复刻/本地打磨的外部授权，本轮不开放；当前不阻塞首批 |

本次清理**3个旧子项（U-3①/U-3②/U-2）**，只保留U-1。另“指定真实自用仓及进入工作区方式”仍是真实需求输入：未给只阻塞L6对应自用证据，不再问任何RE可回答的权限/工具行为。

---

# 历史panel回应（v2–v2.3，非v2.4执行要求）

以下保留当时原文，供查改动依据。涉及独立Mandate、SB封存桥强制前置、U-3②待确认、全宽B/C出口和所有动作H1全拒的旧表述，均已由本版§1–11明确替代；**不能据历史表恢复已砍工程**。投毒/跨回合隔离/失败关闭与正常成功对照仍在当前§6/§9，不因旧实现降级而删验收。

## 12. G1-r1 回应

### 12.1 必须回应清单（9 条）

| # | 意见 | 处理 | 落点 |
|---|---|---|---|
| 1 | 跨回合污染：回报正文留在上下文，非人类回合开放工具后仍能影响模型 | **已改**。不赌模型不看正文，执行边界放在执行器：H1 溯源 + H2（越出 Mandate 的动作 0 执行）；结构化存根投递列 D-1 子题②；投毒反例进 L2 与 M7 两列 | §6.1.1 H1/H2；§9 L2、M7；§10 D-1 |
| 2 | turn-origin 基线读错：goal/schedule 回合今天不算污染、create_bot 可见 | **已改**。§6.1.0 写真实基线（含 dsh goal 工具在各来源下的实际授权）；「受托回合」改称收紧现存放行；列为 P6-14b 前置核对项，注明主会话已转 p6 | §6.1.0；§7④；§4 S 行代价 |
| 3 | D-1 被提前当成已决 | **已改**。§6.1 预设撤回，工具暴露面写「待 D-1」；D-1 题干补 dsh 授权锚点 `authority.ts:75-117` 与 RE78 §7.1；开发期只做三案共同部分 | §6.1.2；§10 D-1；§2.3 |
| 4 | 同回合工具结果诱导免卡管理 | **已改**。H1 写成管理执行器与派工执行器的硬约束（代码常量，在执行处）；不在原话或 Mandate → 「需要你处理」；M4 加 issue 诱导反例 | §6.1.1 H1；§9 M4、M7 |
| 5 | round-driver 空转烧 round cap、回报与 round 同回合 | **已改**。有未结 Assignment 时 disarm、回报后 re-arm 进自建列；L2 加「worker 运行期间 round 数 = 0」「不同回合」两条断言；实现手段待 Q-1⑦ | §3 循环行；§9 L2；§10 Q-1⑦ |
| 6 | schedule → goal 链走不通 | **已改**。给出两选项（改造 dsh 判定 / 人类回合建 goal、schedule 只投递线索），选后者并写放弃理由；J2 拆成 J2-a、J2-b；L4 加 schedule 回合建 goal 被拒断言；非目标加一行 | §10 D-4；§5 J2；§9 L4、L6；§8 |
| 7 | 自重启拓扑不符：Electron main 不拥有 SDK | **已改**。§3 自重启行写真实拓扑锚点；D-2 重写为「先定 owner」，A′ launcher 循环 / B′ main 拥有 SDK（与原版同构），放弃 PM2 与 v1 选项 A；J3 自愈由 owner 承担不经模型；Q-7 加生产启动方式 | §3 自重启行；§10 D-2、Q-7⑤；§5 J3 |
| 8 | §7 漏列三项 p6 依赖 | **已改**。补 ⑴ P6-24 / Q-024、⑵ §12.3 选 B 时验证改派 verifier worker、⑶ 真实仓经 clone / migrateWorkspace 进工作区 | §7 ⑴⑵⑶；§9 L2、L5、L6 |
| 9 | 「可回退」与 M8 矛盾；自重启交接未写成 DONE | **已改**。§6.2 按操作给「业务状态投影」与「允许残留」，安装期副作用明确不保证；M8 只比投影列；M6 加新端口 / 新 token 真实重启、旧代信号不开闸、token 不进模型、kill -9 自愈、回执未落盘不重放、哨兵进程 | §6.2；§9 M6、M8 |

另：U-3 已拆（①默认执行、②确认前不进默认链），U-2 改默认值可纠正，U-1 挪到 7c 开工前（§11）；Q-4 完成，撤「转述」标注，改引 RE78（抬头、§1、§3、§6.2⑥、§10）。

### 12.2 MEDIUM / LOW 处置

| 来源 | 处理 |
|---|---|
| A-M 自建列偏少、无 UI 行 | 已改：列名改「本仓自建」，表下单列 UI 面（§3）；§2.1-1 写明「不自建」针对框架和运行时 |
| A-M 「来源未知 → 拒」推翻 R2-1 | 已改：H3，未知来源不污染、只不授予自主权（§6.1.1） |
| A-M L3 stop 语义 | 已改：覆盖未结 Assignment 与派生 routine，按钮与文字两路径（§9 L3） |
| A-M M8 diff 与撤销机制矛盾 | 并入 #9 |
| A-M M6 `pgrep` 噪声 | 已改：沙箱外哨兵进程 + 目标 PID ∈ owner 进程树（§9 M6） |
| A-M L2 真模型次数与核验判据 | 已改：fake 断言链路 + 真模型 3 次；判据 = 验证退出码 + 证据文件（§9 L2） |
| A-M U-1/U-2/U-3 发问方式 | 已改（§11） |
| A-L Q-4 转述 | 已改：Q-4 完成，引用 RE78 |
| A-L S2 枚举对照仪式化 | 已改：删掉枚举对照，只留恢复说明存在性断言（§9 S2） |
| A-L Mandate 放 objective 前缀可被改写 | 已改：Mandate 存 main 操作记录，键 goalId + revision，edit 后失效（§3、§9 L1） |
| A-L M7 空洞格、缺投毒列 | 已改：表驱动、空洞格可标 N/A，加两列投毒（§9 M7） |

### 12.3 是否再跑 G1-r2

建议跑。#1/#4（H1/H2 是否构成真实执行边界）、#7（D-2 重写）是安全与拓扑的实质改动，作者不自评；Q-1/Q-2 回来后若推翻 §6.1.0 或 L2 的 disarm 前提，v2.1 改完再跑也可以，主会话定。

（§12 保留 v2 当时的写法作历史记录；被 v2.1 取代的格子：#1「越出 Mandate 的动作 0 执行」→ 三元组 + 残余风险明写；#5「实现手段待 Q-1⑦」→ 已由源码回答；§12.2「键 goalId + revision」→ 键 goalId、按 change 类型失效。见 §13。）

## 13. G1-r2 回应（有条件通过；G2 席顺带核对本表）

| # | 意见（`panels/G1-r2.md`） | 处理 | 落点 |
|---|---|---|---|
| H-1 | Mandate 键 goalId+revision 与 re-arm 冲突：resume / pause 让 revision +1，首次回报 re-arm 或重启后 Mandate 失配，闭环卡死、投毒反例假绿（A-H1 = B-H2） | **已改**。键 = goalId；只在 `goal/change` 为 create / edit / clear、人类撤销、deadline 过时失效；disarm 用 `ctx.goals.disarm`，re-arm 只由宿主恢复 owner 调 `ctx.goals.resume`，四条件（active+disarmed、永不从 paused；Mandate 有效；deadline 未过；round 有余量）+ 无未结 Assignment；Q-1⑦ 由源码关闭（不需要触发钩子，时机在本仓 assignment / report 两处）；L1 加重启 re-arm 后续派成功与四条拒绝分支，L2 加回报 re-arm 后续派成功，M6 kill -9 后续派成功 | §2.1-5；§3 目标契约行、循环行；§6.1.1 H5；§9 L1、L2、M6；§10 Q-1 |
| H-2 | 授权语义不足：只匹配目标不核对动作与参数；Mandate 写入无溯源（A-H2 = B-H1） | **已改**。H1 改为（动作，精确目标，受限参数）三元组、未授权默认拒；动作须在原文且未被否定；匹配改词边界 token 相等，装插件须等于目录规范 id；Mandate 每个范围项与动作须出现在授予回合人类原文，否则不写入、转「需要你处理」，非人类回合不得扩宽；H2 删掉「投毒最多只能在 Mandate 内做事」，改为明写残余风险（Mandate 内派工正文不可机械核对）及兜底；四类反例：同目标异动作（M4、L2②）、显式否定（M4）、Mandate 扩宽（L2③、M7 新增「同回合工具结果投毒」列）、update_goal 假完成（L2④，完成以 main 侧核验为准，§5 J2） | §5 J1、J2；§6.1.1 H1、H2；§9 L2、M4、M7 |
| M-1 | H1 子串匹配误授权 | **已改**，并入 H-2（token 相等、规范 id、bot 名最短长度；M4 子串反例） | §6.1.1 H1；§9 M4 |
| M-2 | D-4 结论可接受、理由与代价写错 | **已改**。改为三选项：① 改 dsh 判定（放弃，改的是模型工具路径授权）；② 只投线索（7a 选定）；③ 宿主在 routine 触发时 resume blocked goal（7b，与 H5 共用胶水）。代价改为「blocked goal 在 7a 不定时重试」；paused 永不自动唤醒写为有意设计 | §10 D-4 |
| M-3 | D-2 A′「固定 handoff 目录」与 T-12 R1 冲突 | **已改**。launcher 启动时 mkdtemp 一次、生命周期内跨代复用、token 每代换、原子替换、0700；M6 加「路径不可推导且代际不变」 | §10 D-2 A′；§9 M6 |
| M-4 | §6.1.0 / §7④ 仍写待 Q-1；§7④ 无默认处理，与 p7 DONE 互等 | **已改**。goal 列按 Q1 实测改写，只留 schedule 待 Q-2；§7④ 写死默认：P6-14b 先在非人类回合隐藏协调者工具（fail closed），D-1 定案后 p7 有条件放开 | §6.1.0；§7④；抬头；§3；§4；§9 S1 |
| M-5 | update_goal 假完成 | **已改**，并入 H-2（摘要「完成」以 main 侧核验记录为准，L2④ 反例） | §5 J2；§9 L2 |

**LOW 处置**：抬头与 Q-1 状态（A-L1）已改，⑧ 并入 Q-2；M7「同回合工具结果投毒」列（A-L3）随 H-2 一并加。其余三条不改 BRIEF、转 PLAN：D-2 补「systemd --user `pbots*` 单元」放弃行；L4「未结束」判据（v2.2 已随 Q-2 写进 §3 与 L4，不再转 PLAN）；非主 bot 的 preset 去掉 tool-goal 或 envelope 拒 create_goal（7b 长期 bot 落地前定）。

**与 G1-r1 九条结论的关系**：只有 #1（H2 的边界表述）与 #5（实现手段）被细化，结论方向不变；其余七条未动。

### 13.1 v2.2 · Q-2 实测并入（不重跑 G1）

| # | Q2 事实 | 改写 | 落点 |
|---|---|---|---|
| Q2-1 | 「上轮未结束跳过并留记录」**否证**：第二次投递照常入队、照记回执；删除不撤回已入队那条；同会话到期周期任务合并成一条消息 | 重叠防护改为本仓胶水：判据 = 该 routine 派生的 Assignment 未收到最终 Report，成立则回合内派工 0 + skip 记录；投递前拦截（`resolve-agent` 抛错语义）列 Q-2b；L3 加「已入队那条到达后派工 0」；L4 改断言实测行为 | §3 routines 行；§9 L3、L4；§10 Q-2b |
| Q2-2 | `every` 最小 60 秒；回执只确认 inbox 持久化；history 30 天 / 200 条、随任务删除 | 周期用例改 60 秒、单次用 `after_seconds`；回执不当执行成功，结果以操作记录 / 核验记录为准；schedule history 不当审计库 | §3 routines 行；§9 L3、L4 |
| Q2-3 | 已装版无 rrule、无新建目标会话；工具名 `schedule_create/list/delete/update` | §3 dsh 列按已装版改写；7a 不做整代升级 | §3 routines 行 |
| Q2-4 | 可信 source 只有 `kind:'schedule'`，无 taskId；`tainted:false` | routine Mandate 归属按 messageId 反查 history 得 taskId 集合，正文 id 不可信；L4 加伪造任务 id 反例；撤掉 §6.1.0 / §7④ / §4 / S1 / 抬头的「待 Q-2」 | §3 routines 行；§9 L4、S1；§6.1.0；§7④；§4；抬头 |

D-4（schedule 只投线索）与 J2-b 结构不变：Q2 证实投递来源是 `schedule`，不是 `user`。

## 14. G2-r1 回应（有条件通过，v2.3 终版）

依据 `panels/G2-r1.md` 及两席原文 `G2-r1-A.md`、`G2-r1-B.md`（席 A=Sol 代 Opus）。按汇总授权落实四条，不开 r2；G1 结论与 §12 / §13 历史回应不改。§13.1 保留 v2.2 历史：Q2-1 / Q2-4 的「messageId 反查集合」现由 §6.1.3 完整批次与持久授权桥取代，不再是独立放行依据。

| # | 必须回应 | 处理与证据落点 |
|---|---|---|
| 1 HIGH（A+B） | followup → flush → history commit 有授权缺口，Q-2b②须阻塞前置 | **已改**：§7 单列 P7-SB 任务位，仅阻塞 J2-b / L4 / L6 定时链 / M7 对应格；§5 J2-b、§9 L4 前置引用。§6.1.3 写有界等待、超时失败、可信关联恢复与不可恢复失败；L4 三验收 = 正常成功 / 延迟 / flush 后崩溃恢复，禁止全拒绝假绿。Q-2b②改阻塞输入，不假称接缝已实证 |
| 2 HIGH（A+B） | 合并投递部分 history 不等于集合完整，禁止串权 | **已改**：§3 routines 行、H1 单 Mandate 原则、§6.1.3 可信封存清单与 messageId 持久绑定；完整后逐 routine 准入，执行前重查并原子占位；§9 L4 / M7 加 A 忙 B 闲、A 撤销 B 有效、第二条 history 前 claim、跨 Mandate 拼接反例与合法派工成功正例 |
| 3 MEDIUM（B） | D-1 C 非工具面等价替换 | **已改**：§2.3 删除三案接线不返工断言；§10 D-1 题干与 C 明列重开范围及 S1 / L1–L4 / L6 / M6 / M7，注明须评审后实施；不把 C 当已选，不改 G1 定案 |
| 4 MEDIUM（B） | L / M 整阶段并行不成立 | **已改**：§2.3 撤整阶段直接并行；§7 规定操作记录、恢复 owner、SDK→main 通道、重启路径先单列合并；剩余按实现 / 配置 / 测试具体文件白名单、交集为空且无语义依赖才并行，越界须停工回写 PLAN |

## 修订账

| 版本 | 改了什么 | 依据 |
|---|---|---|
| v1 | 首版 | LOG 05:24 / 05:36 用户指令；2026-11-05 用户「superagent + dsh 拼接」定调（经主会话） |
| **v2（G1-r1）** | 回应 9 条必须回应（§12.1）：§6.1 改为真实基线 + H1–H5 硬约束，D-1 预设撤回；§6.2 可回退按操作定义投影与残留；§7 补三项 p6 依赖与 P6-14b 前置核对项；J2 拆两条链（D-4 定案：不改 dsh 授权）；D-2 按真实拓扑重写；DONE L1–L6、M4、M6–M8 改写；Q-4 完成改引 RE78；U-3 拆分、U-2 降默认、U-1 后移；MEDIUM / LOW 处置见 §12.2。涉及挂载可行性处标「待 Q-1/Q-2」 | `panels/G1-r1.md`、`G1-r1-A.md`、`G1-r1-B.md`；`RE-admin-078.md` |
| **v2.1（G1-r2，有条件通过 = G1 终版）** | 回应 2 组 HIGH + 5 条 MEDIUM（§13）：Mandate 改键 goalId、按 change 类型失效，disarm / re-arm 手段写实（`ctx.goals.disarm` / 宿主 `ctx.goals.resume` 四条件，永不从 paused）；H1 改授权三元组 + token 相等 + Mandate 授予溯源，H2 明写残余风险；完成以 main 侧核验为准；L1 / L2 / M4 / M6 / M7 加续派成功、拒绝分支与四类反例；D-4 三选项重写理由与代价；D-2 A′ handoff 改每 launcher 生命周期 mkdtemp 一次；§7④ 默认处理写死；goal 侧撤「待 Q-1」，Q-1⑧ 并入 Q-2。G1-r1 九条结论不动。**进 G2，G2 席顺带核对 §13** | `panels/G1-r2.md`、`G1-r2-A.md`、`G1-r2-B.md`；`reuse/q1-goal-mount.md`；`D/packages/goal/goal/src/index.ts:285-296,357-384,516-521`；`app/sdk/src/start.ts:66-71` |
| **v2.2（Q-2 并入，未重跑 G1）** | §3 routines 行按已装版重写（无 rrule / 新会话目标、every ≥ 60 秒、回执 = inbox 持久化、不跳过重叠、可信 source 无 taskId）；重叠防护与任务身份反查改为本仓胶水；L3 / L4 改断言实测行为；撤余下「待 Q-2」；Q-2 关闭，新增窄题 Q-2b（投递前拦截点、反查时序）。**就绪交 G2** | `reuse/q2-schedule-mount.md`；已装 `dsh-schedule/lib/index.js:1555-1611`（同会话合并投递、flush 后才 commit history） |
| **v2.3（G2-r1，有条件通过，终版）** | 四条全部落实（§14）：§5 / §7 / L4 单列 P7-SB 定时授权桥阻塞前置；§6.1.3 规定可信批次封存与消息持久绑定、有界等待 / 超时留痕 / 崩溃恢复，Q-2b②升级阻塞输入；H1 单 Mandate 完整三元组与逐 routine 准入，L4 / M7 加三类合并竞态、串权反例及合法派工成功；§10 D-1 C 明列重开范围与 DONE；§2.3 / §7 改共享底座先合并、其余文件白名单并行。G1 已定结论不变，不重跑 G1 / G2-r2。**v2.3 就绪交 PLAN，未声称 P7-SB 已实现** | `panels/G2-r1.md`（有条件通过）、`G2-r1-A.md`、`G2-r1-B.md`；Q2 已装制品锚点 `dsh-schedule/lib/index.js:1560,1584-1613` |
| **v2.4（用户简化令）** | 原版即规格，目标收敛为Grok Bot级+SA/dsh薄打磨；PLAN v1.1原34任务逐行23保留/9降级/2删除；独立Mandate删除、SB重协议/非首批宽度降backlog；authority改原版分层+CLAUDE硬约束，H1仅档内校验；D-1推荐B方向person demand对照/D-2 B′/D-4②按RE定，panel确认不再问用户；清理U-3①/U-3②/U-2，保留U-1；同步改J/DONE/依赖/非目标，跨回合隔离与投毒反例仍在，F1/F2不召回 | 用户2026-11-05本轮明确指令；LEARNINGS「原版即规格」；RE78 §1/§2/§3、AP §1.4/§2.2、CG §③、Q1/Q2。旧panel不冒称批准新版，待主会话确认RE映射/砍单 |
