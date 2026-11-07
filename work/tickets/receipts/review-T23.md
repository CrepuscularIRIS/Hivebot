# Review · T23（reviewer 6.1 Sol，2026-11-07）

范围：3351094a..072b9cdc。结论：HIGH 0 / MEDIUM 3 / LOW 1 → 已由主 agent 修复并回归（见末行）。

| 严重度 | 位置 | 问题 | 修复 |
|---|---|---|---|
| MEDIUM | status-line.ts:105-114 | elapsed 首次唤醒未排：活动稳定且无外部重绘时 60s 到点不出现 1m（thinking@0 的 nextWakeMs 为 null） | nextWakeMs 加未满 60s 候选 shownAt+60000；补格断言 begin(thinking,0)→60000、working 静默期取 min(5000,60000) |
| MEDIUM | status-line.ts:73-82 | 活动回到当前显示类不清旧排队：thinking→Shell→thinking 后 t=800 错显 Shell、真 thinking 被排到 1600 | sameKind 分支返回 `{...state, activity, queued: null}`；补 A→B→A 格 |
| MEDIUM | transcript.tsx:39-55 | 退场 140ms 窗口内恢复运行不取消退场：data-exiting 残留、旧退场定时器仍清空状态（假时钟探针复现） | running 分支 `b.exitUntil = null` |
| LOW | transcript.tsx:76 | elapsed 缺规格的 `· ` 分隔符 | 渲染 `· {out.elapsed}` |

NOTE（测试咬合）：「仅泛 working 静默结束后每 5s 轮换」变异在原 10 格下仍全绿——b 格只测 thinking、f 格止于首次揭示。补格：working 揭示后长期不轮换（5000/10000/15000/30000/600000 恒同句）。
NOTE（边界）：shot-statusline.spec.ts 不在工单白名单（截图脚本为验收 6 必要产物——回执「仅边界文件」措辞已修正）；覆盖率 ≥90% 无机器证据（工具链路问题），手算不能认定达标——经理定夺。
实测（reviewer）：unit 47/47、e2e 4/4、切换间隔 834ms、check diff=0；React 19.2.1 StrictMode 未发现重抽/复活问题。复现材料 /tmp/bot-T23t/review-*。

修复后回归：status-line unit **13 passed**（+3 格）；e2e status-line **4 passed**；grok-shim+fold **197 passed**。
