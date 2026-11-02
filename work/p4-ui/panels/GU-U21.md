# GU-U21 · P-A+P-B（panel 汇总，1 轮终局）

| 席 | 模型 | 结论 | 置信 | 原文 |
|---|---|---|---|---|
| A | Opus 5.5 | PASS | medium | [GU-U21-A.md](GU-U21-A.md) |
| C | 6.1 Sol | REVISE | high | [GU-U21-C.md](GU-U21-C.md) |

**结论：REVISE（GU 用 A+C，任一 REVISE 即 REVISE；只跑 1 轮）。** 视觉/交互/D9 两席均通过；REVISE 项全部归 U-22 收口：
1. [A-HIGH/GU 汇总] m1-api `await deps.dsh.rpc` 无 try/catch——抛错致界面层失败（两 FIX 同源 + verifier 未记的 loadRoster/start 卡死）→ main 侧转 {ok:false,pbots/unavailable} + api() 兜底 + 注入抛错 E2E。
2. [C-M=FIX-M] 断线丢草稿 + 覆盖新输入（send 先清草稿只处理 !res.ok）。
3. [C-L=FIX-L/GU] 永久停止态（cancelTurn reject 后 stopping 无复位）。
4. [A-M] 断线重连后不重拉 bot 列表（未打开 bot 恒显回复中）。
5. [C-M] VERIFY-U-21.md 补交——已由主会话重建（2026-11-02 15:35）。
