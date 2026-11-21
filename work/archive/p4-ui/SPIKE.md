# SPIKE · P4 首日 spike（U-00）结论

2026-11-02 · builder（U-00）· 分支 feat/U-00。数据表见 `work/p4-ui/spike-data.md`，原始产物 `work/p4-ui/evidence/U-00/`。接口口径以 `work/p3-contract/CONTRACT.md` v1.3 为准，本文不改接口。

## 1. 最小插件清单（保留集静态闭包）

spike 验证的静态闭包入口（29 个 dsh 包 + cordis，一律浏览器半部——有 `./client` 子路径的走子路径，store/ui-slots/ui-primitives/ui-dockkit/web 根入口即浏览器安全）：

- 底座：cordis、client-web（模块表/boot）、ui-renderer（SlotRegistry）、store、ui-slots、ui-primitives、ui-dockkit、locale、resources、shortcuts、modules、theme、layout、context-menu
- 供应者（scout-C 判定的硬依赖）：ui-sidebar-right（chat）、ui-file-drag（chat）、file-upload（conversation）
- 业务：ui-session、ui-conversation、ui-chat、ui-approval、ui-tool、ui-plugin-market、ui-plugin-manager、ui-agent-preset、ui-model-selection
- api 半部：api-gateway、api-session-controller
- 传输：client-connection（其 `installConnection`/`createWebSocket` 接缝按 C §2.1）

**未入静态清单但在依赖图内的深度绑定**：ui-workspace（ui-conversation 的 runtime deps 级拉 workspace-controller）——W1 组装（U-21）二选一：连同其供应者装载，或裁剪 conversation 的 workspace 依赖（改造量见 scout-C §2）。这是 W2 前要解的唯一深度绑定点。
排除项照 B §3：ui-settings-account / ui-settings-models / ui-settings-web-search（凭证类）、product-analytics、ui-permission-presets（D9）。

## 2. 实际需要的 M1 方法与 M2 endpoint（批量判据拆分）

- 用到（全部已在 C §2 表内）：M1 `session/create`、`session/prompt`、`$events/result`；M2 `session/follow`、`$events`。
- **拒**（按 B:58 判据本就该拒的表外请求）：spike 全程 **0 条**（无凭证/account、workspace 写、setIndexes、通配加行请求出现）。
- **待批**（不在表内但出现的请求）：**0 条**。
- 结论：现有契约表覆盖四场景，白名单无需增行。

## 3. Connection generation 如何就绪

- main：`DshConnection.start()` 首次 `/connect`（302 cookie）+ ws open → **generation 1**；`ready.ts` 的 dsh 闸门置位（M1/M2 就绪语义由 U-14 扩展）。socket 死亡 → `onDead` → 300 ms 退避重连 → 成功后 generation+1；重连期间桥关闭全部 port、不转交新 port（S5 重开 `$events` 走的就是新 generation 上的新流）。
- renderer：页面 boot 即请求 mux 端口——**main 必须先注册 ipc handler 再 loadURL**（ipcRenderer.send 即发即弃，晚注册丢消息，实测踩过）。

## 4. 无人应答终态实测（U-16 输入）

300 s 观察窗口内上游**无任何终态**（详见 spike-data §5）。U-16 维持现行设计（main 以 ledger clientId 代答 `'rejected'`）即方案 A；无需 SDK 侧超时。

## 5. Q-spike 白名单增补草案（合成一条，交主会话按 B:58 落实）

1. **U-16 deadline 方案（推荐 A：main 代答）**——实测上游无超时、pending 保留至重开 `$events`；A=main 以 ledger 的 clientId/eventId 代答 `'rejected'`（恰好 1 次，U-16 现行验收不变）；B=SDK 超时（不推荐，需改 p2-sdk 且语义分散）。
2. **typert wire 参数壳注记（勘误性质，不改形状）**——C §2 表的入参描述补一句「typert wire 方法参数包 `{request:…}` 壳」（session/create、session/prompt、session/follow 实测一致）；U-11 的参数约束按壳内字段校验。

## 6. submodule bootstrap（一条命令 + 耗时）

```bash
# 在仓根（worktree 内同）
git submodule update --init --reference /home/lingxufeng/bot/repos/deepseek-harness   # <10 s（本地 alternates）
cd app/ui/vendor/deepseek-harness
corepack pnpm@11.28.5 install          # ~6 min（1432 包 / 2.1 G；lefthook postinstall 失败可忽略）
# Node-API 头符号链接（见 spike-data §6.2，app/ui 自己的 node_modules 内操作）
corepack pnpm@11.28.5 run build:artifacts   # 增量 ~81 s；构建 PATH 前置 app/ui devEngines 下载的 node 24（见 §6.4）
```

## 7. 留给 W1/W2 的事实

- fixture preset p2-alpha/p2-beta **不含 bash 工具**（fs / fs+search）；审批类场景用默认 preset（bash + shell-ask）。W2 演示用 preset 的工具面要按此选。
- 默认 preset 的会话是 **confined**：工具只可写会话 cwd 内——副作用 canary 必须放进 session cwd。
- 拒绝后的 `tool/result` 原文：`isError:true`、content `"Error: the user rejected tool \"bash\""`（D3 判据可直接引用）。
- dsh 静态闭包的 node 内建外置仅 `vendor/loader`（上游注明浏览器不触发）。
