# RE-UPSTREAM-TRACKER · Grok Bot 桌面版上游动态追踪

调研日期：2026-11-15。方法：纯 Web 调研 + 官方产物验证（下载 1.1.0 deb 做交叉确认）。
本仓对齐基线：0.78.1（deb）/ 0.79.3（已拆包，产物已失，文档在 `work/grok-0.79.3-re/`）。

---

## 0. 结论先行

1. **最新版本是 1.1.0（2026-11-14 发布）**，我们落后 0.78.1→1.1.0 共约 30+ 个公开版本。用户说的「大量新的优化」= **Grok Bot 1.0**（x.ai 官宣，页面日期 2026-11-02，实际公开于 2026-11-11，cellcog 用 Wayback 首捕 11-11 18:08 UTC 证实）以及其后的 1.0.1（11-13）/ 1.1.0（11-14）。
2. **1.0 的主题是「团队化」**：Team Bots 共享、Slack/Microsoft Teams/视频会议（Meet/Zoom/Teams）、主动揽活（Proactive）、Review learnings 审批式学习、共享连接器、Bot 设置与分析。个人用户实际拿到的是：更快的浏览器操作、更好的文档/幻灯片、更少的审批打断、语音倍速滑杆等小改进。
3. **分发基础设施实锤**：桌面 App 由 xAI（SpaceXSI）基于 Cursor/Anysphere 基建发布——更新走 `api2.cursor.sh/updates`（macOS Squirrel autoUpdater）、产物在 `downloads.cursor.com/grokbot/stable/<平台>/<版本>/<文件>`、Linux 走 apt 仓库 `https://downloads.cursor.com/aptrepo`（suite `grok-bot`）、登录用 Cursor 账号。1.1.0 的 package.json：`"name":"sand"`, `"author":"SpaceXAI"`, `"homepage":"https://cursor.com"`。
4. **历史版本永久可取**：CDN 保留了 0.79.3 / 1.0.0 / 1.0.1 / 1.1.0 全平台安装包（含 deb/rpm/AppImage），可直接下载做版本间 diff——这是最值得跟进的 RE 资产。
5. 0.79.x 与 1.1.0 的逐条官方 changelog **未查到**（0.79.2/0.79.3 是「unannounced」静默发布，见 reason.fm 节目标题；1.1.0 太新）。已用第三方源 + 1.1.0 产物 i18n diff 交叉重建。

---

## 1. 版本时间线表

桌面版版本号来源：gradually.ai changelog 镜像（v0.46.0–v0.78.1，30/59 条可见）、reason.fm 播客节目标题、flaviocopes/cellcog 博客、CDN/apt 仓库实证。

| 版本 | 日期（2026） | 主题 | 证据来源 |
|---|---|---|---|
| 0.61.0 | 09-26 | Team Bots 公测（发布/权限/Slack/每用户记忆） | gradually.ai |
| 0.65.0 | 09-30 | Team Bot 语音通话；**默认自动更新** | gradually.ai |
| 0.66.0 | 10-02 | 主动型 Primary Bot；**可恢复更新**、应用目录迁移 | gradually.ai |
| 0.67.0 | 10-02 | Connect Apps 重组；**Windows 硬件加速** | gradually.ai |
| 0.68.0/0.68.1 | 10-05/10-07 | 新语言；**Bot 彩色聊天**、幻灯片交付 | gradually.ai |
| 0.70.2 | 10-11 | Bot 邮箱、X 搜索、in-chat 应用卡片 | gradually.ai / grokbotforbeginners |
| 0.71.2 | 10-14 | 大附件（250MB/文件、1GB/视频、20 个/消息） | gradually.ai |
| 0.75.2 | 10-22 | **Pages**、新聊天卡片、视频生成 | gradually.ai |
| 0.75.5 | 10-23 | **Vault**（凭证/卡/联系人+自动填充）、邮件转发、**批准卡减少** | gradually.ai |
| 0.75.8 | 10-24 | Auto-review 规则卡片 | gradually.ai |
| 0.77.0 | 10-26 | **Permissions（Always Ask / Allow without Asking）**、批准卡 30 分钟不过期、多问题卡片 | gradually.ai / grokbotforbeginners |
| **0.78.1** | **10-27** | **购物卡片 + 订阅模板（我们的基线）** | gradually.ai |
| 0.78.4–0.79.1 | ~11-01~11-05 | 细节未查到 | reason.fm（11-11 集标题提及区间） |
| 0.79.2 | ~11-05 | **未官宣的静默发布**（reason.fm 11-06 集："Unannounced Version 0.79.2"；11-09 集又提 0.79.2/0.79.3） | reason.fm |
| **0.79.3** | ≤11-09 | **我们的第二基线**；flaviocopes 11-11 晚自己的 Mac 还在 0.79.3，看到侧栏底部圆形更新控件「Restart to update」 | flaviocopes / reason.fm |
| 1.0.0 | 11-11 | **Grok Bot 1.0**（官宣页日期 11-02、实际 11-11；见 §0.1） | x.ai/news/grok-bot-1-0 + cellcog |
| 1.0.1 | 11-11~13 | 会议、Microsoft Teams、共享连接器、Review learnings | reason.fm（11-13 集）/ flaviocopes |
| **1.1.0** | **11-14** | 当前最新（apt Release 时间戳 2026-11-14 08:17 UTC；dmg last-modified 11-14 00:35 UTC）。逐条 changelog 未查到；i18n 增量见 §3 | apt Release + CDN |

grok.com 网页端（与桌面端不同的产物）release notes 最新一条停在 2026-10-03（Grok 4.7 + Grok Bot 上 grok.com），11 月无更新条目——网页端 notes 不适用于桌面版追踪，且可能是页面停更或 CDN 缓存（fetch 时 age≈1.8h）。

发布节奏：9-10 月为**每日到隔日一版**的密集滚动（0.61→0.78.1 六周 20+ 版），11 月转入「0.79 静默 → 1.0 大版本」节奏。

---

## 2. 下载渠道（全平台 1.1.0 实证 URL）

官方下载页：
- `https://x.ai/bot`（营销页，SSR 只嵌 darwin-arm64 链接，More downloads 需 JS 展开）
- `https://cursor.com/download/bot`（**SSR 全平台列表**，本次全部 URL 从这里拿到；该 URL 也硬编码在 1.1.0 的 electron-main 里）

CDN 直链（schema：`https://downloads.cursor.com/grokbot/stable/<平台>/<版本>/<文件>`）：

| 平台 | URL（1.1.0） |
|---|---|
| macOS arm64 | `https://downloads.cursor.com/grokbot/stable/darwin-arm64/1.1.0/Grok_Bot_1.1.0.dmg`（159,217,912 B） |
| macOS x64 | `https://downloads.cursor.com/grokbot/stable/darwin-x64/1.1.0/Grok_Bot_1.1.0_x64.dmg` |
| Windows x64 | `https://downloads.cursor.com/grokbot/stable/win32-x64/1.1.0/Grok_Bot_1.1.0_Setup.exe` |
| Windows arm64 | `https://downloads.cursor.com/grokbot/stable/win32-arm64/1.1.0/Grok_Bot_1.1.0_Setup.exe` |
| Linux x64 deb | `https://downloads.cursor.com/grokbot/stable/83d46d618ef4c12afa17edd8e3c29d6caf046d17/linux/x64/grok-bot_1.1.0_amd64.deb` |
| Linux x64 rpm | `https://downloads.cursor.com/grokbot/stable/83d46d618ef4c12afa17edd8e3c29d6caf046d17/linux/x64/Grok_Bot_1.1.0.rpm` |
| Linux x64 AppImage | `https://downloads.cursor.com/grokbot/stable/83d46d618ef4c12afa17edd8e3c29d6caf046d17/linux/x64/Grok_Bot_1.1.0.AppImage` |
| Linux arm64 三件套 | 同上把 `x64`→`arm64`（`grok-bot_1.1.0_arm64.deb` 等） |

Linux 也可走 apt 仓库（0.78.1 deb 的 postinst 实证，1.1.0 仓库仍活跃）：
```
URIs: https://downloads.cursor.com/aptrepo
Suites: grok-bot   Components: main   Architectures: amd64 arm64
Packages: pool/grok-bot/g/gr/grok-bot_1.1.0_amd64.deb（/_arm64.deb）
```

历史版本仍在（HTTP 200 实测）：`…/stable/darwin-arm64/0.79.3/Grok_Bot_0.79.3.dmg`、`…/1.0.0/Grok_Bot_1.0.0.dmg`、`…/1.0.1/Grok_Bot_1.0.1.dmg` 及对应 win32-x64 Setup.exe。**任意版本可直接取来做 bisect。**

macOS 更新入口（api2 重定向，30 天内 token 可变）：`https://api2.cursor.sh/updates/download/stable/darwin-arm64/grok-bot-bd824e1890d8b96f` → 302 → CDN 直链。其他平台段的 api2 token 未查到（SSR 未嵌），但 CDN 版本化直链已够用。

**本机已下载留档**：`/dev/shm/pbots-re/grok-bot_1.1.0_amd64.deb`（sha256 `5b02fb215103eded94ec9f381a790d71f6727f017681c7edd1b56f2b8cfa572d`），asar 已解在 `/dev/shm/pbots-re/deb110/asar/`，0.78.1 对照组在 `/dev/shm/pbots-re/deb0781/asar/`。注意 /dev/shm 重启即失，需保留就挪进仓。

---

## 3. 新优化清单（0.78.1 → 1.1.0，按对齐价值分级）

P0=我们的 UI/交互对齐面直接受影响；P1=新功能面，对齐候选；P2=低优先。
「产物证据」指 1.1.0 asar 的 renderer i18n 字符串 diff（0.78.1→1.1.0 该 chunk 新增 536 条，清单存 `/dev/shm/pbots-re/i18n-added-110-vs-0781.txt`）。

### P0 · UI/交互层

| # | 内容 | 版本 | 对齐价值 | 来源 |
|---|---|---|---|---|
| 1 | **审批卡三选一**：Always allow / Allow once / Deny；长摘要折叠+展开开关（grok.com 端先行，桌面端「更聪明审批」延续） | 0.75.5→1.0 | P0：审批卡是我们复刻的核心组件 | grok.com/release-notes（10-03）+ x.ai 1.0 |
| 2 | **语音通话重设计**：voice picker 可试听、语言/语速设置、**0.5x–2x 倍速滑杆**、断线续接、通话转 Voice Chat 胶囊可开全文 | 1.0.1 | P0：语音面 UI 全新 | flaviocopes / grok.com release-notes（09-26） |
| 3 | **更新流程 UI**：侧栏底部圆形更新控件 +「Restart to update」tooltip；默认自动更新（0.65.0 起）、可恢复更新（0.66.0）、键盘驱动重启 | 0.65→1.1 | P0：设置/更新面 | flaviocopes / gradually.ai |
| 4 | **消息操作重构**：Reply/react/copy 进每条消息菜单；图片 Copy/Download 移入 ··· 菜单；消息时间移入消息菜单；工具调用改 plain language 叙述 | 0.75.x→1.0 | P0：消息气泡交互 | grok.com release-notes（09-19 等） |
| 5 | **视觉刷新**：聊天卡片重设计、新字体与主题、Bot 彩色聊天（0.68.1）、新头像/形状（0.64.0）、居中布局（0.59.0） | 0.59→0.78 | P0：视觉基线本身在动 | grokbotforbeginners（10 月无日条目）/ gradually.ai |
| 6 | **侧栏分区**：Bots sidebar 分 section，可建/改名/重排、各自折叠、拖拽移动 bot；置顶 bot 拖拽排序 + Show less 收起 | grok.com 端 10-03；桌面 0.58 侧栏重设计延续 | P0：侧栏结构 | grok.com release-notes（10-03 / 09-26） |
| 7 | **Pages**：可共同编辑、可让 Bot 定期维护的页面/报告/仪表盘；「Pages, files, and apps this Bot makes show up here」 | 0.75.2 | P0：新内容类型进 Library | gradually.ai / 产物证据 |
| 8 | **多问题卡片**（multi-question cards）、选择题选项流内可勾选+自由输入 | 0.77.0 | P0：输入卡组件 | gradually.ai / grok.com（10-03） |

### P1 · 新功能面

| # | 内容 | 版本 | 对齐价值 | 来源 |
|---|---|---|---|---|
| 9 | **会议（Meetings）**：贴 Meet/Zoom/Teams 链接→审批卡→入会标注「transcribing」→会中只走会议聊天→会后发 summary+action items；Disable Interactivity 开关；11-13 扩到 Super 套餐 | 1.0.1 | P1 | x.ai 1.0 / cellcog / flaviocopes；产物证据（"Computer audio isn't recording"、"Before You Record Other People"） |
| 10 | **Team Bots**：草稿→Publish、按人/组共享、Owner/Manager/协作者三级、侧栏自动出现共享 Bots；团队计划解锁 | 1.0 | P1 | x.ai 1.0 / flaviocopes；产物证据（"Team Bots unlock once a teammate joins your team"） |
| 11 | **Review learnings**：Bot 学到的团队规则先进队列，Owner/Manager 批准才全员生效；"New learnings show up here before this Bot applies them for everyone" | 1.0 | P1 | x.ai 1.0；产物证据 |
| 12 | **共享连接器**：Use individual accounts / Share your account / The Bot's own account 三选；需管理员开 Allow Shared Logins（默认关） | 1.0.1 | P1 | flaviocopes / cellcog |
| 13 | **Mac 原生应用面**（11-12 官宣）：Messages（实为 **iMessage**，含群聊加入/退出语义）、Mail、Notes、Reminders、Calendar、Location、Contacts；细节（权限/版本要求）官方未文档化 | 1.0.x→1.1.0 | P1 | cellcog；产物证据（"Now in iMessage"、"This group chat lives in iMessage"、"Apple ID email"、"Choose the vault folder on this Mac"） |
| 14 | **购物**：商品卡（图/评分/价/店）→Buy now 审批→物流跟踪；购物车；过期订单卡「Check price again」；Shop Pay 接入 | 0.78.1→1.0.1 | P1 | gradually.ai / grokbotforbeginners；产物证据（"Couldn't load your cart"、"Price at checkout"、"Check price again"） |
| 15 | **Permissions 面板**：Always Ask / Allow without Asking 规则清单；工具级 Auto-review/Needs approval/Blocked/Always allow | 0.77.0→1.1 | P1 | gradually.ai；产物证据 |
| 16 | **Bot 设置与分析**（1.0 新）；Usage 卡把 Grok Bot 单列 | 1.0 | P1 | x.ai 1.0 |
| 17 | **订阅模板**：Try it don't pay / Find unused subscriptions / Watch prices | 0.78.1 | P1 | grokbotforbeginners |
| 18 | **Vault**：凭证/支付卡/联系人安全存储+登录/结账自动填充；Vault Payments 页 | 0.75.5/0.77 | P1 | gradually.ai |

### P2 · 外围

| # | 内容 | 版本 | 来源 |
|---|---|---|---|
| 19 | Microsoft Teams 接入（管理员审批、M365 管理员放行、装机需 1 小时、断连恢复文案族） | 1.0.1 | flaviocopes；产物证据（十余条 Teams 文案） |
| 20 | Slack 深化：org 级审批、workspace 选择纠错、频道搜索、@bot 触发 | 0.7x→1.1 | 产物证据 / grokusecases |
| 21 | X 订阅打包：Free/Plus $8/Premium $30/Super $100/Ultra $200，Grok Bot 需 Premium+（10-12 起）；旧 SuperGrok Heavy $300/Cursor 套餐并存 | 10-12 | grokbotforbeginners / grok-bots.com |
| 22 | 邀请返利（好友两周免费+送 usage reset）、Haggle Bot 等市场模板 | 10 月 | grokbotforbeginners / grokusecases |
| 23 | Tailscale/SSH 支持、hidden prompt alerts（仅播客标题级证据，细节未验证） | 0.79.x 窗口 | reason.fm（11-11 集） |

---

## 4. 社区反馈要点

- **Reddit 未查到**针对 1.0/1.1 的直接讨论串（多路搜索无果；r/GrokBot 存在且 sonarmag 测其周访问 ~81K、环比 +19K，说明热度在涨但帖子没进搜索索引）。
- **X 侧最强反应是 8-9 月的病毒式传播**（usegrokbot 聚合）：“Grok Bot is insane”（@KanekoaTheGreat，30.4M views，08-24）、“first thing you hire”（@distortgeekin，65.3M views，09-30）、Ultimate Guide（@milesdeutscher，27M views）。
- 1.0 期反馈主要来自第三方评测：flaviocopes（一手 Mac 用户：「solo 用户更新即可照旧；团队先共享一个窄职责 Bot，一周后看 Review learnings」）、cellcog（未实测、指出 xAI 无性能数字）、TLDR AI 11-12 期转载。
- 10 月中的运营噪音：computer 访问 ~5 小时故障（10-14）、Amazon 封禁 agent 下单（10-14/15）、用量消耗加速 ~2x 的用户报告（未证实）——均来自 grokusecases 周报。
- **用户感知的「大量优化」更可能来自 9-10 月 0.59→0.78 的密集滚动**（侧栏/头像/彩色聊天/居中布局/视觉刷新）叠加 1.0 官宣，而非 1.0 单点。

---

## 5. 值得跟进的 RE 目标（建议）

1. **对 1.1.0 做一轮与 RE-FULL-0.79.3 同规格的全量普查并 diff**。deb+asar 已在 `/dev/shm/pbots-re/`（见 §2），先跑 i18n 全量（不止 eager-common 一个 chunk，本次只 diff 了该 chunk：2094→2518 条）。536 条新增字符串就是 UI 工作清单。
2. **版本 bisect**：CDN 可取 0.79.3/1.0.0/1.0.1/1.1.0 全平台包（§2 直链）。0.79.2/0.79.3 是静默发布，官方 changelog 缺失，只能靠产物 diff 定位每次 UI 变更落点（重点：审批三选一卡、语音重设计、会议 UI、iMessage 面）。
3. **更新通道机制**：macOS Squirrel autoUpdater + api2.cursor.sh/updates（ConnectRPC）、Linux aptrepo（签名 keyring 内嵌 postinst）、win32 Setup.exe。与 Hivebot 自己的更新故事直接可比。
4. **应用内 changelog 数据源**：renderer 里应有一个 release-notes feed 端点（本次未追），找到后可自动同步官方逐条 changelog，补齐 0.79.x/1.1.0 空窗。
5. **@anysphere/agent-* 依赖族**：1.1.0 package.json 仍带 workspace 依赖（agent/agent-client/agent-core/agent-exec/agent-kv/agent-store-*/agent-summarization），印证「Grok Bot = Cursor agent 基建换壳」，其 RPC 面（旧普查 330 desktop/253 coordinator）在 1.x 的增量值得单独摸。

---

## 6. 局限与未验证项

- **0.78.4–0.79.1、0.79.2、0.79.3、1.1.0 的官方逐条 changelog：未查到**。0.79.2/0.79.3 官方未官宣（reason.fm 称 "unannounced"）；1.1.0 发布距调研仅 1 天。本表用第三方源+产物 i18n diff 交叉重建，条目归属版本可能有 ±1 个小版本的误差。
- **1.0 官宣日期矛盾**：页面 publishedTime=2026-11-02，Wayback 首捕=11-11 18:08 UTC，Bot 账号发帖 11-11 18:22 UTC（cellcog）。取 11-11 为实际公开日。
- grok.com/release-notes 是**网页端** notes，最新条目 10-03；fetch 命中 CDN 缓存（age 1.8h），不排除 11 月条目存在但未渲染/未更新——不作为桌面版依据。
- i18n diff 只覆盖 `index.eager-common-*.js` 一个 chunk 的字符串字面量（正则限 ASCII 英文），非全量；「新增 536」是下界指示。
- api2.cursor.sh 其他平台（win32/linux）的下载 token 未查到（SSR 未嵌、盲猜 404）；不影响 CDN 直链用法。
- Reddit 反馈与 1.1.0 内容清单基本空窗；Tailscale/SSH 等仅有播客标题级证据。
- Playwright 扩展超时 30 分钟放弃，x.ai/bot 的 More downloads 未能在浏览器里点开（改从 cursor.com/download/bot 拿到全量）。
- 本调研未运行目标应用，未验证任何功能的实际行为；产物级结论均来自静态字符串/元数据。

## 7. 来源 URL 汇总

官方：
- https://x.ai/bot
- https://x.ai/news/grok-bot-1-0 （Grok Bot 1.0 官宣）
- https://grok.com/release-notes （网页端）
- https://cursor.com/download/bot （全平台下载矩阵）
- https://downloads.cursor.com/aptrepo/dists/grok-bot/Release
- https://api2.cursor.sh/updates/download/stable/darwin-arm64/grok-bot-bd824e1890d8b96f

第三方 changelog/评测：
- https://www.gradually.ai/en/changelogs/grok-bot/ （v0.46.0–v0.78.1 镜像）
- https://reason.fm/podcast/grok-bot-release-notes/ （播客，0.79.x/1.0.1 线索）
- https://flaviocopes.com/grok-bot-1-0/
- https://cellcog.ai/blog/grok-bot-1-0/
- https://www.tao.media/spacexsi-releases-grok-bot-1-0-with-shared-ai-teammates-and-proactive-work/
- https://tldr.tech/ai/2026-11-12
- https://grokbotforbeginners.com/news/grok-bot-news-october-2026/
- https://grokusecases.com/use-cases/whats-new-in-grok-bot
- https://grokbot.run/ 、https://grok-bots.com/download 、https://aiprofitboardroom.com/blog/grok-bot-linux/ （社区指南，Linux 安装/版本旁证）
- https://sumus.im/blog/grok-bot-review

社区反馈：
- https://usegrokbot.com/ （X 帖聚合）
- https://www.sonarmag.com/ai-wars （r/GrokBot 流量）
