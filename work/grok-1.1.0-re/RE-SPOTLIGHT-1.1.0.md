# RE-SPOTLIGHT-1.1.0：spotlight 全局快捷呼出（quick-chat）

来源：deb110 asar 静态逆向（main-app.cjs / chunk-spotlight-app-FTVveRyH.js / index-Ck4fJ-pO.js / preload.cjs）。
用途：1:1 复刻施工锚点。结论先行的更正：**spotlight ≠ 全局搜索**，是 OS 级快捷呼出的 quick-chat composer；搜索面仍是主窗口内 CommandPalette（mod+K，两版并存）。

## 1. 窗口架构

- `vlt` 创建：`new BrowserWindow({width:608,height:440,title:app.getName(),type:"panel",frame:false,transparent:true,backgroundColor:"#00000000",hasShadow:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,show:false,webPreferences:{additionalArguments:["--sand-spotlight"],contextIsolation:true,nodeIntegration:false,sandbox:true,preload:resolveSandMainWindowPreload}})`（`OLn=560,wB=24` → 608 宽；`oS={width:608,height:440}`）。
- 创建后 `setAlwaysOnTop(true,"floating")` + `setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})`。
- **同一 index.html**：`loadSandMainWindowDocument`（main-core.cjs `nie=../renderer/index.html`）。区分靠 argv `--sand-spotlight` → preload `exposeInMainWorld("sandSpotlight",{isSpotlight:argv.includes(...)})` → renderer `document.documentElement.dataset.sandSpotlight=''` + lazy `import("./chunk-spotlight-app-FTVveRyH.js")` → `U ? <SpotlightApp/> : <主应用树>`。
- 呈现位置：光标所在 display 的 workArea 水平居中，`y = workArea.y + height*0.22`（`e0n=.22`），clamp 到 workArea。
- 隐藏用 `setOpacity(0)+setIgnoreMouseEvents(true)`（非 hide()——无闪烁重定位）。

## 2. 拉起

- 全局快捷键，默认 **Alt+Space**；`globalShortcut.register`（通用 registrar 封装 `Y$`）。
- 条件：仅 darwin|linux + feature gate `sand_desktop_spotlight`（client 可配，**default:false**）+ 已登录 + isEnabled。
- 设置持久化 `userData/spotlight-settings.json`（`{version:1,isEnabled,shortcut}`）；设置 UI 在 chunk-general-pane-5uJsquQw.js（gate/平台不满足返回 null）。
- 快捷键格式校验：修饰键集合 `["Control","Command","Super","Alt","Shift"]` 顺序敏感。

## 3. RPC 面（declareRpcEdge("spotlight")）

- methods：readSettings / setEnabled{enabled} / setShortcut{shortcut} / setRecording{isRecording} / setOpensAtLogin{opensAtLogin} / requestDismiss / dismiss{presentationId} / holdOpen / setReady{isReady} / applyPlacement{placementId} / takeElementPick{pickId}。
- trust 双族：mainWindow 族=readSettings/setEnabled/setShortcut/setRecording/setOpensAtLogin；spotlight 窗口专属族=setReady/applyPlacement/requestDismiss/dismiss/holdOpen/takeElementPick。
- 事件：settings-changed / presented / dismiss-requested / hidden / placement-changed / element-picked。
- 时序常量：dismiss 回退 400ms、blur 宽限 150ms、pending-press 3000ms、placement 回退 250ms。

## 4. renderer app（chunk-spotlight-app-FTVveRyH.js 全文）

quick-chat composer，**无搜索框/无结果分区/无 ArrowDown 导航**：

- 选 bot：`{agents,mainAgentId,selectedAgentId:null,fallback:'most-recent-bot'}`——无用户选择 UI。
- 渲染共享 Composer（`composerMode:'secondary'`），sendTarget `{kind:'picked-bot',slotKey}`。
- 键盘：仅 Escape（document keydown → beginDismiss）；Enter 提交在共享 Composer 内。
- 外层 pointerdown 自身 → beginDismiss；发送成功 onSent → beginDismiss；点附件 onAttachClick → holdOpen。
- phase 机 hidden/presented/dismissing：`data-sand-spotlight-phase` 属性 + onAnimationEnd → finishDismiss（CSS 动画驱动消失）+ `dismiss({presentationId})` 二段收起。
- mount/unmount：setReady(true/false)；placement 变化 applyPlacement。
- element pick 附件：`{description,screenshot}` → File（selected-element.txt + png）经 handleStageFiles 注入。

## 5. element-pick overlay（macOS 专属配套，可后置）

- 仅 darwin：`process.platform==="darwin"?Kst({...}):void 0`。屏幕元素拾取→截图+描述作附件。
- 每显示器一个全屏透明覆盖窗（element-pick-overlay.html，focusable:false，showInactive）。
- 33ms 轮询光标 + macOS 辅助功能 sidecar inspect 光标下元素 → overlay 高亮 → 点击 captureRect 截图 → `Nst` 生成描述（role/label/value/url/text）→ main `hold(pick)` 暂存 → renderer takeElementPick 取回注入 composer。
- RPC：declareRpcEdge("spotlight-element-pick-overlay",{readView,pick{x,y},events})，trust overlayOrigin。

## 6. 与 CommandPalette 关系 / 0.78.1 对照

- 并存：CommandPalette=主窗口内 mod+K 命令面板（1.1.0 仍有 39 处命中）；spotlight=OS 级 quick chat。
- deb0781 全 grep spotlight 零命中（仅 Sentry integration 同名误中）——**spotlight 是 1.1.0 新增**。
- HiveBot 主线现状：overrides/modules/CommandPalette.tsx（0.78.1 形态，bots-search.spec 覆盖，tabs=all/bots/messages/files/links）。

## 7. 复刻施工切法（建议）

- B 批「搜索导航」更正认知：CommandPalette 已有（0.78.1 规格）——缺的是 1.1.0 增强面（待 delta）；**spotlight 归「1.1.0 新面批」**。
- spotlight 最小闭环：main 建 608×440 panel 窗（同 index.html + --sand-spotlight argv）→ preload isSpotlight → renderer 分支 SpotlightApp（quick-chat composer 复用现有 Composer）→ globalShortcut Alt+Space → Escape/外点/发送成功 dismiss。element-pick 与 macOS sidecar 后置（Linux 非目标）。
- Linux 差异：type:"panel" 与 visibleOnAllWorkspaces Linux 语义近似；globalShortcut 可用。
