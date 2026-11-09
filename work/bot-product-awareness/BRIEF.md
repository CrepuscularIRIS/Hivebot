# BRIEF：bot 的产品生态认知（2026-11-08 01:4x）

## 用户原话
> 他看不到其他的bot, 我说创建其他的bot他都不知道, dsh的superagent也不知道在哪里

（用户在真实产品实例中与主 bot 对话时发现——01:3x，实例刚重启后测试）

## 现象拆解（三条）
1. **bot 看不到其他 bot**：侧栏的模板 bot/其他 bot 对 AI 不可见——它不知道自己运行在多 bot 环境里，也不知道有哪些同伴
2. **bot 不知道怎么创建 bot**：用户对 bot 说「创建一个新的 bot」，bot 无从知道产品面有「New → 创建对话框」这条路径，也无法代用户创建
3. **superagent 缺位**：dsh 的 subagent/编排能力（0.18 生态的 superagent 概念）在 bot 侧既无工具也无认知——与 T27（用户编排研究：跨 bot 交流/subagent 呈现）直接相关

## 初步定位（待经理探针核实）
- 主 bot 的系统提示是 dsh 通用 agent 提示，**未注入 hivebot 产品生态**（多 bot/侧栏/创建路径/模板/superagent）
- kickstartPrompt（T25）只管新 bot 自我介绍，不含产品认知
- T27 编排研究等用户结论——本 BRIEF 第 3 条是 T27 的输入之一

## 期望
用户能与 bot 用自然语言完成「看看其他 bot / 建一个新 bot / 调 superagent」，bot 要么知道并指路，要么有工具能做。

## 2026-11-08 05:4x 追加：SuperAgent 架构重定义（用户，T27 方向输入）
> superagent不是说我们让他创建一个subagent,他就去做的. bot的定义是superagent的边界与dsh本身的其他小bot之间的. 注意dsh之间, superagent非之间, superagent理解为一种心流状态的编排 …因为现在是superagent是一个非常复杂的主工作员工. 而其他的bot是简单员工. bot之间的信息应该流通于superagent的main agent与其他的dsh的main agent之间才对. 而不是superagent本身的编排系统. 因为很可能是独立的. 或者还有一个思路, 就是dsh本身作为bot, superagent创建的几个worker和router机制, 这个本身是否和dsh一致? 就是现在是两种编排系统.

**要点**：
1. SuperAgent ≠ 主 bot 内部的编排工具（create_bot 那套）——是横跨 bot 的「心流状态编排」层
2. bot = 独立 DSH 实例（各有自己的 main agent，简单员工）；SuperAgent = 复杂主协调员工
3. bot 间信息流：SuperAgent.main ↔ 各 DSH.main **对等通信**，不经 superagent 内部编排系统
4. 疑问：现状两种编排系统（T34 orchestration 插件 vs dsh 原生 subagent）是否同构、如何统一

## 2026-11-08 06:0x 二次澄清（用户，定案）：不改架构，是术语与显示
> 不用修改架构, 是目前的架构, bot是额外的创建, 而主agent的叫做worker或者subagent 我们需要把subagent显示出来, 这个是worker, 架构1是对等, 但是bot的定义出错了.

**定案**：
1. 架构不动（T34 现有形态正确）
2. **术语**：bot=用户额外创建的独立 DSH 会话（各有 main agent，bot 间对等通信=SuperAgent.main↔各 bot.main）；主 agent 内部派生的=**worker（即 subagent）**——create_bot 建出来的不叫 bot
3. **显示**：dsh 原生 subagent 目前隐藏（不进侧栏）——要显示出来归入 Workers 分组（=worker）——两种编排系统在**呈现层统一**

## 2026-11-08 06:1x 三次补充（用户）：显示范围收窄
> 其他的bot的subagent不用显示, 就是主agent的subagent可以显示.

**约束**：仅主 agent（mainBotId）的 subagent 显示进 Workers 分组；其他 bot 的 helper 不显示（过滤=origin==='subagent' 且 parentSession===mainBotId）。
