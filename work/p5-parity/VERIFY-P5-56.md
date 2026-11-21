# VERIFY · P5-56 bot 动画验收（U3′）

verdict: PASS
commit: 4e3329ae0012636cd0140ce06be69d5577b8459f（feat/P5-56 @ /tmp/bot-wt/P5-56，基 934c58b；验收时 worktree 干净）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① grok-shim 单测 45 | PASS | `pnpm -C app/ui exec vitest run tests/unit/grok-shim` → `Tests 45 passed (45)`（独立复跑，evidence/P5-56-vfy/vfy-run.txt） |
| ① U3′ e2e 1 passed（两包先 build） | PASS | 先 `renderer-grok pnpm build`（shim.iife.js 27.91 kB）+ `app/ui pnpm build`，再 `pnpm test:e2e tests/e2e/grok-persona.spec.ts` → `1 passed (33.7s)` |
| ② 逐态断言非空转 | PASS | 亲读 spec 162 行：侧栏 `.sand-agent-item [data-grok-state]` + 会话头 `.sand-chat-header__avatar` 双定位断言，覆盖 idle→thinking→idle(审批)→working→searching→idle；needs-attention 计数 1→作答后 0 双向断言。映射终点 `personaStateFromAgent`（agent-avatar.tsx:66）与上游 ACTIVITY_TO_STATE 一致：Task→orbit、SendToAgent→sending、WebFetch/WebSearch→searching、其余→working，orbit/sending 由单测 14 例直接断言到该真函数 |
| ② reduced-motion 帧差亲跑 | PASS | e2e 内亲自执行：`data-reduced-motion="true"`（侧栏+头）+ transform 两帧相等 + `Buffer.compare(f0,f1)===0` 像素帧差，且有正对照（未降级 m0≠m1，transform 在推进）——非空转 |
| ③ 红基线：摘 orbit 映射 | PASS | 删 `subagent: 'Task'` → 恰好 1 红：`× subagent 运行中 → tool=Task（persona orbit）`，`expected {tool:'subagent'} to deeply equal {tool:'Task'}`（其余 21 绿）；恢复后 `git status --porcelain` 0 行、45/45 复绿（evidence/P5-56-vfy/vfy-run.txt） |
| ④ 区域 3 文件、上游树 diff=0 | PASS | `git diff --stat 934c58b..4e3329a` = shim/src/agents.ts(22) + tests/unit/grok-shim/agents.test.ts(39) + tests/e2e/grok-persona.spec.ts(162 新增)；`-- renderer-grok/frontend` 空 diff |
| ⑤ 对照台抽帧亲比 | PASS | 我的运行身份 pebble-orange（全新 HOME），`python3 -I cmp.py <我的 test-output>`：thinking dRGB=0/area0%、searching dRGB=1/area0%、working dRGB=3/area1%；并排另含 builder 四身份共 18 行全部 dRGB≤3、area≤2%。视觉亲验（vision 模型）：我方与对照台帧同为白底橙色鹅卵石 + 双眼，逐项描述一致。截图 evidence/P5-56-vfy/persona-{thinking,working,searching}-pebble-orange.png |

附核：全量单测 `vitest run` → 362/362 绿（与 builder 回报一致）。

新问题（每条一行，可直接成为修复任务）：
- [NOTE] working 态抽帧 dRGB 可达 3（pebble-orange），略超报告声称的 ΔRGB≤2 | 复现：新身份跑 e2e 后 cmp.py 比 working 帧 | 疑似位置：截图落帧时动画相位与对照台参照帧不同（ink 均值随相位漂移，同身份 thinking/searching 为 0–1） | 严重度：info，不建议立修复任务；若后续对照台加自动断言，阈值建议放宽到 ≤4 或固定相位采样
