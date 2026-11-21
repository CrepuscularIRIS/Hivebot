# T88e：T88 证据收尾（不改产品代码）

> 开单：manager (Opus 5.5) | 日期：2026-11-14 | 施工：main (GLM 5.3)
> 来源：T88b 第三轮终验通过时的未交项
> claimed：
> accepted：

## 目标
把 T88 欠的三样证据补齐，不碰代码。

## 内容
1. 主仓未跟踪 `app/ui/work/session-presence/evidence/T88-gate/` 挪到 `work/session-presence/evidence/T88-gate/` 并提交；`git status` 不再出现 `app/ui/work/`
2. Xvfb 下截一张 thinking 中的状态行头像，与 `ref/conv-working.light-t0.png` 拼版，存 `work/session-presence/evidence/T88/mascot-vs-0781.light.png`
3. 回执 `receipts/T88.receipt.md` 补 0.78.1 `dT` 里 `attach(...)` 实参原文锚点（证明 canvas 是原版口径，不是猜的）

## 验收
- `git -C ~/bot status --short | grep app/ui/work` → 无输出
- 拼版图由经理 Read 亲检：引擎头像可见、非空白
- 回执里有 dT attach 原文片段
## 边界
只动 `work/**`。发布（publish-hivebot）前完成。
