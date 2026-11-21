# B6 spotlight 全局快捷呼出（quick-chat composer）

日期：2026-11-18
状态：计划（native 执行）

## Goal

1:1 复刻 Grok Bot 1.1.0 spotlight：Alt+Space 全局呼出 608×440 无边框置顶窗，单输入框直达 most-recent-bot，发完即收（Escape/外点/发送成功三路 dismiss）。规格锚 work/grok-1.1.0-re/RE-SPOTLIGHT-1.1.0.md。

## Architecture

- main 进程：`createSpotlightWindow`（608×440 panel，frame:false transparent alwaysOnTop floating skipTaskbar，show:false）+ globalShortcut Alt+Space（可配置，存 userData/spotlight-settings.json）+ toggle 呈现（光标 display workArea 水平居中 y=height*0.22）+ setOpacity(0)+setIgnoreMouseEvents(true) 隐藏（无闪烁重定位）。
- 窗内容：同主窗 `${SCHEME}://app/` 同 URL + argv `--pbots-spotlight` → preload exposeInMainWorld('pbotsSpotlight', {isSpotlight}) → renderer 入口分支（dataset 标记 + lazy SpotlightApp）。
- renderer：SpotlightApp = quick-chat composer（复用现有 composer 组件面：`composerMode:'secondary'` 等价形态——shim sendPrompt 走 DSH），无搜索框无分区；Escape/外点 pointerdown 自身/发送成功 → dismiss；phase 机 hidden/presented/dismissing（CSS 动画 + data-pbots-spotlight-phase）。
- RPC：走既有 pbots preload ipc 通道（spotlight 窗与主窗同 preload 同协议——不加新 edge，窄函数：dismiss/presented/holdOpen 状态同步够最小闭环用）。
- 不做（后置）：element-pick overlay（macOS 专属）、setOpensAtLogin/setRecording、opensAtLogin、feature gate 远端开关（本地 settings.json 即可）。

## Tech Stack

Electron main/preload/renderer 既有栈；无新依赖。

## Spec 路径

work/grok-1.1.0-re/RE-SPOTLIGHT-1.1.0.md（1.1.0 产物静态逆向规格）

## Global Constraints

- 窗口 608×440（RE 实证 OLn=560+2*wB=24）；默认快捷键 Alt+Space；快捷键注册失败降级不致命（记日志+设置面板显示未注册）。
- spotlight 窗须与主窗同 preload（pbots 三窄函数）——shim RPC 通，composer 直接可用。
- e2e 隔离：PBOTS_APP_URL 环境变量驱动；globalShortcut 在测试里不真注册（CI/Xvfb 无 compositor）——e2e 用 IPC 直接触发 toggle 测窗口生命周期，globalShortcut 注册只做单测 mock。
- 安全：spotlight 窗 will-navigate/setWindowOpenHandler 同主窗收紧（pbots-app: only）；globalShortcut 回调只 toggle，不执行任何 shell。

## Review Focus（5 条最可能咬人的）

1. **窗口泄漏**：toggle 多次/快速连按 → 窗口或 setInterval 泄漏——e2e 关窗后 BrowserWindow.getAllWindows 计数归位；dispose 测试。
2. **快捷键冲突**：Alt+Space 被系统/GNOME 占用 → register 失败路径——单测 mock registrar 返回 false，断言降级日志+设置面板显示。
3. **argv 分支误伤**：主窗误带 --pbots-spotlight（主窗 argv 不加）→ 主窗渲染成 SpotlightApp——e2e 断言主窗无 dataset.pbotsSpotlight。
4. **shim 通路**：spotlight 窗 composer 发消息走 shim sendPrompt——DSh handoff 在 spotlight 窗里可用（同 preload）——e2e 在 spotlight 窗里发消息断言 transcript 落。
5. **dismissing 动画时序**：CSS 动画时长 vs main 侧 dismiss 回退 400ms——e2e 按 phase 属性断言二段（dismissing→hidden），不依赖固定 sleep。

## 任务

### B6.1 main 进程 spotlight 窗 + 快捷键

Files: app/ui/main/spotlight.ts (新), app/ui/main/index.ts, app/ui/main/window.ts (不动——新窗独立文件), app/ui/tests/unit/main/spotlight.test.ts (新)

Interfaces:
- Consumes: BrowserWindow, globalShortcut, app 从 electron；SCHEME from './sender'；preload 路径（index.ts:209 同款）。
- Produces: `createSpotlightService(preload: string): { toggle(): void; present(): void; dismiss(): void; dispose(): void; setShortcut(a: string): Promise<boolean>; isEnabled(): boolean }`

步骤:
- [ ] 失败测试：spotlight.test.ts——①createSpotlightService 建 608×440 窗（mock BrowserWindow 断言参量）②toggle 呈现位置=光标 workArea 水平居中 y=0.22h ③dismiss 后 opacity=0+ignoreMouseEvents ④dispose 注销快捷键+关窗 ⑤register 失败降级（mock 返回 false——不 throw，记 warn）
- [ ] 跑测试确认红（模块不存在）
- [ ] 最小实现 spotlight.ts（照 RE 规格参量；settings.json 读写 {version:1,isEnabled,shortcut}）
- [ ] index.ts 接线（app ready 后 createSpotlightService；主窗 closed 不影响 spotlight？——1.1.0 主窗关 spotlight 仍可呼出；MVP：主窗 closed 时 spotlight 也关（简化生命周期，注释说明））
- [ ] 跑测试绿 + commit

### B6.2 preload 分支 + renderer SpotlightApp

Files: app/ui/preload/index.ts, app/ui/renderer-grok/frontend/src/index.tsx (入口分支), app/ui/renderer-grok/frontend/src/production/SpotlightApp.tsx (新), app/ui/tests/e2e/b6-spotlight.spec.ts (新)

Interfaces:
- Consumes: pbots preload 既有三窄函数；composer 发送链（shim sendPrompt via pbots ipc）；most-recent-bot（roster 顺序）。
- Produces: `SpotlightApp`（默认导出，props 无——自取 roster/composer）；入口 `if (window.pbotsSpotlight?.isSpotlight) render SpotlightApp else 主树`。

步骤:
- [ ] 失败测试 b6-spotlight.spec.ts：①PBOTS_APP_URL 起 spotlight 窗（main 测试钩子 toggle）→ dataset.pbotsSpotlight + composer 可见 ②输入+发送 → shim transcript 落（session/list 后 session/events 查）③Escape → phase dismissing→hidden（动画后窗 opacity 0）④主窗不受影响（无 dataset）⑤外点 dismiss
- [ ] 跑确认红
- [ ] preload 分支（process.argv.includes('--pbots-spotlight') → exposeInMainWorld('pbotsSpotlight',{isSpotlight:true})——同三窄函数保留）
- [ ] 入口 lazy 分支 + SpotlightApp.tsx（quick-chat：取 roster most-recent-bot + composer 复用 + Escape/外点/发送成功 dismiss——CSS phase 动画照 RE）
- [ ] build + e2e 全绿 + commit

### B6.3 合并回测

- [ ] 主线 merge --no-ff
- [ ] build + 单测全量 + e2e b6+回归（session/b4/b5/t91）绿
- [ ] LOG.md 记行
