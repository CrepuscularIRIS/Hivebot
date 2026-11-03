# REPORT-U-32 · L-6 复审 4 条 CONFIRMED minor（全部测试支撑代码，零产品代码改动）

- 分支：`feat/U-32`（基于 main 0025559，worktree /tmp/bot-wt/U-32）
- commits：`2f0b31e`（O1+O3）、`df028c9`（O4）、`4af3c9b`（O2）
- diff 范围：仅 `app/ui/tests/` 6 个文件（+140/−17）；`git diff --stat 0025559..HEAD` 核对，renderer / main / app/sdk 零改动
- e2e 最终全量在 Xvfb 虚拟显示（`xvfb-run -a --server-args="-screen 0 1600x1000x24"`）下运行；此前的 O2 自证与两轮中间全量跑在指令下达前用了真实显示（结果如实记录如下）

## O1+O3 · creds.ts dotenv 兜底解析（合一修，同根因）

**修法**：`envOrDotenv` 的文件路径补 `stripExport`（剥 `export ` 前缀 + 行首空白）与 `parseDotenvValue`（dotenv npm / docker-compose env_file 惯例）：剥两端匹配的单/双引号（引号内 `#` 不当注释，且 `"a" # trailing` 的引号后注释也剥）；未加引号值剥「空白+#」起的行内注释（`a#b` 无空格保留，取 compose 的保守规则，比 dotenv npm 贪婪正则宽松一档）；值区整体为注释或空 → undefined（no-silent-skip 语义不变）。

**红测试证据**（`app/ui/tests/unit/support/creds.test.ts` 新增 6 组用例，先红后绿）：
```
× 双引号 / 单引号剥掉   AssertionError: expected '"dummy-key"' to be 'dummy-key'
× 行内注释剥掉          AssertionError: expected 'dummy-key # note' to be 'dummy-key'
× export 前缀与行首空白  AssertionError: expected undefined to be 'dummy-key'
× 引号内 # / 引号后注释   AssertionError: expected '"a # b"' to be 'a # b'
× 空值 → undefined       AssertionError: expected '""' to be undefined
修复后：Tests 7 passed (7)。测试值一律虚构。
```

## O2 · settings.spec 竞态用例终局断言余量（事件屏障，非拉长等待）

**修法**（按 REVIEW 建议「等第一轮 RPC 计数并完成」）：round1 打开前取 main 侧 `__pbotsDsh.apiCount` 基线（main/index.ts:262 既有观测面，d1.spec 同口径，无新 IPC、无产品改动）；round2 选中后轮询至 `base+6` —— round1 迟到的 `agentPresets/list` 真正发出（DshConnection.rpc 发出即计数）才进入终局断言。+6 口径：两轮 dialog effect 各三连（listBundles/presets/modelCatalog），窗口内无其他 /api 调用方（roster 走 botsMeta 通道、$events 走 mux socket、Sidebar 时钟本地，已 grep 核实）。计数超越预期（窗口混入未预期 /api）→ 立即 throw，fail loud 不假绿。屏障后 500ms 仅覆盖毫秒级回包尾程（loopback fetch + ipc + 微任务回调）——2.5s 的不确定区间已被事件屏障消除，与原「注入 2.5s 只固定等 3.0s」有本质区别。

**红测试证据（摘守卫自证）**：临时把 NewBotDialog.tsx:54 `if (stale) return` 改 `if (stale && false) return` + build 后单跑该用例：
```
> 250 | await expect(dlg.locator('[data-preset-option="p2-beta"] input')).toBeChecked()
Error: expect(locator).toBeChecked() failed — Expected: checked, Received: unchecked
  14 × locator resolved to <input checked type="radio" name="preset" value="p2-beta"/>
```
round1 迟到回调把 preset 翻回 p2-alpha，被屏障后的终局断言稳定抓到（14 拍均 unchecked，非闪断）。恢复守卫 + build 后同用例绿（6.7s）。守卫已原样恢复，最终 diff 无产品代码改动。

## O4 · launchShell env 凭证剥离

**修法**：`sdk-env.ts` 新增 `shellChildEnv(home, extra)` —— 复用 `sdkChildEnv` 的副本剥离口径（`SANDBOXED_CREDENTIAL_KEYS` 5 键）+ 原有 HOME/XDG_*/PBOTS_DATA_DIR 沙箱路径 + extra 照传（launchProduct 的 PBOTS_DSH_HANDOFF 等）；`launchShell` 的 `_electron.launch env` 改用之。worker 自身 process.env 不动（真模型旅程照常经 creds 路径拿 key）。放 sdk-env.ts 而非 launch.ts：后者顶层 `__dirname`，vitest ESM 下不可 import（sdk-env.ts 头注既有约定）。

**红测试证据**（`tests/unit/support/sdk-env.test.ts` 新增 O4 用例，先红后绿）：
```
TypeError: shellChildEnv is not a function
修复后：Tests 9 passed (9) —— 断言构造 env 不含 5 个清单键、沙箱路径与 extra 照常、worker process.env 保持原值（fake 值注入）。
```

## 全量回归（worktree /tmp/bot-wt/U-32，HOME=/tmp/bot-u32）

| 项 | 命令 | 结果 |
|---|---|---|
| 构建 | `pnpm -C app/ui build` | OK（renderer 1236.96 kB，1.08s） |
| 单测全量 | `pnpm -C app/ui exec vitest run` | **27 files / 224 tests 全绿**（4.05s） |
| e2e 全量 | `xvfb-run -a --server-args="-screen 0 1600x1000x24" pnpm -C app/ui exec playwright test --workers=1` | **54/54 全绿（5.5m）** |

### flaky 实录（已知 NewBotDialog 族，均单跑复核，未静默重试）

- 全量第 1 轮（真实显示，load≈3.3）：d11-d12、markdown 红，52 过。两用例单跑均绿（markdown 2 passed；d11-d12 第 3 次单跑 5.2s 绿——前两次红均在高负载时）。d11-d12 另在干净 main 基线 worktree（0025559）单跑绿（5.2s），排除 U-32 回归。
- 全量第 2 轮（真实显示）：session.spec 两条红（同一签名：createViaDialog 的 `[data-preset-option] input` 15s check 超时，ui.ts:73），52 过；session.spec 单跑 4 passed（21.9s）。
- 全量第 3 轮（Xvfb，最终交付轮）：54/54 全绿，无重试。
- 结论：4 次红全部同一已知族签名，与 U-32 改动无关（基线对照 + 每条单跑绿 + 最终全量绿三重证据）。

## 未完成 / 新发现（不扩范围，交派发者）

1. **NewBotDialog 族 flaky 在 load≈3.3 下系统性出现**（4 次/2 轮，全部卡 ui.ts:73 的 15s check）：机器负载高时 preset 选项渲染超 15s。建议后续任务把 createViaDialog 的 check 超时放宽或查 agentPresets/list 慢因——不在 U-32 范围。
2. 全量 e2e 若必须在真实显示跑会向用户桌面弹 Electron 窗口；本次最终轮已按新指令改 Xvfb，无 GL/渲染异常（截图断言全过），无需追加 --disable-gpu（launchShell 本就带）。
3. 中间产物：worktree 的 `work/p4-ui/evidence/PAB/*.png` 被 e2e 刷新过，已 `git checkout -- work/` 还原，不进分支。

待 verifier 验收。
