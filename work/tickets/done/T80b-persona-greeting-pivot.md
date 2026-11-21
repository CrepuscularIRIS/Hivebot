# T80b：T80 返修——问候/自我介绍仍「有什么可以帮你」+ 抽样取数改从 session 原文

> 开单：manager (Opus 5.5) | 日期：2026-11-13 | 施工：main (GLM 5.3)
> 来源：T80 经理终验（`doing/T80-persona-reply-style.md` 尾部）
> 分支 / 作业目录：feat/T80 @ /tmp/bot-wt/T80（续在 4197fb8b 之后）
> claimed：b46c1c6c @ /tmp/bot-wt/T80（2026-11-13）
> accepted：2026-11-13 b46c1c6c（T80+T80b 一起终验通过，放行合并 feat/T80）

## 目标
T80 的 prompt 结构已对，但真模型抽样里 `你好` 仍回「有什么我可以帮你的吗？」、`你叫什么` 尾巴仍带「需要我帮你做点什么吗？」。把这个反射压下去，并把抽样取数改成 session 原文，判据用经理裁决后的口径。

## 做法（按顺序，停在第一个够用的）
1. **取数先修**：三轮回复从 `session.v4.jsonl.zstd` 的 assistant 原文解出（不是 UI innerText——innerText 丢了编号列表标记、把 mermaid 折成一行）。截图仍同一次 run。
2. **杠杆 1**：在产品 profile 把 dsh 配置项 `includeHarnessIdentity` 设 false（PLAN.md:11；只动产品层配置，不改 dsh 代码），去掉系统提示首句 `You are an AI agent powered by DeepSeek Harness.`。然后抽样。
3. **杠杆 2（杠杆 1 不够才做）**：在 Tone 段 pivot 那条（approval.yml:85 与 p6-reply-style.yml 同位）英文反例后加中文对照 `(in Chinese too: not "有什么可以帮你的吗？")`。这是相对 0.18 逐字的**记档偏离**，回执写明；两份 yml 保持逐字一致，P6-05.f1 的 Tone sha 重钉（先红后绿）。
4. 不加其他自创句，不动 routing-prompt.mjs、preset-cordis / preset-ptc。

## 边界
只动：`app/sdk/profile/**`（杠杆 1 的配置落点 + 杠杆 2 的两份 yml）、`app/sdk/tests/e2e/config.test.ts` 的 P6-05.f1 格（只在做杠杆 2 或杠杆 1 改变被断言文本时）、抽样脚本（放 work/persona-stop-gap/evidence/T80b/，不进 app/）。测试走隔离 HOME/TMPDIR/DBus。

## 验收（写命令，不写感觉）
1. `cd app/sdk && CI=true PBOTS_TEST_HOOKS=1 pnpm --config.verify-deps-before-run=false vitest run tests/e2e/config.test.ts -t "P6-05.f1"` → 1 passed 1 skipped（若做了杠杆 1，P6-05.f1 再加一条断言：系统提示不含 `powered by DeepSeek Harness`，先红）
2. `pnpm --config.verify-deps-before-run=false vitest run tests/unit/awareness-prompt.test.ts tests/unit/orchestration-routing.test.ts tests/unit/orchestration-envelope-live.test.ts` → 38 passed
3. 两份 prefix diff 逐字一致（T80 回执命令）
4. 真模型抽样：**3 个新会话 × 同三问**（bot 名「新闻播报」，默认模型），原文存 `work/persona-stop-gap/evidence/T80b/run{1,2,3}.json`（含 sessionId、systemText、三轮 session 原文），第 3 轮出一张 DPR2 亮色截图。判据：
   - 每轮系统提示：`coding agent|Reply in three parts` = 0；`Your agent name is "新闻播报"` = 1；做了杠杆 1 时 `powered by DeepSeek Harness` = 0
   - `你好`：≤2 句，3 轮里**至多 1 轮**含「有什么(我)?可以帮(你|您)|需要我帮你|能帮你什么」类转向（`grep -cE` 贴数）
   - `你叫什么？`：3/3 回答含「新闻播报」，不提 DeepSeek Harness / coding agent / 编程助手；尾巴转向同上至多 1 轮
   - TCP（经理裁决口径）：3/3 无 `^#` 标题、无 `**…**` 小标题、无 `^[-*] ` 项目符号；编号步骤 ≤4 项；mermaid 允许
5. 回执贴每轮三问原文与 grep 计数表，写明用了几个杠杆。

## 为什么这样验收
用户要「说话像个人」，问候第一句就是客服腔是最显眼的失败。单次抽样在非确定模型下说明不了什么，所以改 3 轮看比例；取数改 session 原文，防止 UI 文本丢格式造成假绿（T80 就栽在这）。杠杆有先后，先关掉身份冲突（产品配置、零自创文字），不够再加一句中文反例。

## 经理终验（任务 B，2026-11-13，feat/T80 HEAD b46c1c6c）——**T80+T80b 通过，放行合并**

重跑（隔离 HOME/TMPDIR/DBus）：
- 验收 1：P6-05.f1 → **1 passed | 1 skipped** ✓
- 验收 2：三个 unit 文件 → **38 passed (38)** ✓
- 验收 3：两份 prefix diff（p6-reply-style.yml 去 4 空格）→ **逐字一致** ✓
- 改动范围：`55bdcecb..b46c1c6c` = T80 的 5 个允许文件；`4197fb8b..b46c1c6c` 只动 approval.yml / p6-reply-style.yml / config.test.ts ✓；worktree 干净，app/ 无抽样脚本 ✓
- 杠杆 1 全局行：上游 dsh-headless `system-prompt` 行只有 `personaPrefix` 一个键，全量重述不丢键；preset-cordis(:239) / preset-ptc(:374) 各有自己的 persona prefix，清空全局 personaPrefix 不影响它们 ✓

验收 4，亲读 run{1,2,3}.json 的 session 原文（三份 systemText：coding agent 0 / Reply in three parts 0 / powered by DeepSeek Harness 0 / 名字行 1，全部 ✓）：

| 轮 | 你好 | 你叫什么？ | TCP |
|---|---|---|---|
| run1 | 「你好呀！我在这边，有什么想聊的或者要我帮忙的吗？」→ **算转向** | 「我叫「新闻播报」～」干净 | 先给答案，接着讲为什么是三次，再放 mermaid，末尾问要不要展开；无标题/列表 |
| run2 | 「你好呀！最近怎么样？」hand-it-back ✓ | 「我叫「新闻播报」。」干净 | mermaid，然后用一段文字讲三步，再讲为什么，末尾问要不要展开；无标题/列表 |
| run3 | 「你好呀！今天过得怎么样？」✓ | 「我叫「新闻播报」，是这里的机器人之一。有什么想聊的或者想让我查的新闻，随时说～」→ **算软转向** | mermaid 加 3 项编号（`**SYN**` 是行内术语加粗，不是小标题），有一处 em dash |

- **run1「你好」裁决**：算转向（「要我帮忙的吗」就是 help-desk pivot，正则漏了这种说法）。按判据，3 轮里至多 1 轮 → 1/3 **过**。
- 名字句尾巴：run3 的「随时说～」是邀请式，不是问句，按严口径也计 1/3 → **过**。
- TCP：3/3 无 `^#`、无粗体小标题、无项目符号，编号 ≤3，mermaid 允许 → **过**。语气对照 T80 before（列表轰炸、自称编程助手、`##` 长文）是质变。
- run3.light.png 亲看：和 run3.json 逐字一致（单源 ✓）。mermaid 显示红字「Couldn't render this diagram.」，下面是原始代码，属于已记档的呈现缺口，不是本单范围。

记档（不返修）：
1. **回执 run3 引文和证据不符**：回执写 run3 的你好是「你呢，今天过得怎么样？」，名字句是「名字听着像只管播新闻，其实别的也能聊～」；run3.json 和截图里实际是上表那两句。按证据判，结论不变；回执引文以后从 json 直接贴。
2. 抽样脚本没留在 evidence/T80b/（工单要求的），无法复跑。合并后主 agent 补放即可，不挡合并。
3. Tone pivot 条插入中文后丢了句号（`…？") Just say`），属于外观问题，sha 已钉，不单独开单。
4. 判据正则漏掉「要我帮忙 / 想让我…随时说」这类说法，以后的抽样要人工复核，或者把正则扩成 `帮忙|帮你|帮您|随时说`。
