# P5-53 对照台 run summary

- 时间：2026-11-03T19:06:18.603Z（238s）
- 左（REF）：/dev/shm/grok-re/0.78.1/app/dist/renderer
- 右（OURS）：/tmp/bot-s0-build/.build/frontend-shell
- 拼图：10 张（pairs/）
- U1′ 差异行：1142（u1-diff.tsv / .md）
- persona 抽帧：264/264（persona/<state>/<shape>-<color>.png）
- 验收判定：PASS（两侧同 fixture 完成渲染，boundary=0）
- issue：conv-rest.ref: tool 行在桩下不渲染（R3 已提交 harness 同样复现，非对照台回归；v3 是静默丢行不是渲染报错）