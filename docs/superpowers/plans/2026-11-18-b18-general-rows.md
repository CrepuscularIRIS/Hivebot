# B18: General 区行序对齐（0.78.1）

## Goal
General 设置区按 0.78.1 规格重排行序并补齐可独立落地的行：Account → Appearance(Theme/Accent*/Language/Spell check) → Bot(Timezone/Auto-review) → Security Key → Microphone → Hardware acceleration → Network Debugger → Notification Sound。(*=flag 条件行)

## Constraints
- 规格锚：work/b18-general-rows/BRIEF.md（GPANE 组件级挤出，非猜测）
- 文案逐字（i18n id 已译）；shim 无服务端依赖的行才做（Language=界面语言菜单、Spell check=本地开关、Hardware accel=重启提示、Network Debugger=检查连接按钮）
- Accent 行 flag 条件默认 off——不做交互，只留结构位（0.78.1 同款 flag 门控）
- Microphone/Network Debugger/Import memory/Passkeys/unified-plan/System/Team Bots 不在本批（P2，依赖服务端）
- e2e 断言 DOM 区序与文案，视觉截图亲验

## Review Focus
- 行序：anchor 顺序 account→appearance→bot→(security 等) 与规格一致
- 文案：新增行 label 逐字
- 迁移无回归：Timezone/AutoReview 从 Agent 区迁到 Bot 区，原有单测/e2e 引用同步更新

## 任务步
1. panels.tsx GeneralSettingsPanel 重排：Agent 组拆散——Timezone+AutoReview 进 Bot 区；Security Key 组移到 Bot 之后
2. Appearance 区补行：Language（picker：System Default+语言表）、Spell check（switch）
3. 新增行：Notification Sound（switch）+ Hardware acceleration（switch+重启提示文案，无真重启动作）+ Network Debugger（按钮 Check Grok Bot's connection，stub 提示）
4. 单测：行序快照（浅 render GeneralSettingsPanel 断言 SettingsGroup title 序列）
5. e2e：b18 spec 断言 DOM anchor/区序+新行文案；回归 b15（settings-view 三区导航）
6. 合并回测+LOG
