# P5-53 对照台 run summary

- 时间：2026-11-03T23:52:38.822Z（238s）
- 左（REF）：/dev/shm/grok-re/0.78.1/app/dist/renderer
- 右（OURS）：/tmp/bot-p55/ours-dist
- 拼图：10 张（pairs/）
- U1′ 差异行：2558（u1-diff.tsv / .md）
- app-vs-ref 处置：{"waived:computed-equiv":10,"waived:data":16,"waived:subpixel":12,"waived:arch":40,"waived:fixture":12}（u1-appref.tsv，open = 可行动）
- persona 抽帧：264/264（persona/<state>/<shape>-<color>.png）
- 验收判定：PASS（两侧同 fixture 完成渲染，boundary=0）
- issue：conv-rest.ref: tool 行在桩下不渲染（R3 已提交 harness 同样复现，非对照台回归；v3 是静默丢行不是渲染报错）