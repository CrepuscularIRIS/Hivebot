# GU-PDC · 席 A（Opus 5.5）· 1 轮

对象：main@5504bde（U-23 P-D info-pane + P-C 市场，合并在 U-25 5aee174 之后）、PDC-final.md、VERIFY-U-23.md、evidence/PDC/（亲看 pd-info-pane / vfy-c1-four-places-light / pc-list / pd-c1-clone-missing / pd-info-pane-overlay 五张图）。
对照：BRIEF v1.3 D5/D9/D10/D11、PLAN U-23/U-31、RE-ui-shell §3.2–3.4。

```
seat: A
verdict: REVISE
confidence: medium
findings:
- [HIGH] app/ui/renderer/plugins/market/store.ts:63 × app/sdk/src/market/wrapper.mjs:59-61,150 — U-23 与 U-25 合并后的集成断点：U-25 把 `@agent-infra/mcp-server-filesystem@1.2.29` 装成 wrapper bundle `@p2sdk-market/agent-infra__mcp-server-filesystem`，#16 返回的是 wrapper 名；classify() 只认 `installed.has(entry.name)`，所以这个条目装成功后仍是 installable，列表不出 ✓，「安装」按钮还在，详情页也没有「用它新建 Bot」。它是真实目录里唯一能装成功的条目（VERIFY-U-25 ②：applied，X/Y 工具表隔离已实测），也是 D5 的主干路径。同一原因下，market.spec.ts:172-185 断言该条目走 not-bundle → unsupported，这在 U-25 之后已不成立，main 上应当是红的。VERIFY-U-23 跑的是 39710e4（基于 d175a75，不含 U-25）；LOG:483/485 只记了两次合并，没有合并后的 app/ui e2e 回归记录（违反 LOG:215 / LEARNINGS 合并后必须全量回归的纪律） — 证据: wrapper.mjs:150 `name: wrapperNameOf(parsed.name)`；VERIFY-U-25 ② `target=@p2sdk-market/...`；app/sdk/package.json:29 已预置 filesystem 1.2.29；market-source.yml:22-25 已挂 p2temp（UI e2e 用的 MARKET_SOURCE_PATCH 就是它）。我没有实跑：跑 spec 会覆盖主仓 evidence/PDC/*.png — 建议: ① 在 main 上跑一次全量 e2e，确认是否红；② 根因只修一处：已装判定要认 wrapper 名。由 sdk 导出 wrapperNameOf 给 renderer 复用，或在 wrapper 的 package.json 里写回源包名、由 #16 带出，不要在 renderer 里再写一份命名规则；③ market.spec ② 改成「真实目录 filesystem → 安装 → ✓ →『用它新建』预勾 → X 调用工具」，顺带把 D5 跑通；not-bundle 用例换成 19 条未预置条目中的一条
- [HIGH] PLAN U-23 ② / VERIFY-U-23 §6 第 2 条 — 「#11 分页取更早记录」不是缺测试，是功能没做：renderer 里没有任何 `session/events` / `hasMore` 调用（grep 只命中 main/m1-api/index.ts:22 的白名单）。D6a 明文要求「历史（含 #11 分页）都在」。U-31 的 PLAN 定义是「复用 W1/W2 各 spec，只补 D12」，owner 是写套件的 builder，接不了 UI 功能 — 证据: `grep -rn "session/events\|hasMore" app/ui/renderer` 零命中；PLAN.md:47 — 建议: 单开一个小 UI 任务（transcript 顶部「加载更早」+ #11 + hasMore，E2E 用 fake 长历史断言），不归 U-31
- [MEDIUM] VERIFY §6 其余三条归 U-31 的判定 — D10b E2E：BRIEF D10 / G1-r1 明写「单测替代不了」，屏障（U-13 ⑦）已就绪，可以推迟，但必须把 U-31 行改成显式承担「补写 D10b spec」，否则按「只补 D12」它会悄悄漏掉。D7 直接调用侧：现在有现成的 UI 真路径可测——`__pbotsDev.failNext('pluginManager/listBundles')` + 克隆 c1 bot → PDC D12 保留预填照样提交 #4 → 「创建失败」且列表不出现，一条 spec 就够，并入同一张 PLAN 修订。D8 省略路径：UI 对话框必选 preset，不存在省略路径；U-13 ③ 单测 + restore.spec 已覆盖，可以接受，PLAN 记为「UI 无此路径」关项即可 — 证据: PLAN.md:45 ⑤⑥⑦、PLAN.md:47 — 建议: 一次 PLAN 修订落定，不要只停在 LOG 的「归 U-31」口头处理
- [MEDIUM] app/ui/renderer/shell/app.css:255 — c1 四处显示的第 4 处（pane 里模型 select 置灰）视觉上分辨不出：`.pane-field select` 没有 :disabled 样式（vfy-c1-four-places-light.png 里的 select 和正常态一样）；下方状态行还写着「仅影响此 Bot，下一轮生效」，在 c1 态是误导 — 证据: InfoPane.tsx:70,83；截图 — 建议: 加一行 `select:disabled{opacity:.45}`；readOnly 时状态行改为「连接器已失效，不能改模型」
- [MEDIUM] InfoPane.tsx:89-105 — c1 只读 bot 也提供「设为主 Bot」（截图里可见）。主 Bot 固定置顶、没有删除入口，设成后侧栏顶部就是一个不能发消息的 bot — 建议: `info.readOnly` 时禁用，附 title「连接器已失效的 bot 不能设为主 Bot」
- [MEDIUM] 市场列表（pc-list.png）— 按目录顺序排，首屏 12 行全是「仅浏览」；U-25 之后 20 个「安装」按钮里，19 个点了会先走真实 pnpm 下载、最后 not-bundle 失败（只有 filesystem 预置过）。用户的第一印象是「这里基本装不了东西」，然后还会被 19 次慢失败消耗信任 — 建议: 不改 UI。在数据面（目录快照生成 / devDep 预置清单）里，把未预置的条目打上 `not-installable` keyword，classify 现有逻辑就会自动归到「仅浏览」，零代码；等预置补齐再摘掉
- [LOW] shell/store.ts:346-350 — 插入 failNext 后，closeEvents 的 JSDoc 现在贴在 failNext 头上 — 建议: 挪回去
- [LOW] 裁定 1（failNext）复核：同意追认。只能注入失败、一次性、不改写成功值、不新增 IPC；对 `$events/result` 注入失败只会让卡片继续挂着，属于 fail-closed。`__pbotsDev` 整体在生产 build 常驻，建议在 U-31 D12 里一并按构建标志裁掉，不单点处理
- [LOW] 裁定 2（registry 透传）复核：同意追认。补一个事实：真实 111 条快照里 `"registry"` 字段计数为 0（grep），这个字段目前只服务 E2E 的假 registry；dsh normalizeRegistry 只收 http(s)；main §2.2 的 enabled===false 闸门不受影响（m1-api/index.ts:92）。将来接入第三方目录时，可以在详情页显示非默认 registry 的 host，现在不做
- [LOW] InfoPane.tsx:48 — 模型目录加载失败后，只有切 bot 或重挂载才会重试，pane 内没有「重试」 — 建议: 状态行加 link-btn 重试（PDC D12 的对话框已有同款）
- [LOW] Market.tsx:170 / pc-list.png — 来源 select 截断成「MCP official registry snapshot (offline mirro」；已安装页签和对话框会直接显示 wrapper 名 `@p2sdk-market/...`，可读性差 — 建议: 等 HIGH-1 的名称映射落地后一并改为显示源包名
- [LOW] NewBotDialog.tsx:152 — 预填的连接器如果不在任何目录源里（例如 fixture 包），「去市场安装 →」点过去找不到它 — 建议: 暂不处理，记一笔
reverse_take: 最可能的失败方式是两个各自 PASS 的分支，合并后在「名字」这种接缝上对不上，而两份 VERIFY 都早于合并，没人跑过 main。更笨更稳的做法：每次合并后在 main 上跑一遍 app/ui 全量 e2e 作为硬闸门，再派 GU。
```

## 复核要点（证据摘要）

**① 视觉与原版。** info-pane 的语义对得上：原版是 ChatHeader「View agent settings」打开右侧 info-pane，宽度可拖（RE §3.2 L158、§3.4 L184）。实现上是第三列，由 `layout-sidebar-right` 按钮开合；原版的 overview|settings 切换只保留了 settings 内容，这在 BRIEF 范围内，可以接受。PDC D3 采用的内容层级（名称 → 失效提示 → 锁定配置 → 新建 → 模型 → 主 Bot）比把模型放第一行更符合「配置随 bot 固定」。市场层级 Back / 标题 / 搜索 / 分区 tab / Installed 和 RE §3.3 一一对应；plugins|bots 两个 tab 收成一个，Installed 改成同级页签，是合理的简化。pane 头部右侧留了 WCO 的 padding（app.css:236），这是 R16 的延续，不是缺陷。整体 token 和组件形态与 P-A/P-B 一致。

**② 交互完整。**
- 拖动 clamp：Resizer.tsx:134 统一 clamp，verifier 亲测 280/400 和键盘 8px 步进。
- 浮层判定：App.tsx:68，900 宽浮层截图核对过。
- 三分类：classify 的优先级正确（not-installable 优先于 spec）。
- 安装旅程：串行、可离开页面、成功后重拉 #16 的逻辑本身都对，但在 U-25 之后被 HIGH-1 的名称映射打断。
- D10c1 四处：侧栏 ⊘ 加副行、头部 danger、composer 横幅加 CTA 三处都在截图里核对过；第四处见 MEDIUM（置灰看不出来）。

**④ D9 / D11。** 本次没有改 main/，D9 的 main 边界没有变化。renderer 新增调用的方法（#12–16、#2、#5、agentPresets/list）都在白名单里，全量 e2e 已过。D11：pane 和头部都只读，唯一的变更路径是新建 bot；verifier 把检查升级为全 DOM 搜索，4 个词零命中，可以接受。

**⑤ 四条子项。** 分开处理：#11 是功能缺口（HIGH-2），D10b 和 D7 可以推迟但要写进 PLAN（MEDIUM），D8 可以关项。
