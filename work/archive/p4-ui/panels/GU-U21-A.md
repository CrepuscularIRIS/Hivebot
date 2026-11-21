# GU · U-21（P-A + P-B）· 席 A（Opus 5.5）· 一轮

审查对象：main@4f0b404，`app/ui/renderer/**`、`work/p4-ui/ui/PAB-final.md`、`work/p4-ui/evidence/PAB/*.png`（9 张已全部亲眼看过）、`app/ui/tests/e2e/{bots,session}.spec.ts`。
对照：BRIEF v1.3 D1/D2/D4/D9/D11/D12、CONTRACT #1 行、01-boot.png、用户指令「尽量与原版一致」。

```
seat: A
verdict: PASS
confidence: medium
findings:
- [HIGH] app/ui/main/m1-api/index.ts:183 + renderer/shell/store.ts:50,174-178 — 两条已知 FIX（断线丢草稿 M、永久停止态 L）的根因是同一个，而且影响面比记档的更大：main 的 `await deps.dsh.rpc(...)` 没有 try/catch（U-17 记档的「rpcRaw 网络裸抛」），抛错时 ipc invoke 在 renderer 里 reject；renderer 只有 `answer()`（store.ts:241-246）接住了这种 reject。结果是：① `send()`（Conversation.tsx:73-76）先清空草稿再 await，reject 时草稿丢失、也没有报错（= M FIX）；② 停止按钮的 `cancelTurn().then(...)`（Conversation.tsx:91）reject 时 `stopping` 一直是 true，回合没结束之前停止按钮一直不可点（= L FIX）；③ **记档里没有的一条**：`start()` 里的 `loadRoster()` 用 Promise.all 同时调 session/list 和 botsMeta，任一 reject 都会让 `start()` 的 rejection 无人处理（`void start()`，store.ts:252/270），boot 停在 'starting'：封面永远显示「正在启动本地引擎…」，60 秒后也不会出现「重试 →」（R15 失效），只能杀掉应用重开。新建对话框（Sidebar.tsx:166、185、195）同理，busy 会卡在 true，对话框关不掉 — 证据: m1-api/index.ts:183 是裸 await；LOG 14.4x「c) rpcRaw 网络裸抛（R13 剩余）」；store.ts:176 只在返回字符串错误时进入超时分支 — 建议: 在一个地方修根因：m1-api index.ts:183 用 try/catch 把抛错转成 `{ok:false,error:{code:'pbots/unavailable'}}`（`$events/result` 已经按 R10 在 throw 时保留 pending，转成 ok:false 后语义不变）。renderer 侧在 `api()` 包装里补 `.catch` 作兜底，botsMeta 同样处理。归入 U-22，补 1 条 E2E：注入 rpc 抛错，断言草稿还在、停止按钮恢复可点、封面出现重试。**不阻塞 GU**：正常路径的旅程全通，这是异常路径的健壮性问题，修复只要一处。
- [MEDIUM] store.ts:110-124、129-142 — 断线重连后不重新拉 roster：没打开过的 bot 的 running/unread 只靠 $events 的 emit 更新，断线期间回合结束的话，那条 emit 就收不到了，侧栏会一直显示「回复中」加转圈（BotItem 用的是 `sum.running`，因为 `view.loaded` 为假），蓝点也不会出现。这是 L FIX 之外的第二种「永久运行态」 — 证据: socket 'open' 只重开了 $events 和 follow（store.ts:129-136），没有调用 loadRoster — 建议: 收到 `ready` 且不是首个 clientId 时，重新跑一次 `loadRoster()`，只合并 running/updatedAt，不改动 order（R9 冻结不变）。
- [MEDIUM] work/p4-ui/VERIFY-U-21.md — 这个文件不存在：仓内、git 历史、/tmp/bot-wt 里都没有。合并提交和 LOG 15.4x 都写着「VERIFY-U-21 PASS」，两条 FIX 的复现步骤也找不到出处，本席只能从代码反推（见第一条） — 证据: `git log --all -- '*VERIFY-U-21*'` 没有结果，`find` 也没有 — 建议: 让 verifier 把报告落盘（PROTOCOL：只认文件），U-22 收口时引用。
- [LOW] Conversation.tsx:138-140 vs store.ts:140 — R20 写的是「审批按钮离线时禁用」，但断线时 store 直接清空 `approvals`，卡片、侧栏黄点、36px 提示条一起消失，重连后才重新出现，`disabled={!online}` 这个分支实际走不到。这样是安全的，但用户看到的是卡片闪没了再出现 — 建议: 二选一。保留卡片并禁用（在 close 时记下待补发的 eventId，ready 后用 gateway 补发的那张替换）；或者把 PAB-final R20 改成「离线隐藏」，与实现一致。
- [LOW] Conversation.tsx:106、155 — 如果审批（$events）比 tool/call（follow）先到，卡片会先渲染在流末尾，等 tool 行到了再搬到行下，重新挂载、重播 rise 动画，已经拿到的焦点也会丢 — 建议: callId 不为 null 但行还没到的审批先不渲染（提示条照常显示），超过约 1 秒仍没有行再按 R2 落到末尾。
- [LOW] shell/App.tsx:66-68 — bot 没有标题时 name 回退成 preset，titlebar 会显示「p2-alpha p2-alpha」（shell-light/dark、streaming 三张截图都是这样）。侧栏的 subtitle() 已经处理了这种情况（Sidebar.tsx:54），头部没有处理 — 建议: `info.name !== info.preset` 时才渲染 chat-meta 里的 preset，只改一行。
- [LOW] evidence/PAB/approval-light.png — 截图截在卡片 rise 动画的半途：标题、按钮整体发灰，主按钮看起来是 #5x 灰，不是 R14 规定的 #1c1c1c。dark 版正常 — 建议: 截图前等 `animationend`，或用 `reducedMotion:'reduce'` 重截，否则 U-31 并排对照时会被误判为 token 错。
- [LOW] Sidebar.tsx:218-224 — 对话框原样列出 dsh 内置的 `cordis / minimal / ptc`（new-bot-dialog-light.png），对普通用户是噪音，原版也没有这些名字 — 建议: 不在本页修。作为产品问题交给 U-23（preset 可见白名单或 description 文案），不影响 D9（CONTRACT #1：danger-full-access 是权限 preset，不在 agentPresets/list 里）。
- [LOW] store.ts:64-74、200 — 每个打开过的 bot 都会常驻一个 40ms 轮询 follow 的 timer，followed 集合只增不减。M1 规模下可以接受 — 建议: `// ponytail:` 注释写明上限（几十个 bot 后再改成 MuxStream 回调，或切走时关闭 follow）。
reverse_take: 三个月后最可能出事的不是视觉，而是「卡在某个状态出不来」：引擎抖一下，boot 封面、停止按钮、侧栏转圈就会定格，因为 renderer 只认 ok:false，不认 reject 和漏掉的 emit；更笨更稳的做法是 main 的 M1 永不抛错，并且每次重连都重拉一次 roster。
```

## 四项关注逐条结论

① **视觉一致性：通过。** boot-cover-side-by-side.png 两侧在布局、字号、字重、留白、品牌标位置上几乎一致，偏差只有几个像素；「Sign in →」换成「正在启动本地引擎…」，去掉了 Terms，符合 R15/D12②。截图里没有窗口控件，因为 WCO 由原生绘制，页面截图拍不到；R16 只能靠 window.ts 和人工目检确认，这不是缺陷。壳页面亮暗两套都只用 --dsw-*/--sand-* token（app.css 里没有裸 hex，只有 avatar 的 `#fff`）；主按钮和用户气泡是单色反转（R14）；bots.spec.ts:135-147 断言了 7 对亮暗 computed 值和 XVF 字体。原版没有已登录壳页面的截图，侧栏和会话流的相似度只能靠 token 加 RE 组件树来担保，这是证据上限，不是实现问题。

② **交互完整性：通过。** 流式：streaming 气泡逐 chunk 增长，assistant/message 到达时由定稿替换，位置在列表末尾不变（reduce.ts:76-79、150-154）。审批：卡片 inline 挂在对应 callId 的行下（R1）；没有 callId 的落到流末尾（R2）；不设 Enter 批准，只有「仅批准这一次」（R3/R4），也没有始终允许。IME：同时判断 `isComposing` 和 `keyCode 229`（Conversation.tsx:86）。草稿：store 按 bot 隔离，Conversation 以 `key={selected}` 重建，error 和 stopping 状态不会串到别的 bot。E2E session.spec.ts:70 覆盖了这些。

③ **两条已知 FIX：都不阻塞 GU。** 两者同源，根因是 M1 裸抛，而且还漏了一个更重的症状：boot 永久卡住（见 HIGH）。归入 U-22，在 main 一处修复根因，补 1 条 E2E。

④ **D9 永久判据：通过。** renderer 里没有任何权限 preset 入口：唯一的 `<select>` 是模型选择（Sidebar.tsx:228），preset radio 来自 agentPresets/list，按 CONTRACT #1 这里不含权限 preset。main 侧对 `/permission*` 和 commands/execute 的拒绝都在（m1-api/index.ts:38-53）。bots.spec.ts:47-56 会在 DOM 里搜 permission、danger-full-access、始终允许。`#dev-min` 页面里的 preset 下拉同样只是 agent preset，U-23 ⑧ 会删除。
