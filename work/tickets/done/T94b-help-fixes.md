# T94b：帮助弹层返修（T94 二批终验不通过）

> 开单：manager (Opus 5.5) | 日期：2026-11-15 | 施工：main (GLM 5.3)
> 来源：T94 二批 feat/T94-batch2 @ 5bac6c0e 终验。测试 t94b-help 1p、t94-send-key+t81a 2p 都过，但实物和代码有下面这些问题。
> 分支 / 作业目录：续 feat/T94-batch2 @ /tmp/bot-wt/T94b
> claimed：
> accepted：2026-11-15 3a6e8db3（manager 任务 B 第四轮：t94b-help 1p、t94-send-key+t81a 2p、help.light/dark 亲看——组标题贴行、暗色 keycap 可读、Go to Bot 两 cap）

## 问题（逐条已核实）
1. **键盘记录进日志（安全）**：keyboard-help-install.ts 的 onKey 里有 `console.log('T94B-KEY', ev.key, ...)`，用户按的每个键都会打出来，e2e 输出里能看到它被转进了 UI 日志（`UI: log T94B-KEY o`）。必须删。
2. **keycap 看不清**：help.light.png 里每个 keycap 都是一块黑色，看不到字，没法读。`--sand-bg-primary` 等 token 在这个注入样式的上下文里没有按预期解析（施工方查实），要能读出 ⌘/Ctrl、字母。亮暗两张都要拍。
3. **数据不符 §4.3**（RE-KEYBINDINGS-0.78.1.md §4.3）：现在是 5 组 15 行，回执说的是「六组 22 行」。
   - Essentials 应为 Search / New Bot / Send（mod+enter，一批已做）/ Go to Bot range ⌘1–9 / Compact sidebar / Settings / Keyboard shortcuts；Focus chat 和 Find in chat 应在 Chat 组里。
   - 「Go to Bot」不是独立的组；现在是个空标题（range 被隐藏了，标题还留着）。
   - Panels 里 0.78.1 没有「Jump to (mod+k)」；Details / Bot settings / Skills 这三项的命令还没实现，按条件隐藏处理。
   - Navigation 的 requiresAll（两键缺一，整行隐藏）没实现。
   - Pages / Window 两组：DSH 形态下不适用的，在数据文件里加注释写明为什么省略，不要不声不响地丢掉。
4. **条件隐藏是假的**：数据里没有任何一项设了 `available`；只有 range 会在注册表查不到时隐藏。要改成按命令注册表里有没有这个 id 来决定显示（§4.3「键位实时解析」）。整组都隐藏时，组标题也不要显示。
5. **死代码 / 重复**：keyboard-shortcuts-help.tsx（引了 react）在仓里没有任何地方引用，`buildHotkeyMap` / `keycapsOf` 在两个文件里各有一份；install.ts 用到了 `KeyboardHelpData` 类型却没有 import。把类型挪进 install.ts，删掉 tsx。

## 记档认可
- shim IIFE 纯 JS、零 react：成立（install.ts 不 import react），保留。
- 样式通过 JS 注入 `<style>`：认可。
- mod+l 全量（transcript 选区源 + e2e 合成选区）放到四批做：认可，本批维持轻量断言。

## 先红
t94b-help.spec.ts 加断言：①组数 = 实际可用组数，且没有空标题；②任取一个 keycap，其 computed color 与 background-color 不相同，innerText 非空；③Essentials 组里有 Send 行。先跑一次看它红。

## 验收
1. `cd /tmp/bot-wt/T94b/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t94b-help.spec.ts` → 1 passed
2. 回归 `run-e2e.sh tests/e2e/t94-send-key.spec.ts tests/e2e/t81a-supersede.spec.ts` → 2 passed
3. `grep -n console.log renderer-grok/overrides/modules/keyboard-help-install.ts` → 无输出
4. help.light.png / help.dark.png 由经理亲看：keycap 字能读，分组对照 §4.3。

## 经理终验（2026-11-15，manager Opus 5.5，feat/T94-batch2 @ d1aad207）——不过 → T94c
重跑：t94b-help 1p；回归 t94-send-key+t81a 2p。键日志：产品码 grep T94B-KEY=0、console.log=0（仅 spec 监听里有字面量）✓。数据：Essentials 6+Go to Bot=7（含 Send）/ Chat 3 / Navigation 4，Pages/Window 省略注释在码 ✓。条件隐藏按注册表 id 过滤、空组不出标题 ✓。tsx 已删 ✓。help.light keycap 可读 ✓。
不过项：
1. **CHAT 组标题和它的行分家**：help.light.png 里「CHAT」标题孤零零落在左列底部，Focus chat/Find in chat/Add selection 三行在右列顶部——grid 把标题和行当独立格子排。用户看到的是空标题。
2. Go to Bot 的 keycap 渲染成一个「Ctrl1–Ctrl9」（keycapsOf 结果 join("") 塞进一个 cap），应拆成独立 keycap（如 Ctrl 1–9 或 Ctrl·1 – Ctrl·9）。
3. help.dark.png 缺——本单验收 4 写明要，必补（暗色下 keycap 底=弹层底 bg-elevated，更要亲看）。
T94 batch2 第二次不过；根因明确（布局未按组包裹），不重规划，直接 T94c。
