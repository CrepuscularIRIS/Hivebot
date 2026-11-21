# R0 裁决 · U-21 renderer 架构偏离追认

2026-11-02 · director（Opus 5.5）· 对象：`feat/U-21@e55ad0d` 的 `work/p4-ui/ui/PAB-final.md` §0 R0。
已核证据：`D/packages/client/web/src/boot.ts:56-66`（boot 需 `__DSH_BOOT_READY__` / `__ModuleLoader__` / `__DSH_BOOT__` 注入）；`D/packages/api/session-controller/src/client/index.ts:98-106`（ClientSessions inject `typert / remote.commands / remote.session / remote.subagents`，`remote.commands` 由 ui-commands 侧提供）；`work/p4-ui/spike-data.md` §3 §4（spike 只做静态构建，545 模块 9.6 MB，**没有在 renderer 里 boot**；M1 只用到 3 个方法）；`SPIKE.md` §1（ui-conversation 在 runtime deps 级拉 workspace-controller，「W2 前唯一深度绑定点」未解）；`grep -rn "@deepseek-ai/dsh-client\|@deepseek-ai/cordis" app/ui/{renderer,main,preload}` = 0（U-15 dev-min 起已是如此，U-21 没有新增偏离，只是把它写明了）。

## 1. 裁决：**追认**（附 3 条条件）

理由：
- R0 ② 成立，是决定性的一条。ClientSessions 要用 `remote.commands`、`remote.subagents`，这两类远程调用都不在 C §2 白名单里。要启动 dsh client，只有两条路：给白名单加行（扩大契约和安全面，`commands/execute` 的 `/permission` 行本来就在 D9 的拒绝集里），或者给这些 remote 写空实现（这就落到第 3 级「改上游接缝」，而且与 C §2.1「供应者照常装载，不用空 stub」直接冲突）。
- R0 ① 不是不可能，但代价是实打实的：静态 index 也能内嵌 boot 表，只是需要自己在构建期生成。加上 R0 ③ 那个从没解过的 workspace-controller 绑定，「第 2 级」从来没有被实证过。决策 2 的依据只是 spike 的静态构建能过，而不是在 renderer 里 boot 成功。
- 逆向一问：如果强推 dsh client，三个月后最可能的死因有两个。一是被 dsh 的 DOM 和行为约束卡住，做不出原版的样子：核实项 2 证实 turn-process 折叠不可配置，席 A 指出鲸尾残留和黑底黑字。二是白名单被一点点撑大。反过来看自写，最可能的死因是**通用能力手搓出 bug**：markdown、代码块、滚动这类上游早就修过的问题。所以追认时要用条件把这条死路堵住。

条件：
- **C1 通用能力走第 1 级**：markdown 渲染、代码高亮这类通用件只能用在维护的 npm 库，不手写（见 §3-5 待查）。现状 `Conversation.tsx` 把助手正文当纯文本渲染，**没有 markdown，也没有可点链接**。这样 U-22 ③ 的链接点击回归是空测，测试本身能过，但等于什么都没验。
- **C2 安全不因自写而放松**：markdown 关闭 raw HTML。链接只能通过 U-00 门控走 openExternal。远程图片不加载（违反 D12① 的话按 FAIL 处理）。审批 once 语义和 `enabled:false` 继续由 main 侧 §2.2 强制，不依赖 UI 不画按钮。
- **C3 补齐搬运阶梯第 5 级的手续**：派 scout 反向确认一次，问题见 §3-5。如果找到一个在维护、无头（headless）、不约束 DOM 的聊天视图件，能替换 `store.ts`/`reduce.ts` 里的通用部分，就在 U-22 采用；找不到就记一行「GitHub 搜过，没有合适的」结项。

**PLAN 决策 2 勘误**（已写入 PLAN v2.1 决策表 2a 行）：UI 层改为自写（第 5 级，R0 ①②③）。dsh 组件只在**行为层**参照，文件头注明 `D@ce7073d:path`。桥层的实际分级如下：dsh runtime 在 app/sdk 侧是第 1/2 级；main 门控和 cookie 交换是第 3 级（抄片段并注明来源）。三桥只使用 dsh 的 wire 协议（`/api`、mux 原帧），从来没有 import 过 dsh client 代码。M1/M2/M3 接口一字不改。

## 2. 连锁判断

1. **69 个 client 包（scout-C：可直接复用 4 / 需适配壳 24 / 深度绑定 41；派发里写的「68 个需适配壳」与 scout-C 口径不符，以 scout-C 为准）全部退出 W2 运行时。** U-24 不再复用 ui-plugin-market / ui-plugin-manager，改为自写页面，数据走 M1 #12–16（已在白名单内）。产品里根本不建「安装并启用」控件，比原计划「隐藏该选项」更稳；main 的 §2.2 照常强制。
2. **`[data-message-bubble]` 等语义锚点不进 CONTRACT。** 它们是 renderer 内部的 DOM 钩子，不是 renderer↔main 接口，进 CONTRACT 反而会把实现细节冻成契约。处理：`app/ui/tests/support/ui.ts` 是选择器的唯一来源；沿用 dsh 的名字只是为了和 dsh 行为对照方便，不承诺兼容。不另开 UI 附录（YAGNI）。
3. **dsh 依赖成了死重。** `app/ui/package.json` 里 29 条 `link:./vendor/deepseek-harness/...` 和 submodule 没有任何 import，bootstrap 一次 install 约 6 min、占 2.1 G（spike-data §3）。开 U-00.fN 删掉这 29 条 link 依赖和 `.gitmodules` 里的 submodule。只读参考继续用 `repos/deepseek-harness`（MANIFEST 已登记）。前置条件：上面的 grep 结果为 0，并且删除后 `pnpm -C app/ui build`、全量单测和 e2e 都绿。U-00 ⑥ 的 submodule SHA 断言随之作废。
4. **U-22 仍有意义，但要重定义。** P-B 的主体（tool 行、inline 审批卡、composer、停止）U-21 已经交付。U-22 收缩为「P-B 收口」，内容是：markdown（C1/C2）、D2 三 bot 隔离加 tap 计数 K、D4①②③、非空链接回归，以及打断判据改为 `'aborted'`（PAB-final R19，实测 wire）。不重派 ux-proposer，PAB 两席提案已经覆盖。**删除 dev-min 的任务移到 U-23**：dev-min 现在还承担 `d1.spec.ts:206-222` 的连接器勾选和 `tests/unit/devmin/`，要等 U-23 ① 把勾选放进产品对话框后，才能一起删掉，`main.tsx` 的 `#dev-min` 分支也一并删除。
5. **对 U-23 / U-24 的基座**：继续用 U-21 的 `shell/store.ts` 和 theme，§4 的 ux-proposer×2 流程不变。ux-proposer 的输入里，`work/p3-contract/reuse/dsh-client-packages.md` 改为只当作「行为参照」。

## 3. 连锁处置清单（主会话执行）

| # | 动作 | 归属 | 状态 |
|---|---|---|---|
| 1 | PLAN 决策 2a 勘误；U-21 捷径；U-22 重定义；U-23 加 ⑧ 删 dev-min；U-24 捷径；§6 待查 5 | director | **已改**（PLAN v2.1） |
| 2 | REUSE renderer 组装 / bot 导航 / theme / 图标四行，新增 markdown 行 | director | **已改**（REUSE v1.2） |
| 3 | CONTRACT §2.1 加一条勘误行：renderer 组装改为自写，carrier 改为 `renderer/carrier/mux.ts` 的 PageMux；M2 原帧格式与 §2.3 时序不变（不算接口改动，不走 C2） | 主会话派 drafter | todo |
| 4 | BRIEF §3「复用 dsh client 组件」改为「行为参照」，在修订账记一行 | 主会话派 drafter | todo |
| 5 | **待查 → scout**：(a) 能在流式中逐 chunk 渲染的 React markdown 库（候选由 scout 自己找，不预设），要求在维护、许可证、体积达标，能关闭 raw HTML，能接管链接和图片渲染，渲染时不发外部网络请求；(b) C3 的无头聊天视图件反向确认 | 主会话派 scout | todo，U-22 的依赖 |
| 6 | U-00.fN：删除 29 条 dsh link 依赖和 submodule（§2-3）；加装 #5 选定的库（package.json 只能由 U-00.fN 改）；顺带处理 PAB-final §4 的 `loadURL` ERR_ABORTED → `app.exit(1)` 解耦 | builder | todo |
| 7 | U-21 合并仍按原闸门走：verifier 加 /panel GU 一轮。R0 追认不免除这两步 | 主会话 | 在途 |

## 4. 「尽量与原版一致」对照（一句话）

不受损，反而更好：自写拿回了 DOM 和视觉的全部控制权（dsh 的折叠、鲸尾、composer 结构都改不动）。剩下的风险只在行为细节（markdown、代码块、滚动），条件 C1 用在维护的库兜住。
