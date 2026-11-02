# VERIFY-U-23（P-D 设置·bot 配置 info-pane + P-C 市场）

verdict: PASS
commit: 39710e4cb24c53fb0490bcee46c961a77f8c0ccb（feat/U-23，worktree /tmp/bot-wt/U-23，验收期间无漂移）
验收人：verifier（GLM 5.3）· 2026-11-02 17:05–17:19 · 全部亲跑于干净 worktree

## 0. 复跑（不信 builder 输出）

| 命令 | 结果 |
|---|---|
| `pnpm build` | ✓（renderer 264 modules，1.09s） |
| `pnpm test` | ✓ **193/193**（21 files，2.91s） |
| `pnpm test:e2e -- --workers=1` | ✓ **44/44**（4.5m；含 U-22 session/resilience 组全绿） |
| origin-gate 全套连跑 ×8 | ✓ 8×8 passed（(d) 去 flake 修复复核，见 §5） |
| verifier 亲跑 spec（/tmp/vfy-U-23，独立 config，复用 worktree support） | ✓ 3/3 + DOM 快照 1/1 |

## 1. 验收项

| 验收项 | 结果 | 证据 |
|---|---|---|
| ① P-D 全旅程：对话框连接器栏（#4）→ info-pane（第三列 320，280–400 拖动，<424 浮层）→ 改模型失败回滚/下一轮生效/只对本 bot → 用此配置新建预填不提交 → 设主 Bot 置顶 | PASS | e2e `settings.spec.ts:32` 全绿（本次复跑）；拖动 clamp 为 E2E 未覆盖点，亲跑补测：向右拉 500px → **280**、向左拉 500px → **400**、键盘 ←/→ 8px 步进（`vfy.spec.ts V1`，3 passed）；900 宽 overlay 实测在 e2E `settings.spec:106-110`（900−280−320=300<424 → class overlay，1280 恢复第三列）；App.tsx:68 `viewport - width - paneW < CHAT_MIN(424)` 判定核对 |
| ① 证据细节：#4 编排产物 | PASS | e2E 断言侧栏项 `data-preset` 匹配 `^p2temp-`、bots.json `recipes == [{agentPreset:'p2-alpha', connectors:[DEMO_BUNDLE]}]`、无 readonly class；连接器候选 `count===1`（只来自 #16 installed 且非 missing，NewBotDialog.tsx:18） |
| ② P-C 三分类 90/20/1 + 预装 fixture 非欺骗性 | PASS | 两遍实测：e2e `market.spec:70` 与亲跑 `V2` 均得 `{browse:90, installable:20, installed:1}`。数据自洽核实：T-19 快照 111 条 = 90 条 `not-installable` keyword + 21 条带 npm source（dsh-plugin-market 由 source 生成 install 坐标，快照原始 JSON 不含 install.spec 属正常）；**fixture 核实非欺骗**：预装走真 SDK `#15 installBundle`（本地目录 spec），installed 分类由 `classify()` 对真 `#16 listBundles` 的 name 集合比对（store.ts:62-67,78），测的是「已装路径」；安装按钮路径由 LOCAL_PLUGIN 从 loopback 假 npm registry 真走 pnpm→dsh bundle 检查→#16（`market.spec:126-170`） |
| ② 安装旅程：串行、可离开页面、重拉 #16、「用它新建」预勾 | PASS | e2e `market.spec:126`：安装中其它源全部安装按钮 disabled、离开市场回会话再返回后 `data-kind=installed`（120s 内）、已安装页签「已安装 2」、对话框预勾不自动提交、新 bot bots.json connectors 含 LOCAL_PLUGIN 且非只读 |
| ② not-bundle 分类显示后不再给按钮 | PASS | e2e `market.spec:172-185`：真 pnpm 解析 `@agent-infra/mcp-server-filesystem` → dsh 拒 → `data-kind=unsupported` + `.m-fail=无法安装` + `button[data-action] count=0` + 详情「此包不是受支持的连接器包」 |
| ② 无启用入口、无目录源写入口 | PASS | e2e 断言市场 innerText 不含「启用」、除搜索框外 input count=0（`market.spec:77-80`）；store 无 setIndexes 调用（代码核对） |
| ③ D10c1 四处显示（侧栏副行+⊘角标 / 头部连接器 danger / composer 位横幅禁发 / pane 红点+模型 disabled） | PASS | 触发方式 = 删临时 HOME 里 bundle 链接（profiles/web/node_modules/<pkg>）→ 同 home close→launch。e2e `settings.spec:125` + 亲跑 `V3` 两遍全绿；附加：历史可读（用户气泡+定稿都在）、其他 bot 正常收发、无 spinner（不自动重试）、横幅「用此配置新建」预填标出未装连接器（`data-connector-missing` 「未安装」+「将不带 X 创建」）、bots.json recipe 不被删（V3 断言） |
| ③ D11：DOM 无权限相关入口 | PASS | e2e pane innerText 4 词零命中 + 亲跑升级为**全 DOM outerHTML** 搜索：`permission`/`权限`/`danger-full-access`/`始终允许` 命中均 0（`V1` 控制台输出在 §3 日志） |
| ④ 全量 44 e2e（--workers=1 显式） | PASS | 44/44（4.5m），本次复跑输出尾部见 §3 |

## 2. 两处产品变动裁定（派发第 4 步）

**裁定 1：`__pbotsDev.failNext` 钩子 —— 追认。**
位置 `renderer/shell/store.ts:58-63,350`。理由：①与 U-22 已验收的 `__pbotsDev.closeEvents` 同构——同挂既有 `__pbotsDev` E2E 观测面（store.ts:7 注释口径），同为故障注入；②方向安全：只能在 `api()` 入口短路返回**失败**（一次性自清），不能注入成功、不能改写返回值、不触 IPC，无提权面；能执行 JS 的攻击者本可直接破坏 `window.pbots`，钩子不新增攻击面；③不改行为语义：无注入时 `api()` 路径与原来逐字节相同。备注：`__pbotsDev`（bots/events/closeEvents/failNext）整体在生产 build 常驻，若日后要收紧应统一按环境门控裁剪整个观测面，不必单点处理。

**裁定 2：registry 字段原样透传（enabled 仍 false）—— 追认。**
位置 `renderer/plugins/market/store.ts:129-132`：`options: { enabled: false, ...(registry !== undefined ? { registry } : {}) }`。理由：①值来源是 #12 目录源返回的 `install.registry`，目录源本身是受信部署配置（renderer 无写入口，已断言），renderer 只是数据管道；②main §2.2 闸门不受影响：`main/m1-api/index.ts:92-93` 强制 `options.enabled === false` 否则 invalid，registry 不绕过；③防线链条完整：enabled:false（装了不启用）+ dsh bundle 检查（not-bundle 实测被拒）+ 装后不自动建 bot/不自动勾选；④功能必需：私有 registry 条目不透传则 pnpm 去默认 npm 解析必 404。风险增量：低。

## 3. 亲跑日志摘录

```
[V1] D11 'permission' 命中 0 / '权限' 命中 0 / 'danger-full-access' 命中 0 / '始终允许' 命中 0
[V2] 三分类实测：{"browse":90,"installed":1,"installable":20}
  3 passed (17.7s)  +  V4 DOM 快照 1 passed
origin-gate ×8：8 passed ×8
```

## 4. 截图亲验说明（环境限制 + 替代证据）

本环境 Read 图片仅回传内部 CDN URL（直连被 OSS AK 拒），无视觉通道，无法字面意义「肉眼看图」。以三层交叉证据替代并如实记录：
1. **像素统计**（PIL，全部 19 张 = e2e 13 张 + vfy 6 张）：尺寸全部 1280×820（overlay 图 900×720 与 setSize 一致）；亮暗分布正确（pd-info-pane 亮 249.7 / pd-info-pane-dark 暗 21.5、pc-list 亮 247 / pc-list-dark 暗 25.3、vfy-c1 亮暗两版）；无空白/纯白图（对话框类右列低 σ 为遮罩盖住，正常）。
2. **DOM 文本快照**（`evidence/PDC/dom-snapshots.txt`，亲跑 dump 后逐行核对）：new-bot 对话框含基础配置 6 项 + 连接器栏 + 模型下拉 + 取消/创建；info-pane 含「配置（创建时固定）」基础配置 p2-alpha、连接器 @p2sdk-fixture/demo-mcp、「用此配置新建」「设为主 Bot」；会话头部「p2-alpha · @p2sdk-fixture/demo-mcp」；local 源 1 条 Demo connector 带「安装」按钮；详情含「安装后不会全局启用」。与 InfoPane/Market 实现逐区块一致。
3. **断言**：所有截图均在 e2e/vfy 断言通过后的同一 DOM 上拍摄。

## 5. 原有用例改动复核 + 清理残留

| 项 | 结果 | 证据 |
|---|---|---|
| d1 连接器用例迁产品对话框（U-23 ⑧） | 合理 | diff 核对：`#dev-min` hash 路由 → `[data-action="new-bot"]` 产品对话框；`waitForFunction` 增 `b.preset !== null`（#4 编排下 preset 异步落定，语义不变仍验 #4 → preset 冻结）；本次全量绿 |
| origin-gate (d) 窗口 id 修复 | 合理且已验证 | `getAllWindows()` 顺序不保证主窗在首位，`slice(1)` 偶发销毁主窗 → 改按 `id !== keep` 只销毁新窗；断言本体（preload 下 `window.pbots` undefined）未动；builder 报 8 连过，本次复跑 ×8 全过 |
| dev-min 删除残留 | 0 | `grep -rn "dev-min\|devmin\|devMin" app/ui/{renderer,tests}` 零命中；renderer/dev-min/ 与 tests/unit/devmin/ 目录已删（commit stat） |

## 6. 备注（PLAN U-23 子项状态，非本次 FAIL 依据——派发范围为 ①–④）

- U-23 ⑥ **D10b E2E**（用 U-13 ⑦ `PBOTS_TEST_GATE_4` 屏障停在 recipe 落盘/#4 未返回时重载 renderer → 同 session 恢复）：本次交付无对应 spec。屏障本体 U-13 已交付并 PASS（VERIFY-U-13 ⑦）。
- U-23 ② D6a 的「#11 分页取更早记录」子项无 e2e 覆盖（D6a 其余 = close→launch 列表/主 bot/历史可读，已被 D10c1 spec 覆盖）。
- U-23 ⑦ D7 的「直接调 #4 传未装连接器」：restore 侧（坏 recipe live=false 不阻断）restore.spec 已覆盖；直接调用侧无新 spec。
- U-23 ⑤ D8「省略 preset 建连接器 bot」：省略是 main 层行为（U-13 ③ 单测覆盖），UI 对话框必选 preset 无省略路径；「重启后非只读」由 restore.spec 覆盖。
- 以上四点建议归口 U-31 全旅程核对或补 spec，由主会话定夺。

新问题（每条一行，可直接成为修复任务）：
- 无阻塞问题。
- [备注] verifier 环境无图片视觉通道（Read→CDN URL 直连被拒），截图亲验改用像素统计+DOM 快照+断言三层交叉；若后续验收要求字面肉眼，需在有视觉输入的环境重跑（疑似位置：无 · 严重度：低）。
