// P5-57 验收 barrel：复用 app/ui e2e support（verifier 亲验用，esbuild 打包成 CJS）。
// 绝对路径指向 feat/P5-57 worktree（/tmp/bot-wt/P5-57，HEAD 984cce8）。
export { serveMarket, tempBundle, MARKET_SOURCE_PATCH, LOCAL_PLUGIN, BARE_PLUGIN } from '/tmp/bot-wt/P5-57/app/ui/tests/support/connectors.ts'
export { launchSdkRuntime, fakeOverlayPath } from '/tmp/bot-wt/P5-57/app/ui/tests/support/sdk-runtime.ts'
export { PRESETS_PATCH, textCall } from '/tmp/bot-wt/P5-57/app/ui/tests/support/ui.ts'
export { mcpCall, FS_PLUGIN, WRAPPER } from '/tmp/bot-wt/P5-57/app/ui/tests/support/connector-call.ts'
export { shellChildEnv } from '/tmp/bot-wt/P5-57/app/ui/tests/support/sdk-env.ts'
export { tmkdir } from '/tmp/bot-wt/P5-57/app/ui/tests/support/tmp-sweep.ts'
