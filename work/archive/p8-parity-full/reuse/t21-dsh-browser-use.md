# T-21 · dsh browser-use 与隔离浏览器

调研日：2026-11-05。只读调研；未启动浏览器、未读取用户 Chrome cookie/profile。推荐是待验证集成路径，不代表安全护栏已通过。

| 能力 | 候选 | 阶梯（1～5） | 许可证 | 维护 | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| bot 浏览器办事 | @deepseek-ai/dsh-browser-use + @deepseek-ai/dsh-experimental-browser-use-playwright-mcp，均锁 0.2.2-alpha.2 | 1（暂定，issue 响应与安全验收待补） | dsh MIT；@playwright/mcp Apache-2.0 | dsh commit 2026-11-04；两个精确版本 npm modified 2026-11-04；维护者 issue 回应未验证 | 集成 | 现成 Session 级工具挂载、isolated launch 与生命周期；不另写自动化引擎。上传下载和宿主文件边界需单独补证。 |

## 源码与已装状态

只读参考仓根 `/home/lingxufeng/bot/repos/deepseek-harness/`，SHA `ce7073d51254c26cd63b22a60835b8f948deb447`：

- `packages/browser-use/browser-use/src/index.ts` 是单 provider 注册表，不是浏览器操作实现。
- `packages/experimental/browser-use-playwright-mcp/src/index.ts:27-50` 直接启动已解析的 @playwright/mcp/cli.js：launch 固定 Chromium、加 --isolated，可加 --headless；attach 则走 --cdp-endpoint。先清空继承 PLAYWRIGHT_MCP_* 环境项，避免外部环境换模式或 profile。
- `packages/experimental/browser-use-runtime/src/mcp.ts:148-158` 通过 McpClient stdio 运行，cwd 来自 workingDirectory；每个 live Session 拥有资源，attach 排他，工具调用绑定 Agent，启动失败不静默继续，销毁等待清理。
- 本机未找到 browser-use/provider 包的已装 pnpm 目录；client-ui-sidebar-browser 不等于 browser-use。npm 已核实上述两个精确版本存在，不能根据 latest tag 的其他版本直接升级。

因此它与 Playwright 的关系是“直接复用 Playwright MCP 工具服务”，不是另一个独立浏览器引擎，也不需要在 bot 里重新实现 click/navigation/snapshot。

## 两个对照候选

1. dsh experimental-browser-use-chrome-devtools-mcp：同样有 isolated launch、headless，另有 browser-url/ws-endpoint attach；源码是 `packages/experimental/browser-use-chrome-devtools-mcp/src/index.ts`。适合 DevTools/性能调试；一般网页办事已有 Playwright MCP，不宜同时开两个 provider 争同一浏览器。
2. dsh experimental-browser-use-stagehand-native：`packages/experimental/browser-use-stagehand-native/src/launch.ts:1-65` 用 @puppeteer/browsers 起 Chromium，mkdtemp 独立 profile，清洗父环境并清理子进程。需额外 worker/RPC 与行为验证，未证明比现成 MCP 更短；其中 unsafe-extension-debugging/remote-allow-origins 参数不应当作安全承诺。

这两条并非不存在或不能用，只是当前首选已有更小接入面。

## 不触碰用户 cookie 的约束

- 仅启用 mode=launch、isolated、headless；禁止 attach 用户 CDP、导入 storageState、指定真实用户 profile、复用用户 Chrome 调试端口。
- 临时 HOME/profile，清洗真实会话 DBus、Wayland/X11 及凭证环境；不挂用户 .config、.ssh 等目录。需要带 UI 验证时只在隔离 Xvfb。
- isolated 是浏览器上下文隔离，不是文件系统、网络或模型工具审批。MCP server 与 Chromium 的实际 OS 权限必须纳入现有受控执行路径，不能以 cwd=workspace 推导“只可读 workspace”。
- 上游 config.d.ts 的 outputDir 注释明确：显式文件名按 workspace root 解析，不受 outputDir 影响。这证明仅改输出目录不构成文件 fence；具体上传、下载、evaluate/任意代码与路径穿越默认行为，本轮未完成版本绑定验证，禁止声称已受 P6-25/26 保护。

外部源码证据：
- https://github.com/microsoft/playwright-mcp/blob/50b004fb3d3ee17f9710f067ed1b6d59fd16e4a1/config.d.ts
- https://github.com/microsoft/playwright-mcp/blob/50b004fb3d3ee17f9710f067ed1b6d59fd16e4a1/package.json （当时上游 0.0.84；不是 dsh 依赖版本已匹配的证明）

## 工作量与后续可证伪验证

纯装包、配置、工具展示接线估计 0.5～1 人日；文件/网络/审批集成与坏路径验证另计，未执行。最少检查：两 Session 互不见 cookie；退出后子进程/profile 回收；上传沙箱外文件拒绝；下载只能落允许区；断网/取消/启动失败不降级到用户浏览器；所有有副作用浏览器工具经过对应审批。任何一项未通过都不能宣布可以安全“办事”。

本次查了 MANIFEST、本地 provider/runtime、已装包、跨任务 REUSE、GitHub 包源码及 npm 精确版本；没有“现成包不存在”的结论。
