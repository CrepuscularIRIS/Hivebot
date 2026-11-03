# VERIFY · P5-21 SDK 档位策略（L-AP 主体核心）

verdict: PASS
commit: 82663512b1f56b9f0bfbfe5a8bbf908938a00b47（feat/P5-21 @ /tmp/bot-wt/P5-21，worktree 干净、探针后已恢复）
验收时间：2026-11-03 13:24–13:5x；验收人：verifier（GLM 5.3），独立复跑，HOME=/tmp/bot-vfy-p5-21
本任务无 UI（A9④ 卡片按钮归 P5-31），无浏览器截图项。

## 验收项对照（PLAN p5-parity P5-21 行 ①–⑥）

| 验收项 | 结果 | 证据 |
|---|---|---|
| 全量测试（申报 32/281） | PASS | `pnpm -C /tmp/bot-wt/P5-21/app/sdk test` 一跑 32 files / 281 tests 全绿（89.7s，未遇 /tmp handoff 残留红，无需复跑）。evidence/P5-21/full-run.log |
| tiers-policy 单文件 6 用例 | PASS | 单跑 6/6 绿（13.4s）。evidence/P5-21/tiers-only.log |
| 红基线①：门控恒关（`policyStateValid` 摘成恒 false） | PASS（红如预期） | 7 红：e2e ①②③b⑤ + 单测 P5-21①×2、⑤；③a/④ 保持绿（坏表与区外路径本就不依赖门控，与代码路径一致）。evidence/P5-21/probeA.log |
| 红基线②：坏表 fail-closed 改为回退文件表（保留 ALWAYS） | PASS（红如预期） | A9 单测 2 红，判别格「坏表下 web_fetch 也要问」红（回退后 web 放行 Symbol(next)）；恢复代码后单测+e2e 48/48 绿、worktree 干净。evidence/P5-21/probeB.log、probe-restore.log |
| ① A2 沙箱内 0 卡 | PASS | tiers-policy.test.ts `①`：asked===0、bash 写/读经 wrapper 落宿主（a.txt='hi'）、write 落盘、read 读回 p521-ws——断言有真实副作用检查，探针A证非空转 |
| ② 五态退 ASK + 同会话翻状态不重启 | PASS | e2e `②`：**同一 runtime 同一会话**（RT 由 ① 创建未重启）五态逐 turn 出卡（精确计数 expectedCards 递增）、拒绝无副作用、恢复后回静默；单测五态×bash/read/write 10 格。代码逐调用 `readFileSync`（shell-ask.mjs:86-104 无状态缓存；仅 launch-token 哈希缓存，token 会话内不变，合理）。探针A红含恢复格 |
| ③ A9 ①②③⑤⑥（坏表/wrapper 坏/NEVER 不降/D4 重跑） | PASS | e2e `③a`：坏表 bash/区内 read 出卡+stderr 日志行、NEVER 不出卡（无卡可批）原因仍为 p2sdk-fs-guard、凭证哨兵 sha256 不变；`③b`：wrapper chmod 000 → asked===0 且命令 Permission denied、marker 不存在（无「无卡且裸跑」）；D4（config.test.ts）全量内绿+单独复跑绿 |
| ④ A3 区外读出卡、无 always 资格 | PASS | e2e `④`：/etc/hostname 出卡 toolName='read'、allowed-once 后读到、rejected 后失败、**同一调用再次出卡**（精确计数 1→2，SDK 层无任何常驻授权通道的机械证明）。UI 按钮 DOM 断言归 P5-31（PLAN 依赖列明） |
| ⑤ A9⑦ 子会话 | PASS | e2e `⑤`：never 子会话 bash 执行且 wrapper 内（.ssh 哨兵 NOTSEEN）、marker 落宿主；区外 read 报 'approval unavailable in this session'；凭证 read guard 拒；根/子会话均 0 卡。探针A红 |
| ⑥ D-2 选③时连接器全部出卡不读 annotations | PASS（按 Q-016 定稿口径） | tiers.json mcp=ask + shell-ask.mjs:199（mcp__ 前缀不读任何 hint）；单测「mcp__ prefixed tools ask even with the gate open」。PLAN 此格写「第 8 行」系 D-2 答复前旧文，Q-016 已定稿 A=③+落第 7 行，行为一致（都 ASK），见新问题 3 |
| 门控真实性（逐调用重读） | PASS | 见②行：代码 readFileSync 无缓存 + e2e 同会话逐 turn 翻状态 + 探针A红。档位表本身 apply 时缓存是有意设计（文件头注释 106-110 行：决策 16 只要求 policy-state 不重启生效），非缺陷 |
| 既有测试 4 处语义适配 | PASS（合理） | guard-fs：区内成功格自动 allowed-once，deny 格 asked 恒 0 不受影响；market③：反而**新增**「出卡数===1」断言（收紧）；mock-demo①：属性断言（token 不进 transcript）不变，失败层从 /not found/ 换成更强的 /p2sdk policy/；guard-escalation④b：断言现值（dfa 无 policy-state → 区内 read 退 ASK→never 拒），细化为 2 个 guard 会话级 deny + 1 个 shell-ask never deny（原因字面串区分），报告已列依赖 P5-29 复跑 |
| 区域与互踩 | PASS（一处申报数出入，见新问题 2） | 实际 13 文件（产品 6 + 测试 7）全部在申报区域内（src/policy、start.ts、profile/、tests/）。互踩：tiers.json 由插件经 import.meta.url 直读（不经 yaml，与 approval.yml insert 无交叉）；runtime patch `- id: p2sdk-shell-ask` config 行对 insert 行整键覆盖 = applyEntryPatches 非 insert 路径 `target[key]=value`（dsh-app-boot lib/index.js:145-189），与 P5-02 guard 行同机制；行为证据：e2e ①（config 注入生效门开）、③a（overlay 整键替换语义被显式利用，重述 policyStatePaths） |
| 决策 16 解读分歧（派发第 7 项） | 实现与报告一致 | shell-ask.mjs:200-201：`allow` 档（web_fetch/web_search/default）直接 next() 不查门；文件头 21-22 行注释自述「不因门关收紧——门只收回 P5 新授的自主」。与 REPORT「未完成/新发现 1」所述一致。分歧本身列新问题 1 交 director |

## 红基线探针记录（非空转证明）

- 探针 A（门恒关）：改 `policyStateValid` 首行 `return false` → 单测 3 红 + e2e 4 红（①②③b⑤），恢复后 48/48 绿。
- 探针 B（坏表不退，回退文件表保留 ALWAYS）：`loadTiers` config.tiers 非法时回退 `readTierFile()` → A9 单测 2 红（含判别格：坏表下 web 也必须问；e2e ③a 因 overlay 未重述 handoff 门恒关、两条路径都出卡，单独不判别——判别在单测，套件整体覆盖成立），恢复后 48/48 绿。

## 新问题（可直接成为修复任务/决策项）

- [DECIDE] 决策 16「所有 ALWAYS 退回 ASK」实现为「仅 bash+工作区内文件随门收紧；web_fetch/web_search/default（allow 档）不随门关」 | 复现：门关态（paused:true）调 web_fetch → 不出卡直接执行；PLAN P5-21 行原文「ALWAYS 全退 ASK」 | 位置：app/sdk/src/policy/shell-ask.mjs:200-201 + 文件头注释 | 严重度：M（口径分歧非缺陷，实现自洽留证；直接影响 P5-29 暂停开关语义范围——暂停时 web 是否也收窄，需 director 定稿后二者其一改实现其一改 PLAN 文字）
- [FIX] 档位表**文件源**损坏分支无直接测试：③ 的坏表用例全经 config.tiers 注入，生产读的 profile/tiers.json 走 readTierFile 的 try/catch（shell-ask.mjs:129-139）未被任何用例覆盖 | 复现：把 profile/tiers.json 改成非法 JSON 跑 `pnpm vitest run tests/unit/policy.test.ts`——无红（该分支不触发） | 位置：app/sdk/tests/unit/policy.test.ts（建议 vi.resetModules + mock readFileSync 补一条） | 严重度：LOW
- [FIX] 报告文件数申报 12（产品 5+测试 7），实际 13（产品 6+测试 7）——漏计一个产品文件（approval.yml 仅注释变更或 never-roots.mjs 三行容错修复未入账） | 复现：`git diff --name-status c6aba1b..8266351` 数 13 | 位置：work/p5-parity/REPORT-P5-21.md | 严重度：trivial（台账口径，区域无越界）

备注：PLAN ⑥ 格文字「连接器全部按第 8 行出卡」为 D-2 答复前旧文，Q-016 已定稿 ③+第 7 行（行为同为 ASK、均不读 annotations），当前实现符合定稿口径；建议主会话随下轮 PLAN 修订同步该格文字，不单开修复任务。报告「⑥ 桥接分档留 P5-23」表述已过时（Q-016 A=不做桥，P5-23 仅身份表），不影响验收结论。

## 证据文件

- /home/lingxufeng/bot/work/p5-parity/evidence/P5-21/full-run.log（全量 32/281 绿）
- /home/lingxufeng/bot/work/p5-parity/evidence/P5-21/tiers-only.log（6/6 绿）
- /home/lingxufeng/bot/work/p5-parity/evidence/P5-21/probeA.log（门恒关 7 红）
- /home/lingxufeng/bot/work/p5-parity/evidence/P5-21/probeB.log（坏表不退 A9 2 红）
- /home/lingxufeng/bot/work/p5-parity/evidence/P5-21/probe-restore.log（恢复后 48/48 绿）
