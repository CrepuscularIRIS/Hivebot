# spike-data · U-00 首日 spike 实测数据

2026-11-02 · builder（U-00）· 分支 feat/U-00 · 全部数据来自实跑（非日志推断），原始产物在 `work/p4-ui/evidence/U-00/`（spike-timings.json、s2-two-bots.png、s3-approval-card.png、red-green/*.txt）。

## 1. 四场景结果表（U-00 ①）

| 场景 | 结果 | 关键实测 |
|---|---|---|
| S1 冷启动 | PASS | 窗口 1 个、URL `pbots-app://app/`（非 file://）；dsh generation 1；boot 期 `/api` 调用 0 次；门控套件冷启动 smoke 594 ms（`--disable-gpu`） |
| S2 两 bot 并发流式 | PASS | A=p2-alpha、B=p2-beta，各 K=4 chunk 逐块到达；A 的 transcript 不含 B 标记、B 不含 A（不串线）；main 下行原帧 tap 计数 59（全部为 port 归属流，socket 自身 stream 表外，由桥按 streamId 路由）；session/prompt 往返 18/40 ms |
| S3 审批往返 | PASS | 拒绝 → `tool/result` `isError:true`、内容 `"Error: the user rejected tool \"bash\""`，canary 不存在；批准 → canary 存在于会话 cwd；卡片只出现在发起 bot 的 $events（agentId=sessionId） |
| S4 renderer 重载 | PASS | 挂起审批 → reload → 新 clientId、**同一 eventId** 补发 → 批准后执行（canary 存在） |
| S5 无人应答终态（④(4)，供 U-16） | 数据已采 | 只关 `$events` 流（窗口与 follow 保留），观察 **300.1 s：0 个终态事件**（follow 无 approval/decided、无 tool/result、无 turn/end），main 存活，canary 全程不存在；重开 `$events` 后同 eventId 补发、答 rejected 正常释放回合。结论：**上游无超时，fail-closed 需要 main 侧 deadline** |

## 2. 门控与测试计数

| 类别 | 数量 | 明细 |
|---|---|---|
| 壳 e2e（tests/e2e/shell） | 9 | 冷启动 smoke 1 + 来源门控 (a)(b)(c)(d)(e)(f)(f2) + CSP ⑧ |
| 红绿突变（tests/support/mutations.sh） | 9 | webviewTag、devTools、setWindowOpenHandler、will-navigate、preload 门控、pbots:api 来源校验、协议 hostname 门控、resolveAppPath 穿越、CSP 头——全部突变下对应测试红，还原后绿（产物 red-green/*.txt） |
| 壳单测（tests/unit/shell） | 23 | sender 表 6、document-path 4、socket 4、connect 4、ledger 5 |
| spike 桥单测（spike/U-00/bridge.test.mjs） | 8 | D9 拒绝 5 例（省略 enabled / enabled:true / 'allowed-always' / clientId 不匹配 / eventId 不匹配）+ 直通 + 计数 === 0 + 白名单恰 16 方法 |
| spike 场景 e2e（spike/U-00/scenarios.spec.ts） | 4 | S1 / S2 / S3+S4 / S5（S5 含 300 s 观察窗口，套件总时长 ~5.2 min） |

## 3. 闭包与供应链数据

| 项 | 实测 |
|---|---|
| submodule bootstrap install | **~6 min**（corepack pnpm@11.28.5，1432 包，node_modules **2.1 G**；根 postinstall 的 lefthook 在 git worktree 内必失败，无害——只装 git hooks） |
| build:artifacts | 366 个 client artifact；增量 ~81 s（首次含 typert 生成与 native 编译，另见 §6 两个坑） |
| 保留集依赖闭包（deps+devDeps workspace 图） | **306 个 dsh workspace 包**（含 host 半部与 test-support，保守上界）；69 个 `packages/client/*` 全部在图内 |
| workspace-controller 拉入路径 | `ui-conversation` 在 **runtime dependencies** 级；ui-chat / ui-tool / ui-workspace / ui-sidebar / ui-sidebar-browser / ui-schedule 经 devDeps。静态闭包未 import 它（见下），W1 组装时处理 |
| 静态 seed 构建（29 个保留集包浏览器半部，`./client` 子路径） | **可构建**：545 模块、5.03 s、dist **9.6 MB / 62 文件**（主 chunk 5.29 MB、gzip 1.27 MB；其余主要是 shiki 语法块 cpp 797 K、graphql 371 K…） |
| node 内建外置 | 仅 `node:fs`、`node:fs/promises`、`node:path`、`node:url`，来源全部是 `vendor/loader`（apps/web 注明浏览器路径不触发，boot 供 `loader.internal`）+ `node:module` 用桩 |
| Electron 44.7.0 + Playwright 1.64.1 | **组合验证通过**（_electron 冷启动、MessagePort 转交、reload 全链路） |

## 4. M1/M2 实际用量与白名单拒绝记录

- M1 实际调用：`session/create`、`session/prompt`、`$events/result`（均在 C §2 表内）；M2 endpoint：`session/follow`、`$events`（均在表内）。
- **表外默认拒绝记录（`__spike.rejectedCalls`）：0 条**——四场景没有产生任何表外方法请求。结论：现有契约表对四场景足够，无需扩白名单。
- Q-spike 增补项 **2 条**（见 SPIKE.md §5）：U-16 deadline 方案二选一；typert wire `{request:…}` 壳的契约注记。

## 5. 无人应答终态实测详情（U-16 输入）

- 观察：挂起审批 + `$events` 流 cancel 后，gateway **不自动了结**（无 `unavailable`、无超时 decided），turn 停在 tool call 上；pending 保留，重开 `$events` 即补发（同 eventId）。
- 对 U-22 ④ 的观察窗口含义：不能等上游终态，必须 main 在 deadline 后以 ledger clientId 代答 `'rejected'`（U-16 现行设计即此，实测支持方案 A=main 代答；方案 B=SDK 超时无必要引入）。

## 6. 供应链坑（bootstrap 复现要点）

1. Electron 44 的 npm 包**无 postinstall**，必须显式 `node node_modules/electron/install.js`（app/ui 已挂 postinstall，幂等）。
2. dsh `build:artifacts` 的 native 步骤要求 Node-API 头；pnpm devEngines 下载的 node 包把头文件放在 `node_modules/node/node_modules/node-linux-x64/include`，而构建脚本找 `node/include`——符号链接补齐：`ln -s $(…)/node-linux-x64/include $(…)/node/include`（app/ui 自己的 node_modules 内，不动 submodule）。
3. dsh 根 postinstall（lefthook）在 git worktree 里必失败（`extensions.worktreeConfig` 冲突），可忽略。
4. Node 24.9+ 由 app/ui 的 devEngines 下载（node 24.22.2），dsh 构建时把它放进 PATH 前置即可满足 `>=24.9.0`。

## 7. Electron 门控测试的三个可观测性发现（写测试用）

1. Electron 44 `getLastWebPreferences()` **不序列化 devTools 键**（false 时缺失）——devTools 断言用「键缺省 + openDevTools() 后窗口数仍 1」双重证据。
2. 无用户手势的合成 click / window.open 会被 Chromium 弹窗拦截**先于** `setWindowOpenHandler`——门控测试必须用 playwright 真实输入。
3. `setWindowOpenHandler` 返回 allow 时 window.open 返回 `[object Window]` 但**窗口数不增**——deny 的可靠可观测面是 **window.open 返回 null**。

## 8. 主进程时序约束（并入 W1 注意事项）

- `ipcRenderer.send` 是即发即弃：**ipc handler 必须先注册再 loadURL**，否则页面 boot 的首条请求丢失（本分支 main/index.ts 已按此序）。
- typert wire 的 unary/stream 参数一律包 `{request:…}` 壳（session/create、session/prompt、session/follow 实测一致；C 表入参描述未显式写壳）。
