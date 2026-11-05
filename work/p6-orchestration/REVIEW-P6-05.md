verdict: PASS
base: bba98bb3486b8006ddd1ab086a5bbc3e32fc5bbc  head: 8973a67581edd118d047b6c0331588d76f437894

> head 若已不是 8973a67581edd118d047b6c0331588d76f437894，本报告作废。

# Code Review 报告 · P6-05（mm-review S 档，target 8973a67）

## 阻塞问题

无（verdict=CONFIRMED 且 severity 为 critical/major 的问题为 0；4 条 CONFIRMED 均为 minor，归入「其他发现」）。

## 上轮未修

无（unfixedFromLastRound 为空）。

## 其他发现

### O1 · severity: minor · verdict: CONFIRMED

- **file:line**: `/home/lingxufeng/bot/app/sdk/tests/e2e/guard-plugin-manager.test.ts:410`
- **finder**: glm:正确性+合规
- **summary**: persona prefix 值唯一的正确性防线（与 p6-reply-style.yml 逐字节一致 + sha256 = D3 定稿值）只存在于 work/p6-orchestration/evidence/P6-05/probe.mjs，不在 pnpm test / vitest 套件内，套内对该值零覆盖
- **触发条件**: 后续任何人改动 approval.yml（或 p6-reply-style.yml）中的三段式段落文本、或两文件之一被格式化/重写导致失同步——tests/ 与 package.json、vitest 配置中均无对该值的引用（已 grep 确认），全套 305 个测试照常全绿
- **失败表现**: 默认链（standard 会话）系统提示里的定稿段落可被静默篡改或与 P6-02 定稿 sha（c7c53cd4…b356）失同步而无任何自动化检查报警，复核只能靠手工运行探针；豁免换掉的 drift 防线没有在套内补位
- **verifier 证据**:

  本次改动确实移除了 persona 内容的套内回归保护，且未补入等价断言。/home/lingxufeng/bot/app/sdk/tests/e2e/guard-plugin-manager.test.ts:413-425 将 standard persona 的整个 config 内容替换为固定占位后再比较，因此 prefix 正文被修改或删除不会使该 drift 用例失败。我在 /dev/shm/mm-review-XXXX 临时目录直接提取并执行实际 cutPersonaPrefix 函数，分别将“Reply in three parts.”改为“Reply in one part.”、删除三段式正文和标题，两次均确认修改前后的比较产物完全相等；实验后临时目录已删除，未修改仓库。/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05/probe.mjs:83-92 虽包含定稿哈希和两份 prefix 一致性检查，但 /home/lingxufeng/bot/app/sdk/package.json:17 仅运行 vitest，/home/lingxufeng/bot/app/sdk/vitest.config.ts:5 仅收集 tests 下的 *.test.ts；搜索套内源码也未发现调用该探针或检查定稿正文及哈希的其他断言。/home/lingxufeng/bot/app/sdk/src/start.ts:121 默认加载 approval.yml，所以此类文本漂移会进入默认会话。维持 minor：确认的是这次豁免引入的回归检测缺口，不是当前定稿文本已错误；未实际运行全部 305 个测试，因此不将“全套仍绿”作为实测结论。

### O2 · severity: minor · verdict: CONFIRMED

- **file:line**: `/home/lingxufeng/bot/app/sdk/tests/e2e/guard-plugin-manager.test.ts:421`
- **finder**: sol:后端逻辑
- **summary**: 新增的 prefix 豁免实际删除整个 persona config，导致非 prefix 配置漂移也无法被检测。
- **触发条件**: 当上游 standard preset 的 persona config 新增或修改 suffix 等非 prefix 字段时，/home/lingxufeng/bot/app/sdk/tests/e2e/guard-plugin-manager.test.ts:418-421 会将 config 后到下一个插件之间的所有行一并替换；隔离执行该函数已确认，添加 suffix 后比较结果仍完全相同。
- **失败表现**: drift 用例仍然通过，但 approval.yml 的整 config 覆盖会继续使用旧 persona 配置，遗漏上游新增行为。这超出了注释声明的仅豁免 prefix 值范围。
- **verifier 证据**:

  代码核实（均为本次阅读的 file:line）：

  1. /home/lingxufeng/bot/app/sdk/tests/e2e/guard-plugin-manager.test.ts:413-422 — cutPersonaPrefix 从 `        config:` 行（:415 定位，slice(0, cfg+1) 保留到 config 行为止）到下一个 `      - id: ` 行（:417-420 的 end 循环）之间的全部内容被替换为一行占位（:421）。函数从不定位 `prefix:` 行本身——它丢弃的是整个 persona config 体，而非仅 prefix 值。
  2. :423-424 — standard 分支下 ours（approval.yml 侧）与 exp（上游 preset 侧）两侧都过同一函数，persona config 体内的任何差异在两侧同时被抹掉。
  3. :408-412 注释声明「对 prefix 值本身豁免逐字比对」「块内其余全部行仍逐字比对」——对 persona config 体而言与实现不符（name 行确实仍比对，但 config 体全删）。
  4. :2-3 文件头：approval.yml 按 id 整 config 覆盖 preset 行；:14-15：drift 检查的目的就是「上游变更 → 红」。上游 preset（@deepseek-ai/dsh-web-app 0.2.2-alpha.2 presets/standard.patch.yml:11-14）persona config 目前恰好只有 prefix 一行，故今天豁免范围与「仅 prefix」重合；偏差恰在上游未来新增/修改 persona config 其他字段时出现——此时 drift 用例仍绿，approval.yml 整 config 覆盖继续用旧 persona 配置，静默丢弃上游新行为。
  5. 无其他守卫：work/p6-orchestration/evidence/P6-05/probe.mjs:87-94 只比对 approval.yml 与 p6-reply-style.yml（本地对本地），:224-233 只验证段落进运行时系统提示，均不与上游 preset 对比；grep 全 tests/ 目录确认 approval.yml↔preset 的 drift 比对仅存在于本用例（guard-plugin-manager.test.ts），其余引用 approval.yml 的测试（approval.test.ts / guard-fs / guard-escalation / start.test.ts）不做 preset 对比。
  6. 本次 diff 引入：git diff bba98bb..8973a67 显示 :408-425（含 cutPersonaPrefix）全部为新增，改动前为全量逐字比对。

  实验复现（/dev/shm/mm-review-XXXX，已删，不改仓库）：用真实 approval.yml + 真实 standard.patch.yml 逐字复制用例管线（:371-425 逻辑）后——基线通过（true）；在上游 persona config 追加 `suffix: NEW-UPSTREAM-SUFFIX-VALUE` 后比较仍通过（true，即漂移被掩盖）；对照组：上游 maxBytes 改动被抓住（false=红）、persona name 改动被抓住（false=红）。证明掩盖范围精确等于 persona config 体，与 finder 的隔离执行结论一致。

  severity 维持 minor：属测试安全网的潜在弱化（超出注释声明范围），非当下产品缺陷，仅在将来上游改 persona config 时才会漏报；id/name 与块内其余插件行仍受逐字比对保护。

### O3 · severity: minor · verdict: CONFIRMED

- **file:line**: `/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05/probe.mjs:77`
- **finder**: sol:后端逻辑
- **summary**: 静态检查的部分失败分支只打印错误并返回空失败数组，使缺失定稿段落的探针可以假绿。
- **触发条件**: 当 p6-reply-style.yml 中 preset-p6-reply 被删除或改名，或者其 prefix 不再含首个空行时，/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05/probe.mjs:77、80 返回 fails=[] 和 section=''；隔离执行已确认缺失 preset 时得到该返回值。
- **失败表现**: main 在同文件第243-245行将静态检查判为 PASS 并继续运行；第232行的 includes('') 恒真，因此只要默认会话有 recorder 记录，即可最终退出0，尽管定稿内容、哈希和 approval.yml 一致性检查均未完成。
- **verifier 证据**:

  All premises verified against /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05/probe.mjs (identical at head 8973a67; file is new in this diff — `new file mode`, +253 lines, so the issue is introduced by this change).

  Premise chain:

  1. Trigger satisfiable — no guard: p6-reply-style.yml is runtime-read patch-layer input (probe.mjs:23,76); if `preset-p6-reply` is later deleted/renamed, presetBlock returns null (probe.mjs:38 `if (s < 0) return null`). Nothing (type, caller, or test) prevents this drift; the modified guard-plugin-manager.test.ts drift case covers approval.yml vs upstream, not p6-reply-style.yml's insert ids.
  2. Silent-empty return: `fail()` only does console.error, never pushes (probe.mjs:71); `fails` created empty at probe.mjs:74; branches at probe.mjs:77 (`p6Block === null`) and probe.mjs:80 (`cut < 0`, prefix lacks '\n\n') return `{ fails: [], section: '', base: '' }`. Reproduced in /dev/shm sandbox: both fixtures printed `FAIL: ...` on stderr but RESULT={"fails":[],"section":"","base":""}.
  3. False-PASS propagation: main() probe.mjs:243 prints "静态：PASS" (sfails.length===0), probe.mjs:244 does not return 1, probe.mjs:245 runs liveCheck('').
  4. Vacuous dynamic pass: with section='', probe.mjs:232 `systemText.includes(section)` is always true (verified `'any text'.includes('') === true`); probe.mjs:224 still passes because default preset 'standard' comes from approval.yml/upstream and is unaffected by removing the p6-reply insert; probe.mjs:230 only fails when the recorder has no rows, which the mock round satisfies (green run in result.md confirms recorder works). Hence lfails=[], probe.mjs:248 sum 0, probe.mjs:249 prints "probe PASS", exit 0 — while the sha256 check (probe.mjs:83), D3 meta check (probe.mjs:85), and approval.yml consistency check (probe.mjs:91) never executed.
  5. Only loud path excluded: personaPrefix throws when the prefix line itself is absent (probe.mjs:65 → FATAL exit 1 via probe.mjs:253); the cited branches at 77/80 are before/aside from that and stay silent in the exit code. probe.mjs:89 (missing preset-standard override) has the same empty-return pattern, same class.

  Severity minor confirmed: evidence tooling, not shipped product; at merge time the preset existed so the recorded green run is valid — the false green only fires on future re-runs after upstream drift, and stderr still carries the FAIL line for anyone reading full logs. Exit code and stdout "probe PASS" are nevertheless falsely green, undermining the probe's regression-evidence purpose (「先有证据再宣布完成」).

### O4 · severity: minor · verdict: CONFIRMED

- **file:line**: `/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05/probe.mjs:218`
- **finder**: sol:后端逻辑
- **summary**: 动态探针遇到回合超时或 follow 流异常时没有记录失败，仍可能报告验收通过。
- **触发条件**: 当 llm/stream recorder 已写入含目标段落的记录，但此后回合挂起、runtime 退出或 follow 流报错而未收到 turn/end 时，/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05/probe.mjs:209、218 只调用 console.error 包装函数 fail，没有向 fails 添加错误。
- **失败表现**: 同文件第224-234行只要确认 standard header 和已有系统提示记录就返回空失败数组，第247-250行随即输出动态 PASS、probe PASS 并退出0，从而将未完成或异常中断的 mock 回合计为成功。
- **verifier 证据**:

  All premises hold in /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05/probe.mjs (new file, +253 lines, introduced by this diff range bba98bb..8973a67). (1) probe.mjs:71 `fail(label)` is console.error only — it cannot record anything. (2) probe.mjs:209 follow-stream `.catch((e) => fail(...))` and probe.mjs:218 `if (!ended) fail('60s 内未见 turn/end')` (covers timeout, hang, and child early-exit via the loop at :216-217) both go through fail() only; probe.mjs:221 `void drained` discards the promise so no rejection escapes to the FATAL handler at :253. (3) `fails` is only populated at :224 (header.agentPreset), :230 (no recorder rows), :232 (missing section) — all completion-independent: header comes from the pre-prompt snapshot (:200-202), and the recorder hook at :114-125 appends BEFORE `next()`, so a record containing the section exists from the moment the llm/stream request starts even if the turn then hangs or the runtime dies. With the claimed precondition (record written, no turn/end), fails is empty. (4) probe.mjs:247-250 then prints 动态：PASS / probe PASS and returns 0; probe.mjs:253 exits 0 — the stderr FAIL line has zero effect on the verdict. No guard exists anywhere in the file. Severity stays minor: one-shot acceptance-evidence script, not product code; the raw FAIL text still appears in stderr, so it weakens evidence quality rather than shipping a defect.

## 超出预算未验证

无。

## 已被否定

无。

## 统计

- finders: 2
- candidates: 5
- verified: 4
- refuted: 0
- dupes: 1
- overBudget: 0
