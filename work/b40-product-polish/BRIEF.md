# B40 · 产品级打磨选材（BRIEF）

- 日期：2026-11-19
- 选材人：b40-planner（subagent）
- 范围：app/ui renderer-grok 前端，产品级打磨方向；不重复 B38（主题 token 清扫/性能判定/空态欢迎块/多 bot 压测）与 B39（断链全局反馈/对话框 Esc/焦点环/danger token）
- 基线：vitest 850/850
- 调查方法：读 `app/ui/renderer-grok/frontend/src/recovered/features/` 与 `src/production/` 代码找缺口；对照 0.78.1 参考资产 `work/grok-1.1.0-re/gb0781/extracted/dist/renderer/assets/`（关键文件：`index.eager-app-iGTgHP_Q.js`、`index.eager-common-DbK3Oi_r.js`、`chunk-view-ODc_03uE.js`）

共 3 张工单（2 S + 1 M），均 ≤ 半天。

---

## 工单 B40-A：快捷键帮助对话框（mod+/）（M）

**问题**：全仓无任何快捷键帮助/cheatsheet 组件（grep `ShortcutsOverlay|shortcutsHelp|mod+/` 零命中）。用户在 0.78.1 里 mod+/ 能弹出的 "Keyboard shortcuts" 对话框，我方完全没有。

**证据（我方）**：
- `app/ui/renderer-grok/frontend/src/recovered/features/window-chrome/global-keyboard-shortcuts.ts`：注册 21 个快捷键（mod+n/k/comma/shift+m/i+l/shift+f、alt+up/down、mod+bracketleft/right、mod+1-9、mod+b、可选 mod+f），但无任何查看这些快捷键的入口。
- `app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx`：grep `onCopyMessage` 零命中（见 B40-C）。
- `app/ui/renderer-groto/…` 无 shortcuts overlay 相关文件。

**证据（0.78.1 参考）**：
- `index.eager-app-iGTgHP_Q.js`：`var hNn=\`sand.keyboardShortcuts\`, gNn=[\`mod+slash\`,\`mod+shift+slash\`].join(\`, \`)` —— "Keyboard shortcuts" 动作绑定 mod+/ 与 mod+shift+/，`isEnabledInContentEditable:true`，`run:st.toggle`。
- 同文件 `ENn(e)` 对话框目录分 6 组：essentials/chat/navigation/panels/pages/window；jNn(e) 把 actions（id→hotkey Map）与目录合成 rows；chord 显示用 e8()：mac 符号表 bNn={ctrl:⌃,alt:⌥,shift:⇧,meta:⌘}，xNn 键名映射（equal:+, minus:−, bracketleft:[/], up:↑, down:↓），SNn={enter:↵,escape:⎋}；非 mac 用 Ctrl+/Alt+ 文字。
- 条目样例（en）：Search(mod+k / mod+shift+f)、New Bot(mod+n)、Send(enter，hint=新行用 shift+enter)、Go to Bot(range 1-9)、Compact sidebar(mod+b)、Settings(mod+comma)、Keyboard shortcuts(mod+/)、Focus chat(mod+i)、Find in chat(mod+f)、Dictate(mod+d, hint=Hold to talk)、Add selection to chat(mod+l)、Previous / next Bot(alt+↑/↓)、Back/forward(mod+[ / mod+])、Switch Bots(ctrl+tab, hint=Hold ctrl)、Details、Bot settings(mod+shift+comma)、Skills(mod+shift+w)、Connect apps(mod+shift+m)、Comment on the page、Zoom(mod+= / mod+- / mod+0)、Full screen(mac:ctrl+meta+f / other:f11)。
- i18n id（en 目录在 `index.eager-common-DbK3Oi_r.js`）：UQjid/=Essentials, AHZflp=Chat, UxKoFf=Navigation, GCrhIF=Panels, wRR604=Pages, T3Mld1=Window, 77Emn0=Keyboard shortcuts, A1taO8=Search, 2hjDEV=New Bot, JlFcis=Send, gxtNie=Go to Bot, dZ1Zpg=覆盖 sidebar, dZ1Zpg=Compact sidebar, Tz0i8g=Settings, 85qDhL=Focus chat, pF1b7U=Find in chat, mwHVVa=Dictate, lO8IrZ=Hold to talk, t1U5Lc=Add selection to chat, KmkBNH=Previous / next Bot, lNG0Eo=Back / forward, LES8xp=Switch Bots, 7/6Ntt=Hold(带 cycleKey), URmyfc=Details, q/EMCC=Bot settings, PCSkw2=Skills, h8AWBN=Connect apps, rBSlIP=Comment on the page, ACjxWW=Zoom, OwIqiD=Full screen, 8xEOPI=新行hint（en 值是数组含插值）。

**已知差异（写进工单，不照抄）**：0.78.1 里 `sand.focusInput=mod+i` 与 `sand.addSelectionToPrompt=mod+l` 是两个动作；我方 `global-keyboard-shortcuts.ts:52` 写的是 `"mod+i, mod+l"` 合并成一个 focusInput——我方没有 addSelectionToPrompt 动作，mod+l 实际复用为 focus prompt。对话框只列我方实际存在的动作，不照抄 add-selection。

**修法草案**：
- 新增 `recovered/features/window-chrome/shortcuts-overlay.tsx`（或并入 window-chrome），复用 `createRootShellShortcutActions` 的 label/hotkey 数据，按 ENn 式分组目录渲染。
- 注册 `sand.keyboardShortcuts` 动作（hotkey mod+/）进 controller。
- chord 渲染按平台选 ⌘/Ctrl（mac 判定用现有平台 seam；0.78.1 用 Re()，施工时在 bridge/navigator.platform 找现有判定）。
- 对话框复用 B39 已有的 OverlayDialog Esc 语义。

**验证**：vitest 单测（动作注册、hotkey mod+/ 命中、分组条目数、chord 渲染 mac/other 两态）；e2e（mod+/ 打开、Esc 关闭、内容可见）。改 tsx 后必须 `pnpm run build` 再跑 e2e（rig 吃 dist）。

**规模**：M（新组件 + 动作注册 + 平台 chord 渲染，半天内可完成）。

---

## 工单 B40-B：侧栏 relativeTime 边界打磨（S）

**问题**：`sidebar.tsx:104-111` 的 `relativeTime(updatedAt, now)` 现为 `seconds<60→"now"; minutes<60→"{n}m"; hours<24→"{n}h"; else "{n}d"`，d 值无上限——5000 天前的会话显示 "5000d"；超长值无本地化；未用 Intl 相对时间。

**证据（0.78.1 参考）**：
- `chunk-view-ODc_03uE.js` 有 `Fn(e,t)`：`n=Math.max(1,Math.floor((t-e)/1e3)), r=new Intl.RelativeTimeFormat(Re(),{numeric:\`auto\`})`，阈值表 `bn=[[year,31536e3],[month,2592e3],[week,604800],[day,86400],[human hour,3600],[minute,60],[second,1]]`（其中 "human hour" 为记录误写，正确为 hour），取第一个 n>=t 的单位 `format(-floor(n/t),unit)`，兜底 second。
- eager-app 的 sand-agent-item__time 文本来源没挖到底（React compiler 缓存变量名混淆），rHt 运行时长格式是 i18n 的 "{0}m"/"{hours}h{rest}m"（ZSWUwq={0}m, /oqig9={hours}h, AgDSOa={hours}h{rest}m）。**侧栏相对时间在 0.78.1 的确切格式未锚定**——按 Intl.RelativeTimeFormat(numeric:auto) 方向写，施工前在 0.78.1 资产再核对一次或接受合理近似。

**修法草案**：`sidebar.tsx` 的 `relativeTime` 换 `Intl.RelativeTimeFormat(locale,{numeric:"auto"})`，阈值表同 0.78.1 七档（year/month/week/day/hour/minute/second）；now=60s 内保留 "now" 或用 format(-n,"second")；模块级 Map 缓存 formatter（locale 键）避免每行新建。

**验证**：vitest 边界表（0s/59s/61s/59m/61m/23h/25h/6d/8d/30d/400d/未来时间），快照文本断言。e2e 不必（纯函数）。vitest node 环境支持 RelativeTimeFormat。

**规模**：S。

---

## 工单 B40-C：消息复制全局反馈（aria-live announce）（S）

**问题**：消息 hover 菜单 Copy 项点击后零反馈（无 toast、无按钮态变化）。`ProductionRenderer.tsx` 挂 `<ConversationTranscript>` 时未传 `onCopyMessage`（mount 块 2200 字符内无该 prop，grep 全文件零命中）→ `MessageActionAnchor onCopy={onCopyMessage}` 为 undefined → 回落 `message-actions.tsx:194` `clipboardCopyForEntry` 静默写剪贴板。Copy 按钮在 `message-actions.tsx:279`。代码块复制有反馈（`transcript.tsx:443-449` copied state + 1200ms "Copied"），消息级没有。

**证据（0.78.1 参考）**：`index.eager-app-iGTgHP_Q.js` 全局 toast `function pS(e,t)`：store `fS=q({polite:dS,assertive:dS})`，dS={message:'',tick:0}；pS(message,{assertive}) update 对应 channel {message,tick+1}，返回清理函数（把该条重置为空）。用法（Iw 组件，复制报告按钮）：`pGe(e).then(()=>{r(),pS(_i._({id:'6V3Ea3'}))},mGe)`，6V3Ea3="Copied"。消息 hover 菜单 Copy 项（hw.Item leading copy icon, label he3ygx="Copy"）onSelect 调用复制回调，反馈通道同为 pS 全局 live region（mS={visuallyHidden: 样式类 sand-10l6tqk 等}，视觉隐藏的 aria-live 区域）。

**修法草案**：
- 新增最小全局 announce store：`recovered/features/window-chrome/announce.ts`（polite/assertive 两 channel + tick 语义照抄 fS/pS）。
- 根部视觉隐藏 live region：aria-live=polite/assertive 各一，ProductionRenderer 挂载，样式用现有 visually-hidden 惯例。
- 消息复制路径（`clipboardCopyForEntry` 成功后或 `onCopyMessage` 包装）调 `announce("Copied")`。
- 可选增强（本单不做）：Copy 菜单项短暂变 "Copied"（对齐 Iw 的按钮文本切换）——需要菜单局部状态，M 规模，可后补。

**验证**：vitest（announce store 状态机：tick 递增、清理函数重置、polite/assertive 隔离；jsdom 断言 live region DOM 文本更新）；e2e 可选（copy 后 aria-live 内容）。

**规模**：S。

---

## 排除清单（核实为"原版即如此/已实装"）

| 候选 | 排除理由 |
|---|---|
| 侧栏空态/加载/错误状态完整性 | 已实装且超预期：RosterStatus（`recovered/features/roster/status.tsx`）四态齐全（loading "Connecting to your computer…" / empty "No saved agents yet." / all-hidden Show Hidden Bots 按钮 / error "Can't reach your computer" + Retry + Retrying…）；ProductionRenderer.tsx:3441-3447 rosterListStatus 只在 isLoaded 后给 empty/all-hidden；连接态走 CoordinatorConnectionHost（ProductionRenderer.tsx:3509）。transcript 加载失败有 TranscriptLoadErrorSurface（workspace/transcript-load-error.tsx，Retry 按钮，role=alert）；分页 isOlderPageFailed 也有。 |
| 会话重命名 | 已实装且超预期：双击行进入重命名（sidebar.tsx:294 onDoubleClick→setIsRenaming）；AgentNameEditor（production/AgentNameEditor.tsx，Enter 提交/Esc 取消/blur 提交/全选）；section 重命名 SidebarSectionNameEditor（sidebar.tsx:460 附近）；右键菜单（AgentRowActions.tsx:56-64 onContextMenu + ContextMenu/F10+shift 键盘开菜单）有 Edit Profile（含改名入口）。0.78.1 section 菜单 pencil Rename 与我方一致。 |
| 侧栏搜索 | 已实装：sidebar-search-trigger.ts 完整（click + 任意可打印键打开 command palette，Delete/Backspace stopPropagation 保护）；ProductionRenderer 挂 onOpenSearch={sidebarSearchTrigger}。0.78.1 同款（a0n search control 证据锚）。 |
| 超长文本截断 | 已实装：view.css:58 .sand-agent-item__name/__preview ellipsis；:41 section header ellipsis；:240-249 outline panel ellipsis。 |
| 消息时间戳悬停格式 | 证据不足不立单：transcript.tsx:863 `<time hidden>` 仅作 aria-labelledby 目标，视觉不可见；行首分组（data-group-start）已有；0.78.1 消息时间显示未深入核实。待查记录，非本轮工单。 |

---

## 建议施工顺序

1. **B40-C 复制反馈**（最小、独立 announce store，后续工单可复用 announce 原语）
2. **B40-B relativeTime**（纯函数+单测，零 UI 风险）
3. **B40-A 快捷键对话框**（最大张，依赖动作表数据，放最后吃足验证时间；改 tsx 需 build 再 e2e）

编号沿用 A/B/C 前缀，与 B38/B39 一致。
