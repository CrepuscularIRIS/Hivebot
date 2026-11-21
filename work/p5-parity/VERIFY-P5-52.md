# VERIFY · P5-52 死入口隐藏（U4′）

verdict: PASS
commit: cd8a3c83599ef4222e827dad64b931ec8e84218b（feat/P5-52 @ /tmp/bot-wt/P5-52，基 048bc03；验收结束时 worktree `git status` 干净）

独立复跑环境：worktree 重建依赖后从干净状态 build；`pnpm test:e2e`（=run-e2e.sh+xvfb）注意必须经 pnpm script 跑——裸 PATH 里 miniconda playwright 1.62 会抢先报 `unknown command 'test'`（非本分支问题，见新问题 1）。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 两包 build + upstream check | PASS | app/ui `pnpm build` ✓（out/main）；renderer-grok `pnpm build` ✓（overrides vite + shim + inject）；`pnpm check` → `upstream diff=0: 332 files` exit 0 |
| grok-dead-entries.spec 自跑 | PASS | `pnpm test:e2e grok-dead-entries.spec.ts` → `1 passed (1.5m)`（恢复基线后复跑 `1 passed (1.6m)`）；遍历 42 项点击 + 1 外链跳过，0 DEAD：evidence/P5-52/spec-run/u4-traverse.tsv（44 行含表头） |
| ui vitest 365 | PASS | app/ui `pnpm test` → Test Files 35 passed / Tests **365 passed** |
| sdk vitest 304 | PASS | app/sdk `pnpm test` → Test Files 37 passed / Tests **304 passed** |
| U4′ 亲点 8 项 | PASS 8/8 | 独立探针（evidence/P5-52/probe/probe.spec.ts，真实 Electron+Xvfb）：①titlebar 自绘控件 count=0 ②行菜单无 Delete（可见项恰为 Edit Profile/Move to new section/Pin/Mark as Unread/Copy conversation ID）③悬浮无 Reply/Add reaction，More→仅 Copy ④Channels/Broadcast/AgentNetwork 全 0 ⑤账户菜单恰 [Settings, About] ⑥attach/voice computed display=none ⑦New 按钮 agent 行 1→2（活入口）⑧info pane data-open 且 Agent name 可见。截图 probe-out/01…08-*.png 经视觉模型逐张核验（内容与判定一致），console 全文 probe-out/probe-console.log |
| 红基线 a：模块覆盖剥 Delete 过滤 → ① 红 | PASS | overrides/modules/sidebar.tsx 恢复传递 onDuplicateAgent/onRequestDeleteAgent/onShowFullConversation → rebuild → spec `✘ … expect(rowMenu).toEqual([…])`（grok-dead-entries.spec.ts:156 红，4.6s 失败） |
| 红基线 b：CSS 摘 attach → ① 红 | PASS | dead-entries.css 删 Attach file 选择器行 → rebuild → spec `✘ expect(locator).toBeHidden() Locator: button[aria-label="Attach file"] …unexpected value "visible"`（:142 红，9.0s 失败） |
| 恢复绿 | PASS | `git checkout -- overrides/` → rebuild → `1 passed (1.6m)`；worktree status 干净、HEAD 仍 cd8a3c8；`pnpm check` 再次 `upstream diff=0: 332 files` |
| 区域约束 | PASS（1 处计数出入） | `git diff 048bc03..cd8a3c8 --stat` = **18 文件** +471/-7（回报写「19 文件」，+471/-7 精确吻合；差 1 疑为 builder 把某产物计入，无实质影响）。文件清单全部落在 app/ui/renderer-grok/ 与 app/ui/tests/，**app/ui/renderer（旧）与 app/ui/main 零改动**；overrides 机制（overrides/vite.config.ts resolveId + modules/* + dead-entries.css + inject-shim 注入 link）只在 renderer-grok |
| visual.spec flake 复核 | PASS | `pnpm test:e2e visual.spec.ts` 单跑 → `2 passed (12.0s)`（回报所称旧 renderer 审批等待 flake 未复现，单跑绿成立） |

坏路径说明：本任务的坏路径即红基线（隐藏机制被移除时 spec 必须红）——两条均已实证；另 traverse 对外链 <a target=_blank> 的跳过有独立断言钉住（spec :128 target=_blank）。

新问题（每条一行，可直接成为修复任务）：
- [FIX] 裸 `sh scripts/run-e2e.sh` 在 PATH 含 ~/miniconda3/bin 时解析到 playwright 1.62 报 `unknown command 'test'` | 复现：cd app/ui && sh scripts/run-e2e.sh <spec> | 疑似位置：app/ui/scripts/run-e2e.sh（建议把 `playwright` 写成 `"$PWD/node_modules/.bin/playwright"` 或统一走 pnpm run） | 严重度：低
- [NOTE] REPORT「19 文件」与实际 18 文件差 1（+471/-7 吻合），仅记录不影响 verdict | 位置：work/p5-parity/REPORT-P5-52.md | 严重度：低

验收人：verifier（GLM 5.3），2026-11-03。
