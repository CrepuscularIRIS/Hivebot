verdict: PASS
commit: f13bbc5902de6a0e18ca8f4f5e21b1441acd6aa9
验收环境：node 24.22.2（pnpm 管内）、vitest 5.0.5、HOME=/tmp/bot-vfy-T-12.f1{,-ev}/h（临时）；全部串行 --no-file-parallelism；GPU 负载友好。上游对照：repos/deepseek-harness @ ce7073d51254c26cd63b22a60835b8f948deb447。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 干净复跑全量 = 123/123 | PASS | 两次独立跑均 `Test Files 17 passed, Tests 123 passed`（10:02 一次存档）：evidence/T-12.f1/full-suite-tail.txt |
| ① 死锁解除（DSH_PERMISSION_MODE=danger-full-access e2e 亲验） | PASS | `pnpm exec vitest run tests/e2e/approval.test.ts -t "R2:"` 绿（1779ms）：evidence/T-12.f1/approval-e2e-verbose.txt。用例内断言顺序正确：先 catalog.defaultPreset==='danger-full-access' 再 session projections pin 再 canary 存在 + $events 无 approval/request——防假绿齐全 |
| ①红侧：无修复时该用例确实失败 | PASS | 独立 detach checkout f13bbc5、仅 shell-ask.mjs 还原到 d0a8008 → 用例 ×，AssertionError「ordinary bash ran … expected false to be true」（:430，catalog/pin 已通过才走到）＝死锁签名被真实捕获：evidence/T-12.f1/red-check.txt |
| ② 默认 preset 既有 approval e2e 全绿（D8 底线） | PASS | 同文件其余 4 条：D8×3（普通 bash 必问/跨 session 不串/重复模式也要问）+ R1 token 不可推导，全 ✓：approval-e2e-verbose.txt |
| ③ 中间策略 fail-closed 单测逐条核对 | PASS | policy.test.ts 15/15。派发清单逐条对上：override='ask'→ask；未知值 'always'→ask；无 approval 服务→ask；exec 无 agent/session→ask；overrideOf 抛错→ask；另有无 override 无 config→ask、仅 config 'never' 放行：policy-unit-verbose.txt |
| 锚点：overrideOf 折叠与上游一致 | PASS | 上游 user-approval/src/index.ts:271 `this.overrideOf(session) ?? this.config.policy ?? 'ask'`＝shell-ask `(override ?? configured ?? 'ask')`；:301 `if (this.effectivePolicy(session) === 'never') return 'rejected'`（派发前拒绝，死锁前提成立）；permission-presets derive :348-361 同款折叠、set/apply :397-418 经 setApprovalPolicy 写事件、pinInitialPermission :429-457 新 session 钉默认 preset（默认写 'ask'，故 override 有值 ≠ never）：evidence/T-12.f1/anchors.txt |
| 区域：diff 恰 3 文件、shell-ask 之外零产品改动 | PASS | `git diff d0a8008..f13bbc5 --stat` = shell-ask.mjs +48 / approval.test.ts +52 / policy.test.ts +83，无其他文件；d0a8008..f13bbc5 区间仅 1 commit |
| ⑤ 安全语义：放行仅显式 never，无隐式放行 | PASS | 见下「安全语义推演」 |

安全语义推演（⑤）：
1. 监听器全部 next() 路径仅 3 处（evidence/anchors.txt 末段）：非 bash 工具（原有）；approvalNever（新增，唯一出口 `(override ?? configured ?? 'ask') === 'never'` 精确匹配）；requested 严格更宽（原有 T-12 行为）。其余一律 `{kind:'ask'}`。
2. never 的两个来源均为用户侧：a) dsh-base cordis.patch.yml `policy: (DSH_PERMISSION_MODE ?? 'workspace-write') === 'danger-full-access' ? 'never' : 'ask'`——launcher 组装期一次性读 env，模型无法触达（T-12 R3 env 隔离 + R1 e2e）；b) 预设切换经 permission-presets set/apply → setApprovalPolicy 写 session 事件，暴露面是用户斜杠命令 `/permission` 与 SDK 客户端 RPC，permission-presets 未注册任何模型工具（compiled lib 仅 ServerRpc "permissionPresets" + commands.register，anchors.txt 末段）。pinInitialPermission 只钉部署默认（默认 preset 为 ask）。
3. 折叠默认是 'ask'（问），不是 'never'（放行）；读不到服务/无 session/投影抛错均落回 ask——fail-closed 方向正确。
4. never 下带 sandbox_permissions 的请求也只 delegate 给 tool-bash：实际执行的沙箱模式仍由 sandboxPolicy.resolve 决定，越权升级仍走上游 user-approval decide（对 never 确定性 rejected）——无越权面。

新问题（每条一行，可直接成为修复任务）：
- [OBS] shell-ask.mjs:61 `exec.agent === undefined ? undefined : exec.agent.session` 在 agent 为 null 时会 TypeError（同款写法在既有 :54 行已存在，属继承的边缘；抛错走 pre-execute 异常=fail-closed，bash 不执行，无放行风险） | 复现：构造 exec.agent=null 直调 listener | 疑似位置：app/sdk/src/policy/shell-ask.mjs | 严重度：低（可与后续任务合并修）

遗留清理（非本任务问题）：验收中发现前一轮 T-12 验收遗留的 2 个孤儿 dsh 进程（PID 459759/459949，elapsed 9h47m，引用已删除的 worktree /tmp/bot-wt/T-12），已按 §5 用 bot-reap 清理，对应 /tmp/p2sdk-vfy-* 临时目录已删；红验证 worktree /tmp/vfy-T-12.f1-red 已 worktree remove。builder 现场（/tmp/bot-wt/T-12.f1 @ f13bbc5）未动，`git status` 干净。
