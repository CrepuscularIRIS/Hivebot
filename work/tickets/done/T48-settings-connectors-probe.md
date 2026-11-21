# T48：设置 / Connect apps 现状探针（定 bug 形态，不改产品代码）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：work/settings-connectors/BRIEF.md「现状侦察」两处「待探明」；PLAN.md 行 S0
> 分支 / 作业目录：feat/T48（只加 work/ 下文件，可直接在集成分支）
> claimed：2026-11-11 main (GLM) @ 92949ba4
> accepted：2026-11-11 manager @ 0cb0a006

## 目标
用一个可重跑的探针，把下面四处「现在点了到底是什么样」钉成证据（截图 + 断言 + 控制台错误），供 Q-048 和后续修单用。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. 先例：`work/p5-parity/evidence/P5-52/probe/{probe.spec.ts,pw.config.ts}`（探针放 work/、自带 config 的写法）
3. 拉起方式照抄 `app/ui/tests/e2e/market.spec.ts:51-60`（`launchSdkRuntime` + `launchShell`）与 `settings.spec.ts`；onboarding 进 Connect 步照 `onboarding.spec.ts:214-223`
4. 经理已读出的代码事实（探针要用证据确认或推翻，不要照抄进回执当结论）：
   - 生产 `app/sdk/src/start.ts:158-161` 恒链 `market.yml`，目录源只来自 `P2SDK_MARKET_INDEXES`（launcher 白名单，`app/launcher/hivebot:141`）；本机 `~/.config/hivebot/env` 不存在 → 用户生产大概率无目录源
   - 无目录源时市场显示 `No catalog configured`（`overrides/modules/market-surface.tsx` 内 Empty，「can't be changed in the app」）
   - 侧栏 footer「Connect apps」= `ProductionRenderer.tsx:3454` → `setOverlay("plugins")`
   - onboarding Connect 钮恒 disabled（`overrides/modules/onboarding-steps-0793.tsx:63`）
   - 设置只剩 General，且剥了三组（`overrides/modules/settings-{view,panels}.tsx`）

## 边界
1. 只新建：`work/settings-connectors/evidence/T48/{probe.spec.ts,pw.config.ts,*.png,console.txt}` 与 `work/tickets/receipts/T48.receipt.md`。不碰 `app/**`、不改任何既有测试。
2. 探针跑**生产缺省配置**：不设 `P2SDK_MARKET_INDEXES`、`PRESETS_PATCH` 等测试专用 patch 只在进 new-bot 对话框必需时才加（回执写明加了什么）。provider 用 mock。
3. 四格各一个 `test()`，断言的是**观察到的现状**（例：`No catalog configured` 可见、Connect 钮 disabled），所以将来修好后这格会红——这是预期，回执写明「本探针是现状快照，修单落地后作废」。
4. 每格同时收集 `page.on('console')` 的 error 级与 `pageerror`，写进 `console.txt`（格名前缀）。
5. 测试走隔离 HOME / TMPDIR（tmkdir），DBus 走 run-e2e.sh 的死总线；不跑全量 e2e。

## 四格
- **①设置**：账号菜单 → Settings；断言左侧导航项列表（记下实际文字）与 General 下的分组标题；截图 `settings-general.light.png`。
- **②Connect apps**：点 footer「Connect apps」→ 市场浮层；断言显示的空态标题与提示原文；截图 `connect-apps.light.png`。再点 Back/Close 是否能关（关不掉就是 bug，照实断言）。
- **③新建 bot 里的连接器入口**：侧栏 New → More options → 连接器区；记下文案；点「Open Connect apps」→ 断言市场浮层是否出现、是否在新建对话框**之上**可交互（用 `elementFromPoint` 或点 Close 能否命中判定）；截图 `newbot-open-connect.light.png`。
- **④onboarding Connect 步**：走到 `#sand-onboarding-connect-heading`；断言 Gmail / Google Calendar 两行的 Connect 钮 disabled 与 title 原文；截图 `onboarding-connect.light.png`。

## 验收（写命令，不写感觉）
1. `cd /home/lingxufeng/bot/app/ui && NODE_PATH=$PWD/node_modules sh scripts/run-e2e.sh -c ../../work/settings-connectors/evidence/T48/pw.config.ts` → `4 passed`；经理重跑结果须与回执一致。
2. `ls /home/lingxufeng/bot/work/settings-connectors/evidence/T48/*.png | wc -l` → ≥ 4；经理用 Read 逐张打开，画面内容与回执表格对得上。
3. `cd /home/lingxufeng/bot && git diff --stat <claimed SHA>..HEAD` → 只有 `work/settings-connectors/evidence/T48/` 与 `work/tickets/receipts/T48.receipt.md`。
4. 基线对照：`cd /home/lingxufeng/bot/app/ui && sh scripts/run-e2e.sh tests/e2e/market.spec.ts` 跑一次，原样贴尾部（绿或红都照实记——红就是 ② 之外的另一条现存 bug 线索）。

## 回执必须有的表
| 格 | 现在的行为（原文 / 截图名） | 控制台错误 | 原版 0.78.1 对照（锚点：`work/p5-parity/RE-market-detail.md` §0/§1、`work/grok-0.79.3-re/onboarding-0793-extract.json`；REA 产出到了再补） | 分类：现存 bug / 复刻缺失 / 按设计剥离 |

分类口径：「点了没反应、关不掉、报错、在别的层后面、文案说错」= 现存 bug；「原版有、我们没做」= 复刻缺失；「P5-52/P5-31 有记录的有意剥离」= 按设计。

## 为什么这样验收
用户说「connected app 这块有 bug」，但没说是哪个；代码里能读出的只是推测（大概率是生产无目录源→空态死路，但也可能是层叠、关不掉、控制台报错）。修单要对准用户真正踩到的那个，所以先把四处现状变成能重跑的断言 + 亲眼可看的截图，而不是凭读代码写修单。断言写现状而非目标，是为了这张单不需要任何产品改动就能绿，且结论可被经理复现。

## 产出
- `work/settings-connectors/evidence/T48/probe.spec.ts`、`pw.config.ts`、4+ 张 png、`console.txt`
- `work/tickets/receipts/T48.receipt.md`（含上表）
