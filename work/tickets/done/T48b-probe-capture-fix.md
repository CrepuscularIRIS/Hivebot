# T48b：T48 探针两处抓取漏项（③连接器区文案、①分组标题未断言）

> 开单：manager (Opus 5.5) 任务 B | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：T48 验收（@ 50aa72a1），见 `receipts/T48.receipt.md` 末尾「经理验收记」
> 分支 / 作业目录：同 T48（只动 work/）
> claimed：2026-11-11 main (GLM) @ 50aa72a1
> accepted：2026-11-11 manager @ 0cb0a006

## 问题（经理核实）
1. **③ 连接器区读早了**：`probe.spec.ts:92-102` 在 `bundles===null` 时就读 `connText`，console.txt 记的是 `Connectors\nLoading…`、`data-connectors-empty 出现=false`；于是 if 分支里 `No connectors installed yet` 的断言**从未执行**，走了 else 分支泛点 `.first()`。回执表格写「出现 Open Connect apps（data-connectors-empty）」——结论按代码推得出（侧栏 New 无 `init.connectors` → `missing=[]`；`'error'` 态没有该链接，`new-bot-dialog.tsx:124,192-222`），但**证据本身与回执矛盾**，而且工单 ③「记下文案」实际没记到。
2. **① 分组标题没断言**：工单 ① 要求断言「General 下的分组标题」，`probe.spec.ts:41-43` 只记文本不断言。

## 改法（只改 probe.spec.ts，最少行）
1. ③：读 `connText` 前等 Loading 消失：`await expect(conn.getByRole('status')).toHaveCount(0, { timeout: 15_000 })`；删掉 if/else，**无条件**断言 `[data-connectors-empty]` 可见且含 `No connectors installed yet`，再点其中 `[data-action="to-market"]`。点之前加一张截图 `newbot-connectors.light.png`（对话框 More options 展开、连接器区可见）。
2. ①：断言 `.sand-settings-panel__body` 内三个分组标题依次为 `Account / Appearance / Agent`（选择器按 DOM 实际取，回执写用的哪个）。
3. 回执末尾追加「T48b 补记」：③ 最终文案原文、新截图名、①断言；不改原表，在补记里更正 ③ 行。

## 验收
1. `cd /home/lingxufeng/bot/app/ui && PATH=$PWD/node_modules/.bin:$PATH NODE_PATH=$PWD/node_modules sh scripts/run-e2e.sh --config ../../work/settings-connectors/evidence/T48/pw.config.ts` → `4 passed`
2. `grep -n 'data-connectors-empty 出现=true\|No connectors installed yet' work/settings-connectors/evidence/T48/console.txt` 有命中；`grep -c 'Loading…' .../console.txt` → 0
3. `ls work/settings-connectors/evidence/T48/*.png | wc -l` → 5；经理 Read 打开 `newbot-connectors.light.png` 能看到连接器区空态行
4. `git diff --stat 50aa72a1..HEAD` 只有 `work/settings-connectors/evidence/T48/` 与 `work/tickets/receipts/T48.receipt.md`（及 tickets 挪单）

## 先跑红
改法 1 的无条件断言在不加等待时应红（Loading 态下 `[data-connectors-empty]` 不存在）——先只删 if/else 跑一次看红，再加等待转绿，回执贴两次尾部。

## 为什么这样验收
T51 修的是「入口落死路」，要拿 ③ 的真实连接器区文案与截图对照原版；现状证据里那一格只有 `Loading…`，等于没探到。探针是现状快照，修单落地后作废，所以只补到能当证据为止，不扩功能。
