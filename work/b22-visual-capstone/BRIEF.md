# B22 视觉收官轮：B18–B21 新面基准图组

日期：2026-11-18
来源：goal-b692ec66 复刻总目标收官段（REQ-1.1.0-PARITY §5 最后一项「视觉打磨收官轮」）。

## 背景

- B1–B21 廿一批全合并。T58–T68 时代已完成细粒度视觉对齐（hairline/composer 四态/市场浮层/气泡 11 色），Q-063 结论「对齐目标版本维持 0.78.1」。
- B18–B21 新面（General 新行/Tasks 岛/看板/分页 older 状态行）未进视觉巡检覆盖——b11-visual-tour spec 只截三张（chat-feedback/outline/agent-settings）。
- 0.78.1 无存量参考截图（harness 全静态文本分析）；B11 基准=我方自身多面全开图组，人工审阅用。

## 目标（本批范围）

1. 扩 b11-visual-tour 或新增 spec：覆盖 ①General 设置面全行（Theme/Language/Spell check/通知音/硬件加速/Security Key）②Tasks 岛侧栏行+看板空态 ③transcript older 状态行（loading/failed）④composer 常态。
2. 产出到 work/grok110-parity/evidence/b22-visual-capstone/（跑完拷贝，evidence 目录进 git）。
3. 人工审阅清单：与 0.78.1 RE 锚（UI-LAYOUT/UI-FACES 表）不冲突即过。

## 非目标

- 不重做像素级 diff 工具（0.78.1 无参考图组，拉真 app 截图需登录墙，成本超单批）。
- 不改产品代码——纯 evidence 采集批次（除非审阅发现真 bug 开修复单）。

## 验收

- e2e b22 spec 过，图组 ≥6 张入 evidence。
- 台账 B22 行 ✅，LOG 记录，HANDOFF 候选清空（总目标收官段完成）。
