# B18: General 区行序对齐（0.78.1）

## 用户需求
按 REQ-1.1.0-PARITY.md 候选批次：General 区行序对齐（来源 0.78.1 规格 RE-SETTINGS §4a/b）。

## 0.78.1 行序实底（2026-11-18 从 GPANE chunk-general-pane-YXy_8X5a.js 渲染序挤出，非猜测）

Ki 主组件 children 渲染序（区级顺序）：
1. unified upsell 横幅（条件渲染，redirect-to-unified-plans 实验存在时）
2. Account（Cursor 账号卡三态）
3. unified-plan 卡（条件）
4. Appearance 区（wr 组件）：theme / accent / language anchors
5. Passkeys 区（Ar 组件）
6. unified-plan + Open Threads Beside the Main Chat（Si 组件）
7. System 区（ni 组件）：connectors allow-all + Microsoft Teams link
8. Bot 区（_r 组件）：Bot color（Light/Dark/Black）+ spell-check；Language/Search language 也在 _r（含 Follow System/Light/Dark/Black 主题选项 i18n）
9. Import + Notification 区（Or 组件）：Import memory（Copy prompt→Paste→Add to Memory）+ Play Sound for Notifications
10. Security Key + Microphone + Hardware accel + Network Debugger（Ur 组件：Security Key 行 → Microphone 行 → Use hardware acceleration + Restart Now → Check Grok Bot's connection/Network Debugger）
11. Team Bots 区（yi 组件）：connector preferences（Search/Add/Allow all/Clear）+ Slack link + Link previews
12. Security Key 复本（zr，与 Ur 同款）

## 行序细目（区内，按组件内 id 出现序）
- Appearance(wr)：Theme（Follow System/Light/Dark）→ Accent → Language
- Bot(_r)：Language（Search language）/Bot color（Light/Dark/Black）/spell-check——注意 _r 也含 timezone anchor（48680）与 Follow System，待核
- System(ni)：Allow all connectors? + MS Teams link
- Ur：Security Key → Microphone → Hardware acceleration（+Restart Now）→ Network Debugger（Check Grok Bot's connection）
- Or：Import memory → Play Sound for Notifications
- Passkeys(Ar)：Added/Couldn't remove/Remove this passkey?
- Si：Open Threads Beside the Main Chat + unified-plan

## 待核项
- _r 内 timezone anchor 位置（48680 timezone 在 bot 49224 前，同组件）
- Timezone 行到底在 Bot 区还是独立：anchor 序 timezone→bot→spell-check 同组件 _r
- accent 行控件（theme/accent/language anchors 在 wr，accent 是主题强调色？）
- auto-review anchor 在 36016（另一组件，区序位置待定——Ki children 里没有直接对应名，可能在 wr 或独立）
- zr 与 Ur 同款 security-keys（渲染两份？）

## 验收口径
- e2e：设置 General 区 DOM 断言行序（section/anchor 顺序 + 行文案）
- 对照产物：work/grok-1.1.0-re/gb0781/extracted/dist/renderer/assets/chunk-general-pane-YXy_8X5a.js

## 修正后行序实锤（2026-11-18 二轮挤出，组件级证据）

wr=Appearance 区（Zt anchorId:appearance children [M,N,I,R]）：
1. M=Theme 行（X anchorId:theme variant:card + picker L：Follow System/Light/Dark，xr 表）
2. N=Accent 行（条件 flags: sand_enable_accent_theming || grok_bot_all_bots_color_theming；Sr 表 {black, bot-color}）
3. I=Language 行（X anchorId:language + br=Language picker：Follow System+yr() 语言列表；**Bot color(p7v5PZ) 是 Language picker 的选项维度**（Sr={black:THokF3, bot-color:p7v5PZ}），非独立行）
4. R=Cr=Spell check 行（X anchorId:spell-check + Ze switch）

_r=Bot 区（Zt anchorId:bot children [pr, Fn-条件]）：
1. pr=Timezone 行（X anchorId:timezone variant:card + tr picker：Auto-detect/搜索/时区表；hr 组件渲染）
2. Fn=Auto-review rules（In→Xt('auto-review-rules')+zn 规则表；**flag sand_permissions_panel 开启时为 null**（独立 Permissions 区接管），关闭时显示在 Bot 区）

Ur=安全/系统行组（Security Key → Microphone → Hardware acceleration → Network Debugger）：
- Security Key 行（0qyGnO/X VUEkDl switch rmVuan/TmxDiI 平台文案）
- Microphone 行（1iY5xv）
- Hardware acceleration 行（gkVAUt + jZlVjK 重启提示 + u6QeR6 Restart Now + MVyXqf 失败文案；9YHrNC System Default）
- Network Debugger 行（QVjG8n + vhgAB7 Check Grok Bot's connection）

Or=Import/通知组：Import memory（aYUunS 复制 prompt→VVno4E 粘贴→eyN5TV Add to Memory→l3s5ri/odeIN7 Start Import→9A+Hw8 空态）→ Play Sound for Notifications（6EhUT7 switch）

Ki 渲染序（区级）：upsell(条件) → account → unified-plan 卡(条件 Ti/Ci) → appearance(wr) → Passkeys(Ar) → Si(unified-plan+Open Threads zpafJ7/oQJQPF) → system(ni) → bot(_r) → Or(import+notification) → Ur(security/mic/hw/netdbg) → yi(team-bots) → zr(Security Key 复本)

auto-review anchor(36016) 在 zn 规则表组件内（Bot 区第 2 行展开），非独立区。

## 我们现状 vs 规格
- 现有：Account / Appearance(仅 Theme) / Agent(Timezone+LocalToolPermission+AutoReview) / Security Key
- 规格差异：
  1. Appearance 区应含 Theme+Accent(条件)+Language+Spell check（我们只有 Theme）
  2. Timezone+Auto-review 应在 Bot 区（我们现在在 Agent 区）
  3. 缺行：Language、Spell check、Accent、Microphone、Hardware acceleration、Network Debugger、Notification Sound、Import memory、Passkeys、Open Threads、unified-plan、System(connectors/MS Teams)、Team Bots 区
  4. Security Key 位置应在 Ur 组（倒数第二）
  5. LocalToolPermission（Execution on Local Computer）是 0.79.3 permissions flag 的行，0.78.1 General 无——位置需按 flag 决定（flag 开→不在 General）

## 复刻策略（最小批）
按用户「用户主导」原则，行序对齐批只做**重排+补行**：
- P1（本批）：重排现有行到规格区序（Account→Appearance[Theme+新增 Language+Spell check]→Bot[Timezone+AutoReview 迁入]→Security Key 组[+Microphone/Hardware accel/Network Debugger stub]→Notification）+ 新增行文案逐字
- P2（后续）：Passkeys/unified-plan/System/Team Bots/import memory——依赖服务端面，单独立项
