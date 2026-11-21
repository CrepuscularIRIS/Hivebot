# T90b：`:` emoji 建议面板稳定弹出 + `@` 提及 Bot 真能用（A8 P0 后半段）

> 开单：manager (Opus 5.5) | 日期：2026-11-14 | 施工：main (GLM 5.3)
> 来源：`done/T90-composer-emoji-mention.md`（原验收 ①-⑤ + 截图）；拆段裁决 `receipts/T90.progress.md` 尾「T90b」节
> 分支 / 作业目录：feat/T90b @ /tmp/bot-wt/T90b（从已合 T90 的主线切；旧 feat/T90 只当参考，不 rebase 过来）
<<<<<<<< HEAD:work/tickets/done/T90b-composer-suggest-panel-mention.md
> claimed：main 2026-11-15
> accepted：2026-11-15 faccb7c0（主线 e455bf59）——**部分通过**：预载根因 + spec ①③ 成立（经理重跑 5/5、t94 1p、单测 1p、check 14），放行合并。
>   未达项移交 `open/T90c`：验收 1② 缺「发送后 user 消息含 @名字」；④ `toHaveCount(0,{timeout})` 首拍即过=假断言、且未断言选中发生；验收 3 截图实物不合格（面板=无样式 `<li>`+原生按钮，落在输入框下方被视口裁掉，非「贴光标下方」），暗色图因此一并在 T90c 补。
========
> claimed：纯 spec 提交（2026-11-15，feat/T90b）
> accepted：
>>>>>>>> feat/T90b:work/tickets/doing/T90b-composer-suggest-panel-mention.md

## 目标
打 `:smi` 面板每次都出来、能选中插入；打 `@` 能看到自己的 Bot 并插入提及块，发出 `@名字` 文本。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `done/T90-composer-emoji-mention.md`「经理已查清的现状」「方案」两节（行号锚点仍有效）
3. `receipts/T90.progress.md` 全文（c4bb2161 的首拍空记档、RPC 建 bot 不进 roster 实证）
4. 旧分支 feat/T90 上的 `t90-composer-suggest.spec.ts`（可搬，但要按下面纪律改）

## 边界
1. 只动：`overrides/modules/emoji-catalog.ts`、shim 侧 listAgents 断点（若第 0 步实测证明断了）、新 e2e spec。不碰 frontend/（check 维持 14）。
2. **根因先试便宜的**：T90 已在 emoji-catalog.ts 尾加了模块加载即预载（`void loadShippedEmojiCatalog()`）。先用它跑 `--repeat-each=5` 测面板 ①；5/5 绿即根因成立，不深挖 renderer。仍 flaky 才做 TipTap Suggestion onStart/onUpdate 埋点（探针不入库）。
3. ② 造 bot 走 UI 对话框（RPC 建的 bot 不进 shim roster 已实证）；「RPC 建的 bot 不进 @ 列表」是否算 bug 记 queue 提议，不在本单修。
4. spec 不准用 sleep 掩盖时序；断言前 poll 可见可以。
5. 提及语义只到「插入块 + 发出 `@名字` 文本」；被 @ 的 Bot 是否接手不在本单。
6. 不得带 coordinator 调试 console.log 进提交（T90 剔除过的 T90-LISTAGENTS 一类）。

## 验收（写命令，不写感觉）
1. `cd app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t90b-composer-suggest.spec.ts --repeat-each=5` → 全绿；回执贴 flaky 率
   - 格 ① 打 `:smi` → 面板出现且含 😄 类条目；Enter/点击后编辑器含该 emoji 字符
   - 格 ② UI 建第二个 bot → 打 `@` 面板含其名；选中后编辑器出现提及块；发送后 user 消息含 `@<名字>`
   - 格 ③ 无匹配 `@zzzz` → `No matches for "zzzz"`
2. `cd app/ui/renderer-grok && CI=true PATH=$PWD/node_modules/.bin:$PATH pnpm check | grep -c differs` → 14
3. 亮 / 暗两张截图（emoji 面板、@ 面板各一）对照 0.78.1 参考，回执写每张图要看的点
4. 回测：`emoji-catalog.test.ts` 1p + `t94-send-key.spec.ts` 1p（面板打开时 Enter 选中、不换行不发送）

## 为什么这样验收
用户要的是「每次打都能用」，所以必须重复跑看 flaky 率，而不是跑通一次。④ 防 T94 改键位后 suggestion 内 Enter 被吞或误发。

## 产出
- `tests/e2e/t90b-composer-suggest.spec.ts`；必要时 emoji-catalog.ts / shim 小改
- `receipts/T90b.receipt.md`
