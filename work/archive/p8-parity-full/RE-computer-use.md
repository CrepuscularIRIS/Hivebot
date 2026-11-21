# RE-computer-use · Grok Bot 0.78.1 本机 computer use 全链

日期：2026-11-05 · 任务：p8 T-01 · 方法：静态只读取证（解包树 `/dev/shm/grok-re/0.78.1/`，未运行目标）

缩写与锚点（`文件@字节偏移`）：
- `DAEMON` = `app/dist/local-exec-daemon/main.cjs`（3,945,762 B）
- `MAIN` = `app/dist/electron-main/main-app.cjs`
- `CORE` = `app/dist/electron-main/main-core.cjs`
- `COORD` = `app/dist/node-agent-coordinator/main.cjs`
- `APP` = `app/dist/renderer/assets/index.eager-app-iGTgHP_Q.js`

## 结论（先行）

1. **本机 CU 是「云端大脑 + 本地手」**：14 个 `computer_*` 工具的 schema 与调度全在 xAI 云端；本机 daemon 只是白名单转发器 + 审批门 + 结果整形器；真正的屏幕感知与操控在 macOS 闭源 helper（`CUCursorService`）里，daemon 经 stdio MCP（协议版 2025-06-18）驱动它。
2. **SCOPE N3 需修正**：终端类应用（runsShellCommands）不是「当作能跑 shell 的应用处理」，而是**硬黑名单拒绝**——"Grok Bot never drives a terminal… Ask the user to do this step themselves."（DAEMON@2122660）
3. **SCOPE N2 需修正**：`{isEnabled,allowedApps,minIntervalMs,maxPerWindow,windowMs}` 不是操控白名单+限速。真正的操控白名单 = **standing grants**（action=`use-app`、scope=`subject`）；这组字段挂在 `settings.notifications` 下，且 **0.78.1 被钉死**：读永远返回默认值（isEnabled:false），写被强制覆盖为 `{isEnabled:false}`（DAEMON@2081297）。无任何生效路径。
4. **Linux/Windows 上本机 CU 不存在**：helper 查找仅 darwin（DAEMON@3115400 区域 `Adt`），找不到 → `announcedTools()` 返回空 → **工具根本不广播给云端 agent**（DAEMON@3116320）。旁证：xAI 自家云 box 的 CU 驱动就是 Linux X11（`native_x11`/`xdotool` 两驱动，DAEMON@2852083）。
5. 安全设计是三层门（app 级审批卡 → macOS 系统权限 → helper 父进程校验）+ fail-closed 闸门文件；**没有**浏览器密码框专项防护、没有录屏、没有独立操作日志（审计 = 聊天工具调用记录 + 截图落盘 24h）。

## Q1 工具清单与语义（14 个）

清单（DAEMON@2119889 `Q5`）与两个配套表：

| 工具 | 作用域 `SI`（@2120165） | 动作类 `C5r`（@3121100） | 语义 |
|---|---|---|---|
| computer_screenshot | app | 否 | 截屏，返回 image |
| computer_click / move / drag / type / key / scroll | app | **是** | 鼠标/键盘动作 |
| computer_wait | free | 否 | 等待 |
| computer_check_permissions | free | 否 | 查 helper 的 macOS 权限 |
| computer_apps | free | 否 | 列运行中应用（文本 `APP pid=… target_id=… bundle=… app=…`，@2125700 `_Jt` 解析） |
| computer_resolve_app | resolve | 否 | 按标识找/启动应用（@2123900 `pJt`） |
| computer_app_state | app | 否 | 应用状态（含 element_id 的 AX 视图） |
| computer_set_value / app_action | app | **是** | 设值 / 应用内动作 |

- **参数**（daemon 侧只做校验，schema 本地不存在）：`app` 作用域工具必须带 `target={scope:"app",pid,target_id}`（DAEMON@2125200 `WBe`，pid 正整数 + target_id 非空串，缺省拒绝并提示 `uJt` 文案：「一次只驱动一个应用，全屏控制不可用」@2120700）；`element_id` 可选（AX 元素寻址）；`computer_resolve_app` 恰好传 `bundle_id` / `app_name` / `pid` 三选一（`lJt` 文案，@2120680），bundle_id 未运行时返回占位 handle 并可用 `mdfind`/`plutil` 解析显示名（@3130500 `Odt`）。
- **返回**：MCP content 数组 = text + `{type:"image",data:<base64>,mimeType:png|jpeg|webp}`（DAEMON@2127800 `AJt`）。**动作类工具成功后 daemon 自动追加一次 `computer_screenshot`（无 element_id）或 `computer_app_state`（有 element_id），把新视图拼进同一结果**（@3121100 `Sdt`）；补视图失败则插入提示文本要求模型先看再动（`p4e`）。即模型每个动作后必然拿到新鲜画面/状态。

## Q2 屏幕感知

- **本机链（macOS，闭源 helper）**：混合「截图视觉 + 无障碍树」。证据：① helper 必须持有 macOS **Screen Recording**（截图）与 **Accessibility**（操控/读 AX）两项系统权限（DAEMON@3115450 `b5r=["accessibility","screenRecording"]`、`Tdt` 权限名与设置面板映射）；② `computer_app_state` 与 `element_id` 表明 AX 元素级寻址，click/type 可带 element_id（daemon 对其透明转发，@3121635 唯一出现点在 `Sdt`）；③ 截图与 AX 状态在结果里并列返回。多屏/DPR/坐标缩放发生在 helper 内部，**本链不可见（未验证）**。
- **云 box 链（旁证，DAEMON@2257800 proto）**：`ComputerUseArgs` = 原子动作序列（mouse_move/click/mouse_down/mouse_up/drag/scroll/type/key/wait/screenshot/cursor_position，坐标 `Coordinate{x,y}`）+ 选项 `desktop_lease_actor_id`、`screenshot_settle_ms`、`native_x11_driver{typing_delay_ms,allow_fallback}`、`full_resolution_screenshot`、`omit_inline_screenshot`。驱动枚举 `native_x11`/`xdotool`（@2852083）→ 云电脑本身就是 Linux X11 + xdotool。
- **截图进上下文前的预算管线**（DAEMON@2899950 起）：统一转 **webp**；目标尺寸档 1280×800 / 1456×840（`Fct=1280`）；字节预算 1 MiB（`mg`），超限则每次缩 20%、最小边下限 8px 循环重编码；无编码器时 passthrough。

## Q3 白名单与限速

- **总闸门**：`local-computer-use-gate.json` `{isOn:bool}`（DAEMON@1994607 文件名；@2041900 `yMe` 读取——文件缺失/损坏 → false，**fail closed**，统一报错文案 `aB`「Computer use is not available on this computer right now.」@3103799）。写入方是 MAIN：`Kq(e)` 写 `{isOn:e}` mode 0600（CORE@747799，`sbe()` 路径 CORE@746440）。开关挂在设置 computer-use 节（N5）。
- **操控白名单 = standing grants**：`decideAppUse(bundleId)` → `decideLocalUse({action:"use-app",target,recipient:bundleId})`（DAEMON@3111100），ask/allow/refused；用户在审批卡选「always allow」→ scope=subject 的 grant。设置页的 allowed-apps 列表就是 grant 列表：`listComputerUseAllowedApps` / `revokeComputerUseAllowedApp`（MAIN@3030190 `Pbt`，过滤 `action:"use-app"`, `scope:"subject"`）。会话内重复用同一 app 走 `takeFreshGrant` 免再问（@3110050）。默认无 grant。
- **硬黑名单（不可审批绕过）**：`oJt` 六类（DAEMON@2120400，全部 macOS bundle id）：`runsShellCommands`（Terminal/iTerm2/Warp/kitty/Alacritty/WezTerm/Ghostty/Hyper）、`runsScripts`（Script Editor/Automator/Shortcuts）、`holdsPasswords`（Keychain Access/Passwords）、`hostsTerminalsAndAgents`（Cursor 全系）、`changesSystemSettings`、`hostsGrokBot`（自家 + `com.anysphere.sand.*`/`co.anysphere.grok-bot-*` 前缀 @2120880）。命中即 refused（`yce`，@2123100），文案让用户自己动手。
- **限速字段是钉死的死配置**：`settings.notifications {isEnabled(默认 false),allowedApps:[],minIntervalMs:5000,maxPerWindow:10,windowMs:300000}`（DAEMON@2060982 `RLe`；schema @2063068 `$Ft`；MAIN@1426400 `cvn`；COORD@978400 `jne` 同构）。**读**：`getNotificationConfig()` 无条件返回 `RLe`（DAEMON@2081297）；**写**：`setNotificationConfig()` 无视入参强制持久化 `{isEnabled:false}`。推断其设计意图是「CU 操作通知（哪些 app 弹通知+频率限制）」，当前版本无生效路径。
- 实际存在的节流：**每 conversation 串行队列**（`oneCallAtATime`，排队时 60s keepalive 通知 UI，DAEMON@3116360）。

## Q4 安全边界

- **凭证类窗口**：仅 `holdsPasswords` 两款（macOS 钥匙串/密码 app）。**没有**浏览器密码框/自动填充检测——Chrome、Safari 不在任何黑名单，可被操控（浏览器防护走 N8 cookie 审批另一条线）。**否：无浏览器密码框专项防护。**
- **用户在场/确认（三层门）**：① app 级审批卡：ask 状态推 `GrokBotUserComputerLocalToolPermissionPending`（proto，DAEMON@3518800）给 UI，renderer 有对应审批组件（`chunk-view-DgwOjGyI.js` 头部 14 工具名单 + app tile 审批 UI）；② helper 的 macOS 系统权限门：非 free 作用域工具首用前 `computer_check_permissions`，缺权限则等待用户去系统设置开启（轮询 + `onPermissionPending`，预算约 30s+，DAEMON@3115350 `p5r=f5r+LLe`、`awaitGrant`）；运行中 helper 报 `permission_required`（`O5r`：structuredContent.code 或文本 `recovery=request_permission`）也会停下等授权再重试一次（`runUntilGranted`）。③ helper 拒绝非预期父进程：exit 77（DAEMON@3115260 `_5r=77`）。
- **审计**：截图落盘 `tmpdir()/grok-bot/screenshots/computer-{16hex}.{png|jpg|webp}`，目录 0700、文件 0600、`wx` 不覆盖、**24h 自动清理**（DAEMON@2126343 `_I`/`xJt=1440*6e4`）；结果里追加「Screenshot saved to <path>」文本。**否：无录屏；无独立操作日志文件**（操作轨迹 = 会话内的工具调用记录本身）。
- **紧急停止**：**无专用 panic 键/热键**。有：取消（abort → `notifications/cancelled` 发 helper；取消文案明说「请求已到达你的电脑，动作可能已执行」`y5r`）、daemon 关闭时停全部会话（`close()`）。云 box 链另有 `desktop_lease`（`computer_use.desktop_lease.check` 指标 @2852638，多 actor 桌面租约仲裁），本机链未见对应物。
- **helper 完整性与分发**：bundled 在 `.app/Contents/Helpers/`（prod/lab/orbit/dev 四 channel，`GROK_BOT_SIDECAR_APP` 可覆盖，DAEMON@2086000 `Dd`）；与 Cursor 共享安装 `~/.cursor/computer-use-sidecar`（@2868977 `zs.sharedInstallRelativePath`）；更新 manifest URL 服务端下发且域名+40 位 sha 严格白名单 `https://downloads.cursor.com/computer-use-sidecar/releases/{c}/{v}/{sha40}[-win32-x64|…].json`（MAIN@1672000 `Uft`/`Fft`）；本地安装做逐字节全等校验后原子 rename 替换（`$ae`/`u$t`）。

## Q5 与 agent 的接口

- **暴露对象：云端 bot（主 bot / computerUse 子 agent），不是本地进程**。工具通过 `localTools()` 上报 `{computerUse:[14 工具名], device:[…]}`（DAEMON@3104600），helper 不可用（闸门关 / 非 macOS / 未安装）时 `computerUse:[]`——**工具不进 agent 上下文**。参数 schema 与 system prompt 在 xAI 服务端（本地三进程 + renderer 均无 schema 定义，仅工具名字符串）。
- **调用链**：云端 agent → local-exec SSE/control 通道（proto 族 `GrokBotUserComputer{ClientMessage,ControlMessage,Exec,File,Download,Cancel,Capabilities,Connected,Credential…,LocalTool*,LocalToolResult,LocalToolPermissionPending}`，DAEMON@3510584–3524041）→ daemon `local-tool` 分支 → `cB.call` → **每 conversation 一个 helper 实例**（spawn `--mcp-stdio --conversation-id <id>`，JSON-RPC 2.0，`initialize` 协议版 2025-06-18，`tools/call` 直呼工具名，daemon 从不调 helper 的 `tools/list`，DAEMON@3117500 `g4e`）→ 结果经 `doneWith` = `withSavedScreenshots`（保留 image 块 + 落盘）→ `JSON.stringify` → `GrokBotUserComputerLocalToolResult{status,output_json,error}` 回云。
- **截图进上下文的方式**：output_json 内嵌 MCP content 数组，image base64 原样上行（受 Q2 预算管线约束）；云端可另从本机截图目录读文件（saved-to 路径已在结果文本里）。helper 生命周期：租约计数，空闲 10 分钟自杀（`d5r=10*6e4`）；单次调用 2 分钟超时（`bdt`）即停 helper。子 agent 侧另有设置项 `computerUseModel`（DAEMON@2061000 区 `NLe`、MAIN@1428624；UI 呈现见 N6，本轮未展开）。

## Q6 对我们的启示

**可照抄（搬运阶梯：行为逆向，实现自建）**
1. 三作用域（free/app/resolve）+ target 句柄 `{pid,target_id}` + 从 `computer_apps`/`resolve_app` 文本输出学习句柄缓存（`gI`/`APP `/`SELECT ` 行格式）——「一次只驱动一个应用、无全屏控制」这个产品语义值得原样保留。
2. **动作后自动补视图**（`Sdt`）：动作类工具结果里强制追加 screenshot/app_state，保证模型下一步永远看着新画面；补不到就明说。
3. 截图预算管线：webp + 1280 档 + 1MiB 循环缩放 + 0600 落盘 24h 清理——一组常数直接可用。
4. 六类硬黑名单 + 「让用户自己做」的拒绝文案；per-app standing grant 白名单 + 审批卡 always-allow + 会话内 freshGrant 免重复问。
5. fail-closed 闸门文件（缺文件=关）+ 每 conversation 串行队列 + 工具集按 helper 可用性动态广播（不可用就整族消失，而不是报错）。
6. helper 进程隔离 + 父进程校验（exit 77）+ 空闲自杀：与我们 bwrap 沙箱外的驱动进程设计吻合。
7. 云 box 驱动枚举证明 xAI 自家 Linux CU = **native X11 + xdotool 两档**：我们直接对齐这个组合（Xvfb + xdotool，native 档留接口）。

**该改 / 不照抄**
1. 执行面不同：原版操控**用户真实桌面**（所以要黑名单+审批+macOS 权限三重门）；我们基线是 **Xvfb 隔离屏 + bwrap**，风险模型更接近原版的云 box（那边就没有 per-app 审批，只有 desktop_lease）。设计取舍：若 p8 走「隔离屏」路线（§2.1 第③层重释），黑名单可降级为「哪些 app 允许进入沙箱屏」的安装白名单；若日后开「真桌面」模式，三层门全要。
2. 补上原版没有的：浏览器密码框防护（我们 bwrap 内浏览器可拦 `type=password` 输入要求提权）、CU 动作并入 p7 的 jsonl 审计（原版只有截图文件）。
3. `settings.notifications` 那组限速字段是钉死的死代码，不抄。
4. 超时体系收紧：原版 helper 单调用 2 分钟、sidecar RPC 45s，对 xdotool 链太松；我们 P5/P6 的审批档位沿用，CU 动作建议秒级超时 + 审批一次覆盖一组动作（原版 ask 粒度是 per-app 首次，不是 per-action，可保留）。
5. desktop_lease（用户抢回桌面 → bot 让路/暂停）与我们「用户可随时接管 Xvfb 屏」的设计直接对应，值得实现为「屏被接管时挂起队列」。
6. 多机路由（N7）与本报告正交，未取证。

## 证据索引

| 结论 | 锚点 |
|---|---|
| 14 工具 + 作用域 + 动作标记 | DAEMON@2119889（Q5）、@2120165（SI）、@3121100（C5r/Sdt） |
| 硬黑名单六类 + 拒绝文案 | DAEMON@2120400（oJt）、@2122660（wce）、@2120880（前缀）、@2123100（yce） |
| 闸门文件 fail-closed + 写入 | DAEMON@1994607、@2041900（yMe）、@3103799（aB）；CORE@746440/747799（Kq） |
| 限速字段钉死 | DAEMON@2060982（RLe）、@2081297（get/setNotificationConfig）、@2063068（$Ft）；MAIN@1426400；COORD@978400 |
| 白名单=standing grants | DAEMON@3111100（decideAppUse/decideLocalUse）；MAIN@3030190（Pbt）；HBt 动作表 DAEMON@2042400 |
| macOS 权限门 | DAEMON@3115450（b5r/Tdt）、@3115350（awaitGrant）、@3121656 附近（O5r/runUntilGranted） |
| helper 客户端协议 | DAEMON@3117500（g4e：MCP stdio、2025-06-18、2min/10min、exit 2/77） |
| helper 定位/安装/校验 | DAEMON@2086000（Dd/四 channel）、@2088300（ZLe/$ae 原子替换）、@2868977（zs）；MAIN@1672000（URL 白名单） |
| 截图落盘+清理 | DAEMON@2126343（_I）、2126500 区（xJt=24h、bJt 文件名） |
| 截图预算管线 | DAEMON@2899950（Fct/mg/Hs）、@2901800（webp 循环缩放） |
| 工具广播与上报 | DAEMON@3104600（localTools）、@3116320（announcedTools）、@3115400（Adt 仅 darwin） |
| 云 box CU proto/驱动 | DAEMON@2257800（ComputerUseArgs/Action）、@2852083（native_x11/xdotool、desktop_lease 指标） |
| local-exec wire proto | DAEMON@3510584–3524041（GrokBotUserComputer* 族）、@3518800（LocalToolResult/PermissionPending） |
| 审批 UI（renderer） | renderer/assets/chunk-view-DgwOjGyI.js@1217（名单+审批组件） |

## 局限与未验证项

1. `CUCursorService` 为 macOS 闭源二进制（本机无 Ghidra/IDA，原生深度反编译不可用）：截图捕获方式、AX 树结构、多屏/HiDPI/坐标缩放、element_id 的具体寻址实现均**未取证**；本报告对该层的描述止于 daemon 侧可观察的接口契约。
2. 14 工具的参数 schema、模型侧 system prompt、云端审批策略在 xAI 服务端，静态不可得。
3. 全程静态分析，未运行目标；取消语义（「动作可能已执行」）等运行时行为未复现。
4. 未使用 REA `analyze_javascript_application` 全树分析（minified bundle 语义图收益低于直接字节取证，成本考量）；全部结论可由上表锚点复核。
5. N5（权限 UI 四节）、N6（computerUse 子 agent UI/模型选择）、N7（多机）仅核对到入口，细节留 T-02/T-04。
6. minified 单字母标识符（`Q5/SI/oJt/cB/g4e/_I/jBe/yce` 等）为 bundle 内真实名字，人工还原其语义；如上游版本变动需重新定位。
