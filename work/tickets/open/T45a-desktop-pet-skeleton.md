# T45a：桌宠骨架——透明置顶小窗 + bot 状态事件链 + 默认大肥鱼

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：`work/exp-polish/BRIEF.md`「2026-11-09 追加二」第 1 项（「可以加入试试看，然后代替原来的 bot 效果」）；scout F `work/research-reposcan/scout-f-pet-room-community.md` §一、:117-127。queue「桌宠 + Windows 分发」节 P1。
> 分支 / 作业目录：feat/T45a @ /tmp/bot-wt/T45a（新文件为主；`main/index.ts`、`preload/index.ts`、`shim/src/data.ts` 各加几行接线）
> claimed：
> accepted：

## 目标
Hivebot 启动后桌面右下角出现一只透明背景、置顶的大肥鱼。它的动作跟着 bot 状态走：有 bot 在等你批准或回答 → 踱步张望；有 bot 在跑 → 思考冒泡 / 忙碌点按；跑完 → 雀跃庆祝一次；出错 → 垂头叹气一次；都闲着 → 待机呼吸。能拖着走；单击挥手并把 Hivebot 主窗拉到前台；右键能「Hide pet」（只管本次运行）。

## 方案定案（经理探针，2026-11-09）
走「复用资产不复用壳」：资产与状态表抄 dsh-pet，窗口和事件链用我们自己的。理由（逐级，搬运阶梯）：
1. **dsh-pet 装进我们 SDK 的 dsh host 当插件**：不行。npm `dsh-pet@0.4.7` 的 peer 带 `dsh-credentials`、依赖 `openai` / `@anthropic-ai/sdk`，会在 host 进程里拿凭证去聊天、碎碎念（违反「凭证不进模型 / 第三方」）；路由 `/dsh-pet-7340/*` 挂在 dsh web 端口上**无鉴权**（`API.md`）；它的桌面窗由 host 侧起、要自己下 Electron 43.3.0 到 `~/.dsh/electron`，宠物会出现在 **host 那台机器**的桌面——Windows 客户端连 Ubuntu（T46 线）时宠物会跑到 Ubuntu 上。
2. **dsh-pet standalone 当旁挂进程**：它「不连 DSH」，只能经 `POST /dsh-pet-7340/work-status {state}` 外部喂状态（127.0.0.1:3080，无鉴权）。可行但：两份 Electron（43.3 + 我们 44.7）、Windows 包里要再带一个 app、点宠物回不到我们的 bot、生命周期要自己管。作为 Q-044 选项 B 留给用户。
3. **复制改造（本单）**：dsh-pet 代码 MIT、透明 WebM 直接能被 Chromium `<video>` 播；状态表就是它的 `src/shared/work-status.ts` 六档 + `assets/config.jsonc` 的 `animations.events.workStatus`。我们只搬 9 个 WebM（约 3.8 MB）和映射表。
4. 事件源**不新开 dsh 接口**：shim 已有每个 bot 的 `factsOf(id)`（`renderer-grok/shim/src/data.ts:203`：blockedReason / running / unread / end）和档位函数 `rankOf`（`shim/src/workers.ts:66-72`，「审批/提问 > 回合中 > 出错/停止 > 新结果 > 空闲」），正好是宠物要的优先级。dsh-pet 的六档里只有「整理（tool/result）」我们拿不到逐工具事件（没打开的会话没有 follow 流），本单不做这一档。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. dsh-pet：`git clone --depth 1` 到 `repos/PC2005-cloud__dsh-pet`（钉 `c25386848f70f6e40902e4376f6e7b1e196bc326`；先查 `repos/MANIFEST.tsv`，加一行）。读 `dsh-pet/src/shared/work-status.ts`、`dsh-pet/src/host/plugin/session-watch.ts`（状态规则）、`dsh-pet/assets/config.jsonc`（`animations.idle` / `events.workStatus` / `clicks` / `drag`）。
3. 我们这边：`app/ui/main/window.ts:67-100`（安全偏好照抄）、`app/ui/main/sender.ts`（特权 IPC 只认主窗主 frame——**不放宽**）、`app/ui/main/index.ts:197-230`（`pbots-app` 协议 + `pbots:theme` 单向通道先例）、`app/ui/preload/index.ts:36-37`（setTheme 先例）、`renderer-grok/shim/src/workers.ts`、`data.ts:190-230`、`agents.ts:70-80`（「本回合是否有在跑的工具」）、`scripts/stage-renderer.mjs`。

## 规格
**状态（`PetState`）与动画**（文件名即 dsh-pet `assets/webm/<名>.webm`，逐字）：

| state | 判定（对 roster 全部 bot 取 `rankOf(factsOf(id))` 最小者 = 「领头 bot」） | 动画 | 播放 |
|---|---|---|---|
| `waiting` | 领头 rank 0（有审批 / 提问在等） | 工作状态-原地踱步张望 | 循环 |
| `working` | rank 1，且该 bot 的 follow 视图本回合有在跑的工具；**视图未加载也算 working** | 工作状态-忙碌点按 | 循环 |
| `thinking` | rank 1，视图已加载且本回合无在跑工具 | 工作状态-思考冒泡 | 循环 |
| `error` | rank 2 且 end=`failed`（`stopped` 不算错，归 idle） | 工作状态-垂头叹气冒汗 | 一次 → idle |
| `success` | rank 3 且 end=`ok` | 工作状态-雀跃庆祝 | 一次 → idle |
| `idle` | 其余 / roster 空 | 待机呼吸休闲 | 循环 |
| （点击） | — | 点击回应-元气挥手 | 一次 → 回当前 state |
| （拖动中） | — | 被鼠标拖拽悬空反馈 | 循环，松手回当前 state |

**事件链**：
1. shim 新纯函数 `petStateOf(...)` → `{ state, botId }`；data.ts 在已有的 roster / view 变化回调处算一次，**与上次 `(state, botId)` 相同就不发**（另一个 bot 也成功 → botId 变 → 会再庆祝一次）。发送走 preload 新方法 `window.pbots.setPetState({state, botId})` → `ipcRenderer.send('pbots:pet-state', …)`。
2. main `ipcMain.on('pbots:pet-state')`：`assertPbotsSender(event, mainWindow)` + state 枚举校验 + botId 形状校验（复用 `main/skills/index.ts:34` 的 `BOT_ID_RE`：导出一处，不复制），不合法丢弃并计数。main 记住最新 `{state, botId}`，**只把 `state` 转给宠物窗**（宠物窗拿不到 botId、标题、任何正文）。
3. 宠物窗：`BrowserWindow({ transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, width: 200, height: 200 })`，`webPreferences` 与主窗同一套（`sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, devTools: false`），独立 preload `preload/pet.ts` 只暴露 `onState(cb)`、`click()`、`move(dx, dy)`、`menu()` 四个。页面放 `app/ui/pet/`（`index.html` + 一个 js + `assets/fish/*.webm`），由 `stage-renderer.mjs` 拷到 `out/renderer/pet/`，经现有 `pbots-app://app/pet/index.html` 加载（不开新协议）。窗口导航限制照抄主窗（`will-navigate` 拦、`setWindowOpenHandler` deny）。
4. 宠物窗 → main 三个通道（`pet:click` / `pet:move` / `pet:menu`）：只认 `event.sender === petWindow.webContents` 且 `senderFrame === petWindow.webContents.mainFrame`；**主窗发来的同名消息也拒**。`pet:move` 只收两个有限整数（|dx|,|dy| ≤ 2000），main 按当前位置加偏移再夹进所在显示器 workArea 后 `setPosition`。`pet:click` → `mainWindow.show(); mainWindow.focus()`（打开领头 bot 等 T42 修好 `pbots:open-worker` 接收端后再接，本单不做）。`pet:menu` → 原生 `Menu`，一项「Hide pet」→ `petWindow.hide()`（本次运行；持久开关进 T45b）。
5. 拖动：页面里 pointerdown/pointermove/pointerup 自己算位移发 `pet:move`；位移 < 4px 的 pointerup 算点击。**不用 `-webkit-app-region: drag`**（拖动区里收不到点击事件）。
6. 生命周期：主窗 `ready-to-show` 之后建宠物窗，初始位置主显示器 workArea 右下角内缩 24px；主窗关闭（应用退出）时一并销毁；`PBOTS_PET=0` 时不建（e2e 现有用例默认关，免得改变它们的窗口数；本单 e2e 显式开）。

## 边界
1. 只动：`app/ui/main/pet/**`（新）、`app/ui/main/index.ts`（接线 ≤30 行）、`app/ui/preload/index.ts`（+1 方法）、`app/ui/preload/pet.ts`（新）、`app/ui/electron.vite.config.ts`（第二个 preload 入口）、`app/ui/pet/**`（新：页面 + 9 个 WebM + `SOURCE.md`）、`app/ui/scripts/stage-renderer.mjs`（拷 pet/）、`app/ui/renderer-grok/shim/src/pet.ts`（新）+ `data.ts` / `index.ts` 接线、`repos/MANIFEST.tsv` 一行、`main/skills/index.ts`（只把 `BOT_ID_RE` 改成 export）、对应测试文件。**不碰** renderer-grok 的 frontend / overrides、`app/sdk`、launcher、`sender.ts`。
2. 先写失败测试：`tests/unit/grok-shim/pet.test.ts` ①–⑥（下方），看它红再写 `pet.ts`。
3. 资产出处：`app/ui/pet/assets/fish/SOURCE.md` 写 `来源: https://github.com/PC2005-cloud/dsh-pet@c25386848f70f6e40902e4376f6e7b1e196bc326:dsh-pet/assets/webm/<文件>`、代码 MIT、**角色形象 CC BY-NC-SA 4.0（不可商用；原型「溟月」@上善无形，女仆鲸鱼娘设计 @ZipZipPipe；衍生须附 https://github.com/PC2005-cloud/dsh-pet）**；commit 正文同样写来源。这是私用可以，对外分发前要换自有形象（记 T45b）。
4. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；只跑下面列的 e2e，不跑全量。
5. 不做：形象切换 / 导入、持久化开关与位置、点宠物打开具体 bot、气泡文字、物理（Q 弹 / 甩抛 / 漫游 / 睡觉）、鼠标穿透透明区、多屏 DPI 调优——分别在 T45b / T45d（原写 T45c，编号已让给返修单）/ T42 之后。

## 验收（写命令，不写感觉）
所有命令在 `app/ui` 下；vitest 带 `--config.verify-deps-before-run=false`（pnpm）。
1. `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim/pet.test.ts` → 全绿，至少这些格：
   - ① 一个 bot rank 0 + 另一个 rank 1 → `waiting`，botId = rank 0 那个
   - ② rank 1 且视图本回合有 running 工具 → `working`；视图已加载无 running 工具 → `thinking`；视图未加载 → `working`
   - ③ rank 2 / end `failed` → `error`；rank 2 / end `stopped` → `idle`
   - ④ rank 3 / end `ok` → `success`
   - ⑤ roster 空、全 rank 4 → `idle`，botId null
   - ⑥ 去重：同一输入连算两次只发一次；`success` 的 botId 换了再发一次
2. `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/shell/pet-ipc.test.ts`（新，main 侧，假 BrowserWindow 注入）→ 全绿：
   - ⑦ `pbots:pet-state` 来自非主窗 / 非主 frame → 丢弃，宠物窗没收到；未知 state → 丢弃；botId 形状不对 → 丢弃
   - ⑧ 合法 state → 宠物窗收到 `{state}` 且**载荷里没有 botId 键**
   - ⑨ `pet:click` / `pet:move` / `pet:menu` 来自主窗 → 拒；来自宠物窗 → 生效（click 调了 show+focus；move 夹进 workArea：给超大 dx 断言落在边内；非整数 / 超 2000 丢弃）
   - ⑩ 建窗参数断言：`transparent/alwaysOnTop/skipTaskbar === true`，`webPreferences` 的 `sandbox/contextIsolation === true`、`nodeIntegration/devTools === false`、preload 指向 `pet` 入口
3. 变异（各改一处跑对应格，必须红，回执贴红尾后还原）：V1 `petStateOf` 取 rank 最大者 → ① 红；V2 删 `pet:click` 的 sender 判定 → ⑨ 红；V3 宠物窗 `sandbox: false` → ⑩ 红；V4 转发宠物窗时带上 botId → ⑧ 红。
4. 覆盖：`pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim/pet.test.ts tests/unit/shell/pet-ipc.test.ts --coverage --coverage.include=renderer-grok/shim/src/pet.ts --coverage.include='main/pet/**'` → 两处改动行 ≥80%，回执贴表。ui 仓 coverage 工具链有已知问题（`receipts/T23.md` 验收 2：custom provider 计 0%）——取不到数就照 T23 先例逐函数 / 逐分支手工核算，列出每个分支由哪一格触达。
5. `pnpm --config.verify-deps-before-run=false build && ls out/renderer/pet/assets/fish/*.webm | wc -l` → `9`；`out/preload/` 下有宠物 preload 产物。
6. 新 e2e `tests/e2e/pet.spec.ts`（`PBOTS_PET=1`；起法复用 `p6-notify.spec.ts` 的 `launchSdkRuntime` + 测试插件给 worker 投任务、挂审批）：`pnpm exec sh scripts/run-e2e.sh tests/e2e/pet.spec.ts` → 通过，断言：
   - 应用里出现第二个窗口，URL `pbots-app://app/pet/index.html`，页面根元素 `data-state` 依次经过：启动 `idle` → 投任务后 `thinking` 或 `working` → 挂审批时 `waiting` → 批准后回合完成 `success` → 动画结束回 `idle`（轮询 `data-state`，不 sleep 定时）
   - `<video>` 的 `currentSrc` 文件名与上表该档一致；`readyState ≥ 2`（真播起来了，不是空壳）
   - 在宠物窗上点一下 → 主窗 `isFocused()` 为真（Xvfb 下若窗口管理器不给焦点，改断言 main 侧 `show`/`focus` 调用计数，回执写明）
   - 回归：`pnpm exec sh scripts/run-e2e.sh tests/e2e/p6-notify.spec.ts tests/e2e/p6-workers.spec.ts` 照旧通过（`PBOTS_PET` 缺省不建宠物窗）
7. 截图：e2e 里对宠物窗 `page.screenshot({ omitBackground: true })` 存 `work/exp-polish/evidence/T45a/{idle,thinking,working,waiting,success,error}.png`；经理亲自打开看：背景透明（不是黑 / 白方块）、鱼完整在框内、六张动作不同。

## 为什么这样验收
- 真正要保住的是「宠物如实反映 bot 状态」：①–⑥ 钉优先级与边界（等你 > 在跑 > 出错 > 完成），V1 证明格子真有判定力；e2e 的 `data-state` 序列 + `currentSrc` 证明链条从 dsh 真回合一路通到画面，不是单测里自说自话。
- 宠物窗是**第二个渲染进程**，它要是能发特权 IPC 或拿到 bot 身份 / 正文，就是给攻击面开了新门：⑦–⑩ + V2–V4 钉「只收一个枚举、只回四个无参/整数动作、主窗特权校验不放宽」。
- `PBOTS_PET` 缺省关 = 现有 e2e 窗口数不变，避免因为多一个窗口把一堆旧用例的 `firstWindow()` 搞歪。
- 截图亲眼看：透明窗在 Linux 上最常见的翻车是黑底，测试断言看不出来。

## 产出
- `app/ui/main/pet/{window,ipc}.ts`、`app/ui/preload/pet.ts`、`app/ui/pet/{index.html,pet.js,assets/fish/*.webm,assets/fish/SOURCE.md}`、`app/ui/renderer-grok/shim/src/pet.ts`
- 接线：`main/index.ts`、`preload/index.ts`、`electron.vite.config.ts`、`scripts/stage-renderer.mjs`、`shim/src/data.ts`（或 index.ts）
- 测试：`tests/unit/grok-shim/pet.test.ts`、`tests/unit/shell/pet-ipc.test.ts`、`tests/e2e/pet.spec.ts`
- `repos/MANIFEST.tsv` 一行；回执 `work/tickets/receipts/T45a.receipt.md`；截图 `work/exp-polish/evidence/T45a/`
