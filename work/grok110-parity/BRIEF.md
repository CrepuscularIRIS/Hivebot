# Grok Bot 1.1.0 一比一复刻（DSH + SuperAgent 架构映射）

## 用户原话

- 2026-11-17（m00692）：「目前进度是什么? 比较乱. 我们看看后续的方法. 其实就是一个内容, 我们可以重新编排这个流程. 将Grok Bot所有的功能先调研出来. 然后REA一下目前的Grok Bot最新版本的deb文件. 然后我们1比1复刻到HiveBot. 可以做到吗? 没有必要完全按照这个T多少多少进行开发」
- 2026-11-17（m00716）：「认可, 开始开发即可. 你看看REA是否在你的插件下面. 然后我们应该已经安装了superpowers, ponytail规则, 以及REA. 可以继续开发了」
- 2026-11-17（m00720）：「其实就一个目标, 先从superpowers去列方案会好一些. 目前的代码仓库很乱. 正好整理一下. 然后目前就是1.1.0. 基于DSH和DSH Superagent去复刻. Superagent对应Grok Bot的主Bot, DSH则是默认的每一个独立的bot. 我们切入1.1.0版本. 然后后端我们把一些都加入计划.」

## 目标（用户已拍板）

1. **唯一目标**：Grok Bot 1.1.0 一比一复刻到 HiveBot（C 端可用水准）。
2. **架构映射**：SuperAgent（dsh-superagent 编排骨架）= Grok Bot 的主 bot（Chief of Staff）；DSH = 每个独立 bot 的运行时。
3. **版本切换**：对齐目标从 0.78.1 切到 1.1.0（旧面锚点不返工，新面按 1.1.0 做）。
4. **后端纳入**：后端能力（ssh 远程、定时、vault、连接器等）全部进计划，不只做 UI 壳。
5. **仓库整理**：借机清理乱仓库。
6. **流程**：用 superpowers 技能链出方案（brainstorming → 设计文档 → writing-plans），不再由 T 单编号驱动。

## 现状底料（已有，不重做）

- 1.1.0 deb 解包 + MIGRATION-DELTA（2600 锚点仅 ~20 消失；新面：tasks/spotlight/反馈/per-tool 权限/Data sharing/手机 iMessage/购物出行卡）。
- 0.78.1 覆盖矩阵 RE-COVERAGE-MAP（A–J 域、九大零覆盖簇）。
- p6 已搬 SuperAgent 编排大部分（P6-14b 开闸未完）；p9 BRIEF 有 Lauren Tan 八条用法映射表。
- 稳定基线四批已闭环（T100b 链，待经理终验）。
