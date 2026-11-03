# VERIFY-U-31 · P4 全旅程收尾（D1–D12 E2E + D10b/D7 补写 + 真模型冒烟 + D12 三件套）

verdict: PASS
commit: 基准 6d4f638（实质 cc6f0a6，app/ 树同 8b52766——漂移 commit 仅动 work/panels 文档）；测试补写 feat/U-31@00205d1（仅 journeys/ 4 spec，450 行，产品代码零改动）

## 环境

- worktree `/tmp/bot-wt/U-31`（feat/U-31）：`pnpm -C app/{ui,sdk} setup` → `pnpm -C app/ui build`（生产 build）→ unit 196/196 → e2e **49 passed / 1 failed**（5.1m，workers=1）；唯一红 = d1-real-model 的 key 前置断言 fail-fast（后台任务 shell 未继承 LITELLM_MASTER_KEY），**前台同 test 两跑全绿**（17.8s / 26.2s）
- 主仓干净基线（6d4f638）：build ✓；unit 196/196 ✓；e2e 43/45（2 个 flaky 红，单跑复绿，见「新问题」）
- GPU 训练满载（×2 卡 100%）、load 4–5、iowait ≈0：全程串行
- 真模型：LiteLLM 127.0.0.1:4001 · glm-5.3-flash · key 只经 env 传 child（不打印、不进断言）

## ① 全旅程 E2E（`pnpm -C app/ui exec playwright test tests/e2e/journeys`，4 文件 5 test）

| D 条款 | 判定 | 证据 |
|---|---|---|
| D1（真模型） | PASS | journeys/d1-real-model.spec：对话框选 preset 建 bot → 发消息 → LiteLLM 流式（streaming 气泡 → final 替换非空 + turn/end；chunk ≥2）。前台两跑绿；全量中仅因后台 shell 缺 key fail-fast（设计语义：无凭证显式 FAIL 不静默 skip） |
| D2（M2 原帧 tap） | PASS | 同上：`__pbotsM2…streamChunks` 总和 === renderer chunkCount（真模型动态 K）＋ d2.spec（fake 精确 K=[1,1,4]，全量绿） |
| D3 | PASS（复用确认） | session.spec 审批卡全量（拒绝/批准/仅本 bot 流/无「始终允许」）+ markdown.spec 链接门控，均绿 |
| D4 | PASS | 旅程 d4-d5-d6：bashCall 审批卡 → 批准 → canary 文件出现 + tool-row done + 终态定稿；①② m2-port.spec ⑤、③ d4-deadline.spec 全量绿 |
| D5 | PASS | 旅程 d4-d5-d6：real 源装 filesystem（main `enabled===false` 精确断言）→ new-with 建 X → read_file tool-row done + 结果含标记；未勾选 bot 无 mcp 工具（market.spec ②，全量绿） |
| D6（J3×J4） | PASS | 旅程后半：同 home 重启 → 列表/主 bot 置顶/历史在、普通 bot 收发恢复；**D6b 补**：连接器 bot X 重启后非只读、再调 read_file 成功（此前无 E2E） |
| D7（直接调用侧） | PASS | journeys/d10b-d7 test2：evaluate 直调 #4 传未装连接器 → !ok + 列表无此 bot + 孤儿 recipe 在盘不删；重启后孤儿不出行、主 bot 可用；failNext 注入 #4 失败 → 「创建失败」可见、按钮复位 |
| D8 | PASS（关项确认） | PLAN L80 GU-PDC 关项；NewBotDialog.tsx:81 UI 恒显式传 agentPreset（省略路径在 UI 不存在）；orchestrate.test.ts:98 省略/显式同 id（单测绿） |
| D9 | PASS | unit/m1 拒绝全集（196/196）＋ bots.spec D9 DOM ＋ 旅程 DOM 扫描（danger-full-access/始终允许 零命中） |
| D10b | PASS | journeys/d10b-d7 test1：PBOTS_TEST_GATE_4 屏障（recipe 落盘 + dsh session 已建 + #4 未交付）→ page.reload() → 同一 session 恢复、data-preset === recipe key、非只读、meta 连接器完整；放行 gate 后发消息收回复（此前仅单测，本任务补 E2E） |
| D10c2 | PASS（覆盖确认） | restore.spec（U-14 allSettled/live=false/restore gate）+ m2-deadline.spec（U-16 deadline 代答）全量绿 |
| D11 | PASS | settings.spec ①（pane 唯一表单控件=模型 select）+ bots.spec ②（「配置随 bot 固定」提示）+ 旅程 pane 断言 |
| D12① | PASS | journeys/d11-d12：request 监听（reload 全页加载 + 市场/info-pane 交互）+ performance resource entries → `pbots-app://` 以外请求数 **=== 0**；DOM / window dev 状态 / 顶层标量三处搜 launch token **零命中** |
| D12② | PASS | 同上 + bots.spec：body 与市场页扫 sign in/account/computer/ssh/billing/账号 零命中 |
| D12③ | PASS | bots.spec computed（≥5 `--dsw-*` == token 表 · body font-family 含 XVF · 亮暗双版）全量绿 ＋ 本任务 8 张截图（下） |

## ② 真模型冒烟

```
$ P2SDK_PROVIDER=litellm P2SDK_LLM_API_KEY=$LITELLM_MASTER_KEY P2SDK_HANDOFF=<tmp> P2SDK_PORT=0 node app/sdk/scripts/start.mjs &
  → [p2sdk] ready http://127.0.0.1:44509
$ P2SDK_HANDOFF=<tmp> pnpm -C app/sdk exec node examples/min-client.mjs "你好"
  session session-9202dfbc-… · assistant chunks: 187 · turn end: true reason=completed · min-client PASS   (exit 0)
```
判据：exit 0 ✓；chunks 187 ≥1 ✓；turn end ✓（reason=completed）。

## ③ D12③ 截图组（work/p4-ui/evidence/U-31/，playwright 窗口截图 1280×820，非全屏）

| 页 | 亮 | 暗 |
|---|---|---|
| 会话（侧栏+气泡） | session-light.png | session-dark.png |
| 市场 | market-light.png | market-dark.png |
| 设置 info-pane | settings-light.png | settings-dark.png |
| 新建对话框 | dialog-light.png | dialog-dark.png |

核验：本环境 Read 将图片上传 CDN 不回显像素，改用 PIL 像素校验 + 截图前置断言组合——亮版 avgRGB≈250、暗版≈21（主题两版确实不同，avg diff 121–228）；每图 95–179 色（非空白）；dialog 版带模态遮罩压暗特征（131/9）；截图前 `[data-market]`/`[data-info-pane]`/preset option `toBeVisible`、`data-theme` === cursor-light/dark 断言均已通过（test 内）。

## ④ 缺失项处置确认

- **D8 省略路径**：PLAN L80 GU-PDC 关项成立——UI 恒传 agentPreset（NewBotDialog.tsx:81），省略路径只在直接调用侧，m3 单测覆盖。确认。
- **D10c2**：restore.spec + m2-deadline.spec 覆盖（U-14/U-16 交付，本次全量绿）。确认。

## 新问题

- [FIX] e2e 全量 run 中「新建对话框 preset radio / 取消按钮 not visible」型 flaky：主仓基线 45 例中 2 例（markdown.spec:73 经 ui.ts:73、settings.spec:47；同族，D10b 首跑亦中招 1 次），单跑均绿，worktree 全量未复现 | 复现：干净 main 全量 `pnpm -C app/ui test:e2e`（负载高时更易） | 疑似位置：renderer/plugins/settings/NewBotDialog.tsx（showModal 与 boot 期重渲染的竞态窗口，探针显示 dialog open=true 但子元素 15s 不可见） | 严重度 MEDIUM（伤 CI 全量可信度，不伤功能）
- [FYI] 后台派发的 shell（run_in_background / cron）不继承 LITELLM_MASTER_KEY：d1-real-model 在全量中 fail-fast（设计如此：缺凭证显式 FAIL）。主会话若在 cron/后台跑 journeys，需显式注入该 env 或接受该 test 红。

## feat/U-31 补写（仅测试，产品代码零改动，@00205d1）

- app/ui/tests/e2e/journeys/d1-real-model.spec.ts（D1+D2 真模型，60 行）
- app/ui/tests/e2e/journeys/d4-d5-d6-journey.spec.ts（D4/D5/D6 主干 + D6b，147 行）
- app/ui/tests/e2e/journeys/d10b-d7.spec.ts（D10b 屏障重载 + D7 直调/failNext，132 行）
- app/ui/tests/e2e/journeys/d11-d12.spec.ts（D12①② + D11/D9 DOM + 8 截图，111 行）
