# G2-r2 · 席 A（Opus 5.5）· p4-ui PLAN v2 + REUSE v1

seat: A
verdict: REVISE
confidence: high
findings:
- [HIGH] PLAN.md:15（决策 7「抄 D `main.ts:185-192,762-775`」）、:34（U-00 捷径/⑦）— v2 新引入：762-775 不只是静态文件服务。`protocol.handle` 的 `app` 主机分支对非静态路径执行 `forwardWebRequest(request, hostUrl, hostCookie)`（D `main.ts:771`，`web-document.ts:77`），即把任意 `pbots-app://app/<path>` 带 launch cookie 反代到 dsh Host；scheme 又注册了 `supportFetchAPI/corsEnabled`（:185-192）。照抄后，renderer（或经 markdown 渲染进来的任何脚本）可直接 `fetch('pbots-app://app/api/...')` 打 dsh `/api`，绕过 M1 白名单与 §2.2 校验（含 `$events/result allowed-once`），违反 C:17「renderer 不联网、不持 token、main 唯一 mux」。U-31 ② D12① 只数「`pbots-app://` 以外」的请求，这类反代流量恰好全部判通过；⑦(a)–(e) 也不覆盖它。另 `serveWebDocument` 会往 index.html 注入 D 的 `BOOT` 脚本（`web-document.ts:33-34`） — 证据: `repos/deepseek-harness@ce7073d apps/desktop/src/main.ts:762-775`（`if (url.hostname === 'app') {…静态… return forwardWebRequest(...)}`）；`web-document.ts:18-38,77` — 建议（转 W0 派发附加要求，不需第 3 轮）：决策 7 / U-00 捷径改为「只抄 :185-192 的 registerSchemesAsPrivileged（去掉 `corsEnabled`，按需保留 `supportFetchAPI`）+ `web-document.ts:18-31` 的路径规范化与 `startsWith(root+sep)` 防穿越；handler 只服务 `out/renderer` 内静态文件，**不抄 forward 分支、不注入 BOOT**，其他一律 404」；U-00 ⑦ 加 (f)：页内 `fetch('pbots-app://app/api/connection/rpc')`、`pbots-app://app/../../etc/passwd`、`pbots-app://other/` → 均非 2xx，dsh `/api` 计数 === 0；U-31 ② 补「`pbots-app://` 请求的 path 全部落在 build 产物清单内」
- [MEDIUM] REUSE.md:3,10,16,22,23 — REUSE v1 摘的是 PLAN v1 口径，与 v2 新冲突，而 builder 的派发前提就是读 REUSE 决策行：:16「只复用 `client.mjs:66-81` 的 `connect()`」正是 v2 U-00 捷径明令避开的（:77 `new MuxSocket` 丢未知 streamId 帧，C:18）；:10 窗口只抄 259-286、无门控与 `pbots-app://` 行；:23 ensure「全部 settle 前不就绪」无超时（v2 U-14 ① 已加 30 s）；:22「Duplicate 视为已存在」与 §6-3 待查未决冲突；无 U-16 deadline 行 — 证据: 上列行号 vs PLAN.md:14-15,34,38,40,58 — 建议: W0 派发前 drafter 把这 5 处改成 v2 口径（或 REUSE 头部加「与 PLAN v2 冲突时以 PLAN 为准」并在 :16 行内直接改），U-00 派发附 PLAN 原文而非 REUSE 摘要
- [MEDIUM] PLAN.md:34（U-00 ⑥⑦）、:42（U-22）— 全 PLAN 无 CSP。主窗口 origin 持有 `pbots:api`，会话页渲染 LLM 输出的 markdown；上游渲染器任一消毒缺口即同源 XSS → 自答审批，⑦ 的导航/新窗口门控拦不住同页脚本。D 本身无 CSP（`grep -rn Content-Security-Policy apps/desktop` 无匹配），抄不到 — 证据: 上述 grep；PLAN.md:42 ③ 只测链接点击 — 建议: U-00 在 protocol handler 响应头（或 index.html meta）加 `default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-src 'none'`，⑦ 加一条：页内注入 `<img src=https://example.com/x>` 与 inline `<script>` → 无网络请求、脚本未执行；这也让 D12① 在真模型冒烟（U-31 ④，LLM 可能输出远程图片 markdown）下从「碰巧没请求」变成结构性保证
- [LOW] PLAN.md:20,45（P4-BASE..HEAD）— 范围会把同期合入 main 的 p2-sdk 任务（T-16、T-12.f1、T-09）一并纳入，与 p2-sdk 自己的 L 审重叠；不漏审，只是成本与归属混淆 — 建议: mm-review L 加 pathspec `-- app/ui work/p4-ui` 外加 U- 任务实际触及的 app/sdk 文件，或明说重叠可接受
- [LOW] PLAN.md:26 vs :25,38 — 独占清单写 `main/{index,window,sender}.ts`，漏 `ready.ts`；U-14 ① 要「经 `ready.ts` 闸门」但区域只有 `m3-meta/ensure.ts` — 建议: U-00 交付 ready.ts 的注册 API（`registerReadyGate(promise)`）并把 ready.ts 加进独占清单，U-14 只调用
- [LOW] PLAN.md:34 ⑦(e)「第三个窄函数」— C:24 已命名 `pbots:bots-meta` — 建议: 写实名，免测试漏通道
- [LOW] PLAN.md:34 ⑦「先在去掉该条门控的构建上见红」— 未规定红的证据形态，5 次生产 build 成本也未提 — 建议: 每条红用 spike/U-00 上的临时 revert commit + 失败日志落 `evidence/U-00/red-<a..f>.log`，不引入关门控的 env 开关（生产包里留开关本身是风险）
reverse_take: 最可能的失败从「漏抄门控」换成了「多抄了一截」——照 762-775 原样搬 protocol handler，把带 cookie 的 Host 反代一并搬进来，renderer 一句 fetch 就绕过整个 M1 白名单，而 D12① 的计数口径恰好看不见它；更笨更稳的做法是 handler 只认构建产物清单、其余 404，并配一条 fetch 红绿测试。

## 关注点逐项核对

### 1. G2-r1 两条 HIGH
| 条 | 要求 | v2 落点 | 判定 |
|---|---|---|---|
| HIGH-1 门控 | webviewTag:false、生产 devTools:false | ⑦(a) `getLastWebPreferences()` | 到位 |
| | setWindowOpenHandler deny + openExternal | ⑦(b)，含 `<a target=_blank>` | 到位 |
| | will-navigate 只认本应用 origin，去掉 http 同源放行 | 捷径「去掉 http 同源放行」（D main.ts:356-364 的 `http: && same origin` 分支确实存在）；⑦(c) 含 https 与 `file:///tmp/x.html` | 到位 |
| | preload 按协议/主机 expose；自定义协议不放行 file:// | 决策 7 `pbots-app://app/`；⑦(d) 同 preload 载 `data:`/`file://` → `window.pbots` undefined | 到位 |
| | ipc senderFrame 校验 | ⑦(e) null / 非主 frame / 非本 origin 三类各拒，dsh 计数 0；锚点 `ipc.ts:108-115` + `main.ts:492-497` 已核实（`assertDesktopSender` + `assertProductSender`） | 到位 |
| | 每条红绿、跑生产 build | ⑦ 引言 | 到位（证据形态 LOW） |
| | 回归 | U-22 ③ 链接点击 getURL 不变、窗口数 1 | 到位 |
| HIGH-2 L 范围 | 基线 SHA 记 review-coverage | §1 ②（W0 派发前） | 到位 |
| | 审基线..当前 main | U-31 review 列 + ⑤ | 到位 |
| | 删聚合分支引用 | `grep -n "feat/p4-ui\|main\.\.\.feat" PLAN.md` 无匹配 | 到位 |

两条 HIGH 本身完整落实；但决策 7 的锚点 762-775 带出了新 HIGH（见 findings 第 1 条）。

### 2. MEDIUM 吸收
| 项 | 落点 | 判定 |
|---|---|---|
| U-24 deps U-23 | :44 deps | 到位 |
| U-12 deps Q-spike（仅 ③） | :36 | 到位 |
| REUSE 汇总 | REUSE.md 存在，§1 ① 为前置，U-00 deps 引用 | 存在但口径停在 v1（MEDIUM） |
| socket 层归 U-00 | 决策 6；:26 独占；U-00 合入清单含 `main/dsh/{socket,connect,ledger}.ts`；⑥ 断线重连 + generation+1 + 未知 streamId 进 tap；U-12 捷径「不改 main/dsh」 | 到位 |
| U-13 ⑥ live | `get` 的 live = 未过滤 #1 含该 id，单测 false 且不写盘；U-23 ③ 注明来源 | 到位 |
| U-13 ⑦ #4 屏障 | env 门控、停在三条件、未设 env 不触发单测；U-23 ⑥ 引用 | 到位 |
| U-14 超时 | 每个 ensure 30 s 常量、超时按失败、永不返回单测 | 到位（ready.ts 归属 LOW） |
| U-16 新任务 | 条件行、owner 二分、假时钟单测、只代答 rejected；U-22 deps 加 U-16（skipped 视为满足） | 到位 |
| W2 区域 | 各行补 `tests/e2e/<页>*`；U-22 补 dev-min（删除） | 到位 |
| D12① | `pbots-app://` 外请求 0，生产 build，127.0.0.1 也 FAIL | 到位；但对 `pbots-app://` 内反代流量是盲区（随 HIGH 修） |
| A-LOW 6 条 | SHA 锚定 ⑥、bootstrap ④(5)、关 renderer 澄清 ④(4)、+2 拒绝测试 ②（现 5 条）、ledger 联调 U-15 ③、主 bot 重建两分支 U-21 ①、§6-4 措辞 | 全部到位 |

### 3. v2 新引入的不一致
- 决策 7 / U-00 捷径照抄 762-775 → Host 反代（HIGH，上）。
- REUSE v1 与 PLAN v2 五处冲突（MEDIUM，上）。
- ready.ts 独占/归属不一致（LOW）。
- ⑦(e) 通道名未写实（LOW）。
- 其余交叉引用（U-23 ③→U-13 ⑥、U-23 ⑥→U-13 ⑦、U-22 ④→U-16、U-15 ③→U-11 ③、§5 附加要求落点）逐条核对一致。

### 结论
REVISE（有条件通过）。G2-r1 两 HIGH 与全部 MEDIUM/LOW 吸收到位；新增 1 HIGH（protocol handler 不得抄 forward 分支 + fetch 红绿测试）与 2 MEDIUM（REUSE 对齐 v2、CSP）均为 W0 派发附加要求即可闭合，不改路线、不需第 3 轮。
