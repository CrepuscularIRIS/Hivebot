# B30 真机运行时逆向（已登录 0.78.1）

## 用户原话（2026-11-18 12:07）
「你现在打开的是最新的Grok Bot. 现在的目标是逆向这个Grok Bot, 然后UI直接逆向, 剩下的后端逻辑,我记得和UI是可以推测出来的, 比如computer use, 电脑控制等等, 这个Grok Bot可以逆向出来, 猜测出来很多预设的能力. 然后我们也可以截取数据, 目前Grok Bot我已经登录了, 这个对后续的开发是比较友好的. 然后回到后端, 推荐使用开源的DSH和DSH SuperAgent, 这两个可以更新. 推荐SuperAgent作为Grok Bot的主bot, 剩下的是副手Bot. 然后很多功能都是可行的.」

## 解读（目标拆解）
1. **真机运行时 RE**：app 已由用户登录（userData=/home/lingxufeng/.config/Grok Bot）——登录墙解除，可做：
   - CDP 接入（relaunch --remote-debugging-port，登录态在磁盘持久）
   - 网络契约抓取（xAI API 面：endpoint/method/形状——token 值绝不进模型/仓库）
   - 真机 UI 全状态截图（比静态 bundle 挤出强一个量级）
2. **后端能力推测**：从 UI+流量推 computer use（电脑控制）、预设 bot 能力（marketplace/featured bots 的能力描述符）
3. **DSH/SuperAgent 架构适配**：SuperAgent=主 bot，其余 DSH 实例=副手 bot

## 硬约束
- 凭证（cookie/token）不进模型上下文、不进 git
- 只在自己 user-data-dir 副本/同盘上操作；不外发数据
- 机器在 GPU 训练（load 盯着）

## 前情（已完成勿重做）
- 静态 RE 已 22+ 批（B1–B29）：UI 结构/i18n/RPC 契约名全在 work/grok-1.1.0-re/ + work/b23-ui-full-re/LEDGER.md
- 本批是增量：真机动态数据（登录后才能看到的面+真实流量）
