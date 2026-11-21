# REPORT · P5-56 bot 动画验收（U3′）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-56 @ 4e3329a（基 934c58b），3 文件（shim agents.ts + 单测 + 新 e2e grok-persona.spec），上游树 diff=0。

## ① 映射全覆盖（对照 R4 工具表 × 原版 sand-activity）
补齐：subagent/subagent_fork/workflow→orbit(Task)、send_message→sending(SendToAgent)；bash 改原版 {kind:'tool',tool:Shell} 形状。另修两处：并行工具取仍在 running 的（原只看最后一个）；只看本回合（倒序遇 user 停，防前回合未收尾 running 串入）。审批挂起=原版无 awaiting 态：persona idle + 侧栏 Needs attention（e2e 证传递+作答归 0）。ask_user_question 未覆盖（归提问 UI 任务）。

## ② U3′ e2e（3 连绿）
逐态 thinking→审批 idle+needs-attention→working→searching→idle（侧栏+会话头双断言）；正对照（未降级两帧不同）；同 HOME 重启形状颜色不变；reduced-motion：data-reduced-motion=true+transform 两帧同+像素帧差 0（Buffer.compare=0）；注意上游只在渲染/effect 启动读一次 matchMedia（原版行为未改）。单测 14 工具逐项+并行/跨回合/审批/结束。

## ③ 对照台一致性
9 帧（3 bot×3 态）vs evidence/compare/persona：主色 ΔRGB≤2、轮廓差≤2%，9/9 一致。

## 全量
vitest 362 绿；e2e 63 绿 3 红=基线（d4d5d6/market=P5-21.f1 在修；**grok-shim 稳定红非 flake**：touch /tmp/bot-p551-ws-*/p551-ok ENOENT——沙箱看不到 /tmp 下会话工作区，疑 tmpfs 遮 /tmp 后工作区未重 bind 或 cwd 不对 → 立 P5-51.f2）。
