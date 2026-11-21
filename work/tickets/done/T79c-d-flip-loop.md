# T79c d：More 菜单翻转判据改成与翻转状态无关（c 引入渲染进程死循环）

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：T79c c 验收不过（`open/T79c-c-menu-flip-spec-teeth.md` 末段）；按任务 C 重规划——菜单件已失败两次（T79c 出界、c 卡死）
> 分支 / 作业目录：feat/T79c @ /tmp/bot-wt/T79c（续）
> claimed：
> accepted：2026-11-16 feat/T79c @ 062e0924（经理任务 B；T79c 链按 d 退路收口——只交 jump 钮+未读 pill，菜单件撤并入 queue 18s）

## 目标
首条消息开 More 菜单不卡死、看得见、点得到；其它行行为不变。

## 根因
`transcript.tsx` MO 内 `out = menuEl.top < scrollerTop + 8`——menu.top 随 no-flip 类变化，class 变化又触发 MO（attributeFilter 含 class）→ 死循环。

## 修法（定死，不再选型）
判据改用**不受翻转影响的量**：anchor 自身 rect 和菜单高度。
`out = anchor.getBoundingClientRect().top - 34 - 34 - menuEl.getBoundingClientRect().height < scrollerTop + 8`（34 = 条上移量 / 菜单相对条偏移，按 css 实值取，写成常量）。
`classList.toggle(cls, force)` 状态不变时不写属性，不会再触发 MO；仍建议 `if (anchor.classList.contains(cls) !== out)` 再改，读起来明确。

## 边界
1. 只动 `overrides/modules/transcript.tsx` 的 c 段、`tests/e2e/t79c-overlay-positions.spec.ts`。css 不动。
2. 先写失败测试：spec「首行」段改成**第一个带 More 钮的 `.sand-transcript-row`**（就是用户第一条，不是第一个 assistant 行）；点钮用 `evaluate(b => setTimeout(() => b.click(), 0))`，随后 `Promise.race` 一个 2s 超时断言页面仍响应（照抄 /tmp/mgr-t79c-probe/osc.spec.ts）；再断言菜单界内 + 中心命中 + anchor 带 `t79c-no-flip`。在 1b27dced 产物上跑必须红（卡死）。
3. 回执写清「先红」原样输出。

## 验收
1. `cd /tmp/bot-wt/T79c/app/ui && PATH="$PWD/node_modules/.bin:$PATH" sh scripts/run-e2e.sh t79c-overlay-positions.spec.ts` ×2 → 1 passed ×2
2. 回归 `sh scripts/run-e2e.sh t91-reaction.spec.ts t85-scroll.spec.ts t81a-supersede.spec.ts` → 4 passed
3. 回执贴 1b27dced 上新 spec 的红（卡死/超时）
4. spec 内拍首行菜单 `evidence/T79c/menu-top.{light,dark}.png`

## 失败预案（预先定好，免第三轮）
d 再不过 → 不再修菜单：撤掉 T79c 的菜单上移 css 两条 + MO 翻转段（回到 T79c 前基线），T79c 只交 jump 钮 + 未读 pill；菜单落点并入 queue 18s（带碰撞翻转的浮层）。

## 为什么这样验收
c 的 spec 绿是因为测错了行。这次测试必须落在真正会翻转的那一行上，并且直接断言「页面没卡死」——卡死是比出界严重得多的故障。

## 验收记录（经理 2026-11-16 · HEAD 062e0924）：通过（退路已执行）

- 施工方先按修法做：死循环解了（alive 断言过），但首行菜单界内仍不过 → 按本单预案执行退路：撤菜单上移 css 两条 + transcript.tsx c/d 翻转段 + spec 菜单段。
- 改动范围 f5b452f0..062e0924 只剩 transcript.tsx（hasUnread/scrollHeight 差，+11）、p5-55 尾段（jump 钮 bottom:8px + 说明注释）、t79c spec；产物 05:14 构建，override css 与 js 均无 `top:-34px`/`t79c-no-flip` 残留。
- 复跑：t79c spec ×2 → 1 passed ×2；t91/t85(2)/t81a/t79a → 5 passed。
- 反例的牙：②（滚离后 class 切换）③（6×24px 分帧 120ms）与 Sol 在 98c82311 产物上跑红的探针（/tmp/t79c-review-probe/probe.spec.ts:23、:39）同条件，旧 distance 版必红；经理探针确认新判据下 ②null ③true。
- 截图亲检 evidence/T79c/overlay.{light,dark}.png：New messages pill 贴输入框上方约 8px，亮暗都在，不盖正文。
- 已知遗留：More 菜单仍盖下一条气泡（= T79c 前基线，P1-1 未修）→ queue 18s；hover 条压 notice 行文字 → 18m 已记。
