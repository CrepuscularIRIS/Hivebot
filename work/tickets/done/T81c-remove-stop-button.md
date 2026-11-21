# T81c：删 chat-header Stop 按钮（Q-059=A）

> 开单：manager 补记（主 agent 按机械小改直接施工，原无单文件）| 日期：2026-11-14 | 施工：main (GLM 5.3)
> 分支 / 作业目录：feat/T81c @ /tmp/bot-wt/T81c
> claimed：cada13ea
> accepted：2026-11-14 cada13ea（manager 任务 B：session+t81a 5 passed 26.3s）

## 目标
原版桌面聊天无停止入口（RE-STOP-0.78.1），叫停 = 运行中再发消息 supersede（T81a 已合并）。删 P5-57 的 StopButton。

## 范围
chat-header.tsx、p5-57.css、tests/e2e/session.spec.ts（3 文件，-36/+4）。

## 验收
`cd app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/session.spec.ts tests/e2e/t81a-supersede.spec.ts` → 5 passed

## 经理裁决
session.spec P5-57 打断段删除可接受：t81a-supersede.spec 断言 turn1 endReason 含 `"kind":"aborted"`、半截保留、turn2 回复到达，覆盖「打断 + 继续」；Stop 钮的失败复位分支随钮一起消失，无需替代。遗留小瑕疵（不返修）：chat-header.tsx 文件头 P5-57 注释仍写「trailing 槽改放停止」，下次碰该文件时顺手删。
