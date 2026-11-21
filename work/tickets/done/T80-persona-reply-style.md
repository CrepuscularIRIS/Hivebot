# T80：底座语气换成原版文字聊天规格（去掉「coding agent + 三段式」）

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：work/persona-stop-gap/BRIEF.md §1；PLAN.md「经理核实结论」1–5
> 分支 / 作业目录：feat/T80 @ /tmp/bot-wt/T80
> claimed：1237e6fc @ /tmp/bot-wt/T80（2026-11-12）
> accepted：2026-11-13 b46c1c6c（与 T80b 一起终验，见 done/T80b 尾部）

## 目标
默认 preset（standard）的 persona prefix 现在是「You are a coding agent… Reply in three parts… 100 words」，bot 说话像工程报告。换成 0.18 原版文字聊天的语气规格，并让每个 bot 知道自己的名字。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md、work/persona-stop-gap/PLAN.md（**注意：不要用 0.78.1 的 `## Role & Persona`，那是语音通话 prompt**）
2. 规格原文：`repos/grok-bot-0.18-reconstructed/source/host/runner/system-prompt.ts:80`、`:84`、`:88`、`:104-111`、`:113-120`（Tone）、`:122-130`（Reply length and shape）；名字行 `system-prompt-assembly.ts:104-106`
3. 改动点：`app/sdk/profile/patches/approval.yml:57-76`（preset-standard persona prefix 与其上方注释）、`app/sdk/profile/patches/p6-reply-style.yml`（同一段，保持逐字节一致）
4. 名字行落点：`app/sdk/src/awareness/product-prompt.mjs` 的 `awarenessText`（已有 selfId、名册 title、`sanitizeName`）
5. 钉死的旧 sha：`app/sdk/tests/e2e/config.test.ts:219-239`

## 新 persona prefix 的组成（逐句搬，只按我们的机制改写，不加自创句）
1. 开场：`You are a warm, concise desktop assistant.`（0.18:80，去掉 "Grok Bot"——名字由下面的名字行给）。删掉 `You are a coding agent powered by the {{model}} model.`。
2. `## How a turn works`：只保留与我们机制相符的意思——先回一句再动工具（0.18:84 第 1 条，去 SendMessage/ReactToMessage/routine 字样）；工具调用之间的正文会被折叠，别逐步旁白（沿用现段落里这句，这是我们 UI 的事实）；结果放在最后一段正文里交付，确认收到不等于交付（0.18:96 的意思，去 SendMessage 字样）；失败时一两句说清原因和最可能的下一步（0.18:110）。
3. `## Tone`：0.18:113-120 **整段逐字**。
4. `## Reply length and shape`：0.18:122-130 逐字，但删去 :125（Multi-message by default，依赖 SendMessage 多气泡，我们一回合一条）；:127 末尾 Markdown/KaTeX 句、:128 mermaid 句——先查我们渲染器是否支持（`app/ui/renderer-grok` 里搜 katex / mermaid），不支持的删掉那一句，支持的保留；查到什么写回执。
5. 其余 0.18 段（Showing your work / Threaded replies / Code changes / Autonomy…）**本单不搬**。

## 名字行
`awarenessText` 里，selfId 在名册里有非空 title 时，在段首加两行（0.18 assembly:105-106 原句）：
`Your agent name is "<name>". If the user asks for your name, answer with "<name>".`（name 走 `sanitizeName`；title 缺失/为 Untitled bot 时不加）。

## 边界
1. 只动：`approval.yml`（preset-standard 的 prefix 与它上方 P6-05 注释）、`p6-reply-style.yml`（prefix 与文件头说明）、`product-prompt.mjs`、`tests/e2e/config.test.ts` 的 P6-05.f1 格、`tests/unit/awareness-prompt.test.ts`。preset-cordis / preset-ptc 不动。不碰 dsh 上游、不新增 section、不改 routing-prompt.mjs（主 bot 编排段保留原样）。
2. 先写失败测试：
   - `config.test.ts` P6-05.f1 改成断言新段：系统提示含 `You are a warm, concise desktop assistant.`、含 `## Tone` 与 `## Reply length and shape` 两段，**不含** `coding agent`、`Reply in three parts`、`100 words`；新段整体 sha256 重钉（回执写出新值和抠段方式）。先跑红。
   - `awareness-prompt.test.ts` 加两格：有 title → 含名字行；title 带 `<>"` 注入字符 → 名字行里已清洗；无 title → 无名字行。先跑红。
3. `includeHarnessIdentity` 不动；只有验收 4 的抽样里 bot 自称 DeepSeek Harness / coding agent 时，在产品 profile 里把它设 false，并在回执写明（仍不改 dsh 代码）。
4. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。
5. 只在 feat/T80 提交，提交正文写 `来源: https://github.com/b-nnett/grok-bot-0.18-reconstructed@a9f633e:source/host/runner/system-prompt.ts`。

## 验收（写命令，不写感觉）
1. `cd app/sdk && pnpm vitest run --config.verify-deps-before-run=false tests/e2e/config.test.ts -t "P6-05.f1"` → passed
2. `cd app/sdk && pnpm vitest run --config.verify-deps-before-run=false tests/unit/awareness-prompt.test.ts tests/unit/orchestration-routing.test.ts tests/unit/orchestration-envelope-live.test.ts` → 全 passed
3. `diff <(sed -n '/prefix: |/,/- id: agent-instructions/p' app/sdk/profile/patches/approval.yml | head -n -1) <(sed -n '/prefix: |/,/- id: agent-instructions/p' app/sdk/profile/patches/p6-reply-style.yml | head -n -1 | sed 's/^      //')`（缩进按实际调整，回执贴实际命令）→ 两处 prefix 逐字相同
4. 真实模型抽样（演示实例或隔离起的 runtime，默认模型）：新建一个名为「新闻播报」的 bot，依次发 `你好`、`你叫什么？`、`解释一下 TCP 三次握手`；把三轮的 `system/message` 与回复从 session.v4.jsonl.zstd 解出存 `work/persona-stop-gap/evidence/T80/`，并截一张聊天截图（DPR2 亮色）。判据：
   - 系统提示 `grep -c "coding agent\|Reply in three parts"` = 0，`grep -c 'Your agent name is "新闻播报"'` = 1
   - `你好` 的回复 ≤ 2 句、无「有什么可以帮你」式转向；`你叫什么？` 回答「新闻播报」，不提 DeepSeek Harness / coding agent；TCP 那条无 `#` 标题、无项目符号列表、≤ 2 段
   - 同时存一份**改前**（主线 HEAD）同三问的回复做对照。经理亲看对照判语气。
5. 改动行覆盖：`product-prompt.mjs` 新增分支被 2 的新格覆盖（回执贴覆盖行）。

## 为什么这样验收
用户要的是「说话像个人」，不是 prompt 字符串换了。1–3 保住结构：默认 preset 真的换了底座、两份 prefix 不漂、名字行防注入；4 保住目的：真实模型在真实系统提示下语气变了，且有改前对照——只断言字符串会出现「prompt 换了但模型照样写报告」的假绿。抽样判据刻意只取明显可判的几条（句数、标题、列表、自称），语气细节留给经理看对照。

## 产出
- 修改：`app/sdk/profile/patches/approval.yml`、`app/sdk/profile/patches/p6-reply-style.yml`、`app/sdk/src/awareness/product-prompt.mjs`、`app/sdk/tests/e2e/config.test.ts`、`app/sdk/tests/unit/awareness-prompt.test.ts`
- 新建：`work/persona-stop-gap/evidence/T80/`（前后对照 jsonl 摘录 + 截图）、`work/tickets/receipts/T80.receipt.md`

## 经理终验（任务 B，2026-11-13，验收时 feat/T80 HEAD 4197fb8b）——**不通过，返修走 T80b**

重跑（隔离 HOME/TMPDIR，DBus 指向不存在路径；注：`--config.verify-deps-before-run=false` 要放在 `pnpm` 后、`vitest` 前，放 vitest 后面 vitest 直接崩）：
- 验收 1：P6-05.f1 → **1 passed | 1 skipped** ✓
- 验收 2：三个 unit 文件 → **38 passed (38)** ✓
- 验收 3：两份 prefix diff（approval.yml 去 0 缩进、p6-reply-style.yml 去 4 空格）→ **逐字相同** ✓；抽出段含开场句 1 次
- 改动范围：`git diff --stat 55bdcecb..4197fb8b` = 允许的 5 个文件，无越界 ✓
- Sol 低①（Reply length 逐字漂移）：approval.yml:97/99 Wrong/Right 示例、tldr、truly 已恢复，对 0.18:127-129 一致 ✓
- 同源：after-final.json `sessionId=session-fc6ea06b-…`，截图与其文字一致 ✓

**验收 4 失败（Sol 中⑦ 修后仍不成立）**：
1. `你好` → 「你好呀！有什么我可以帮你的吗？」——正是判据禁止、也是 Tone 段（approval.yml:85）点名禁止的「pivot straight to what can I help you with」。回执写「你好 1 句 ✓」漏判了这条。
2. `你叫什么？` → 尾巴「需要我帮你做点什么吗？」，同一个反射。
3. TCP：截图里是 **1./2./3. 编号列表**；after-final.json 取的是 UI 气泡 innerText，丢了列表标记，回执据此写「无列表」是取数方式错了。证据要从 session 原文取，不从 UI 文本取。
4. 根因候选：系统提示第一句仍是 `You are an AI agent powered by DeepSeek Harness.`（`includeHarnessIdentity`），紧挨着 persona 开场句，身份两头说；Tone 的反例全是英文，模型对中文「有什么可以帮你」不对号。

**TCP「≤2 段」口径裁决**：字面「≤2 段」放宽，改判「不像报告」：无 `#` 标题、无粗体小标题、无项目符号大纲；**天然步骤**（握手这种三步）允许 ≤4 项编号步骤 + 一张 mermaid 图；总长不超过 DPR2 截图一屏。理由：0.18 Reply length 本身允许「genuinely enumerable」的编号步骤和「diagram genuinely lands better」的 mermaid，≤2 段是我开单时给的代理指标，严过规格本身。真正的目的（不写工程报告）按这个口径判。按这个口径本次 TCP 回复**算过**；不通过的是问候反射（1、2 条）和取数方式（3 条）。

代码（验收 1–3）本身没问题，T80b 在同一分支 feat/T80 上续做，T80 + T80b 一起终验、一起合并。
