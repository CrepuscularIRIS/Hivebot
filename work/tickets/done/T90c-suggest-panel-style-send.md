# T90c：emoji / @ 建议面板样式对齐 + 提及发送 + ④ 真断言

> 开单：manager (Opus 5.5) | 日期：2026-11-15 | 施工：main (GLM 5.3)
> 来源：T90b 验收未达项（`done/T90b-*.md` 头部 accepted 注）
> 分支：feat/T90c（从合了 T90b 的主线切）
<<<<<<<< HEAD:work/tickets/done/T90c-suggest-panel-style-send.md
> claimed：main (GLM 5.3) 2026-11-15（施工未挪 doing/，经理验收时直接 open→done）
> accepted：2026-11-15 feat/T90c@2950be57（feature 69310ba2）——经理重跑 t90c 1p / t90b ×5 5p / t94 1p / emoji-catalog 1p / check 14；4 图亲看过
========
> claimed：feat/T90c（2026-11-15）
> accepted：
>>>>>>>> feat/T90c:work/tickets/doing/T90c-suggest-panel-style-send.md

## 现状（经理实看 evidence/T90b/*.light.png）
建议面板是**无样式的** `<ul><li>` + 原生 `<button>`（带圆点、系统边框），渲染在输入框**下方**、被视口底部裁掉只露半行。全仓 css 无 `.sand-emoji-listbox` / `.sand-mention-listbox` 任何规则（`createSuggestionRenderer` 在 overrides/modules/rich-text-editor.tsx:479/568 只给类名）。

## 做什么
1. 先查原版：0.78.1 解包 css / 0.79.3 产物里 suggestion 浮层（listbox、option、选中态、空态）的规则与定位方式；有则搬（来源注明），查不到才按 RE-UI 浮层规格自建并写明检索记录。
2. 面板：浮层（不进文档流）、在光标/输入框**上方**、列表无圆点、行=图标+名称、选中态高亮、亮暗两色可读。只改 override 层 css（必要时 overrides/modules 定位一处），不碰 frontend/（check 维持 14）。
3. spec（t90b-composer-suggest.spec.ts 增补）：
   - ② 补：选中提及后**发送**，user 消息含 `@Zeta-T90b`
   - ④ 改：Enter 后先断言 listbox 隐藏 + 编辑器含第二个 emoji，再 `expect.poll` 稳定 ≥1.5s 内 user 消息数仍 0（不许 `toHaveCount(0)` 首拍即过）
   - 新：面板 boundingBox 底 ≤ 编辑器顶 + 完全在视口内；option 的 computed `list-style-type`=none、button 无原生边框

## 验收
1. `sh scripts/run-e2e.sh tests/e2e/t90b-composer-suggest.spec.ts --repeat-each=5` → 5/5
2. `t94-send-key` 1p；`emoji-catalog.test.ts` 1p；check 14
3. 截图 4 张（emoji/@ × 亮/暗）落 evidence/T90c/，与 0.78.1 参考并排；经理亲看：浮层在输入框上方、无圆点无原生框、暗色字可读

## 为什么
用户要的是「打 : 和 @ 时像原版一样弹一个能看能选的小面板」；T90b 证了能出能选，但实物是裸列表还被裁掉，等于没法用。④ 旧断言首拍即过，防不住 Enter 误发。
