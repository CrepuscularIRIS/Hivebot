verdict: PASS
commit: 40bcab81be936e60365182a60a56fe69b195a1ff

验收方式：独立 detached worktree /tmp/bot-vfy-p5-51（builder 现场 /tmp/bot-wt/P5-51 未动），HOME=/tmp/bot-vfy-p5-51-home，全部命令自跑。证据明细：evidence/P5-51/verify-log.txt + 两张 e2e 截图。

| 验收项 | 结果 | 证据 |
|---|---|---|
| 两包 frozen install + build | PASS | sdk install 2m54s（无 build 脚本，纯源码包）；ui workspace install 2m1s + electron postinstall Done；renderer-grok build（shim.iife.js 27.87kB）+ app/ui build OK |
| `pnpm check` 上游树 diff=0 | PASS | `upstream diff=0: 332 files`（跑两次，含红基线恢复后复跑） |
| vitest grok-shim 29 | PASS | Test Files 4 passed / Tests 29 passed（含 D9 值域 4 分支用例） |
| e2e grok-shim.spec 1 passed | PASS | 1 passed (6.6s)，复跑 3 次全绿（红基线后恢复再跑亦绿） |
| ui 全量 vitest = 333 | PASS | 33 files / 333 tests passed |
| ui 全量 e2e = 63 | PASS | 63 passed (6.8m) |
| D9：作答值域断言亲验 | PASS | spec.ts:126-127 `toEqual(['allowed-once','rejected'])`；answers 记录点在 data.ts:271 `$events/result` 发送处（非自说自话）；运行时白名单 coordinator.ts:50-51（allow-once/always→allowed-once，其余→rejected）+ 类型签名编译期白名单 |
| D9：硬拒层单测照跑 | PASS | coordinator.test.ts:147-158 四种 resolution → `['allowed-once','rejected','rejected','allowed-once']`（29 内） |
| ceiling=ask 时 Always 禁用 | PASS | spec.ts:97 `toBeDisabled()`（disabled 属性级）；红基线②证明有效：ceiling 改 'always' → 该断言红（1 failed），恢复后绿 |
| 审批卡条件实证（fake bash→Dock→作答→消失） | PASS | spec 92-99 行链路在 4 次实跑中均过：fake bash（argumentsDelta 带 description）→ dock visible → Allow once → count 0；探针亦独立走过同链 |
| 红基线①：摘 role:'assistant' → e2e 红 | **不红（测试盲区，见新问题 f1）** | 摘 entries.ts:71（持久序列化）后 e2e 仍 1 passed；DOM 探针证实正文落 user 侧、pre=0（PROBE_DUMP）；连 entries.ts:88（live-stream）一起摘才红（spec:107 pre toHaveCount(1) got 0）。绿 build 对照探针：idle 后 assistant 侧、pre=1——**产品行为正确，唯 e2e 对持久条目侧别不设防** |
| 红基线②：ceiling 'always' → Always 可点红 | PASS | toBeDisabled failed @spec:97 → 1 failed；恢复 → 1 passed |
| 区域 15 文件 vs 申报 | PASS | `git diff --stat 9e8cab3..40bcab8` = 15 files +1469 -1，全在 renderer-grok/{shim,scripts,package.json,README} + tests/{unit,e2e}，与申报逐文件一致 |
| inject-shim 幂等 | PASS | 连续两次 build 后 index.html 中 shim.iife.js 恰 1 次，经典 script（行13）先于 module bundle（行14） |
| 报告坑①（判侧 role）复核 | PASS | entries.ts:71 实现+注释；0.18 model.ts:446 `kind==="send-message" || value.role==="assistant"` 判侧，缺省落 user 侧（UserMessageContent 纯文本 `<p>`，无 markdown）——与报告描述一致，且红基线①的探针差分实证 |
| 报告坑④（单飞）复核 | PASS | data.ts:144-149 rosterFlight 单飞：并发调用共享同一 Promise、finally 清引用，防 boot 重试×socket 重开双建主 bot |

截图说明：本环境 Read 图片一律被 CDN 化、analyze_image MCP 对任意 URL 返回 400，无法目视；以四重客观证据替代（合法 PNG 1280x820、平均色 249×3=light 与测试名吻合、playwright page.screenshot 机制上仅含 Electron 页面、截图前 DOM 断言全过），详见 verify-log.txt。DEMO-1 型事故（拍到桌面）在此截图机制下不可能发生。

新问题（每条一行，可直接成为修复任务）：
- [FIX] e2e grok-shim.spec 对持久 assistant 正文侧别无断言：pre=1 实际由流式 live-stream 条目（entries.ts:88 自带 role）撑住，摘除持久序列化的 role（entries.ts:71）后整条 spec 仍绿 | 复现：sed 摘 entries.ts:71 的 role:'assistant' → renderer-grok pnpm build → pnpm test:e2e tests/e2e/grok-shim.spec.ts → 1 passed（应为红）；DOM 探针：正文落 user 侧、pre=0 | 疑似位置：app/ui/tests/e2e/grok-shim.spec.ts:102-110（断言需在回合 idle 后加 data-role/pre 差分） | 严重度 M（测试有效性，非产品缺陷；产品行为已由探针证实正确）
- [OBS] 用户消息投影在 assistant 侧：0.18 model.ts:446 将 kind:'send-message' 判为 assistant，shim 的 user 条目（entries.ts:64）映射为 send-message → 两次探针中用户输入均 data-role=assistant（author=agentName）| 复现：e2e 发任意消息 → evaluate dump `.sand-message` dataset.role | 疑似位置：app/ui/renderer-grok/shim/src/entries.ts:64（需对照 0.18 原版 transcript feed 的用户消息 raw entry kind 是否真是 send-message） | 严重度 L（若 0.18 原版如此则非问题；建议 P5-55 对照台/RE 语料核对后关闭）
