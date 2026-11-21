# B41b — glm-5.3-flash 视觉审查走查（UI 打磨轮）

日期：2026-11-19 · 走查人：主 agent（CDP 操作）+ glm-5.3-flash（视觉审查）· goal-e476b297 延续

## 方法
- demo v3（真模型 litellm glm-5.3-flash）CDP 拉起，10 面截图（主对话/回复/设置暗亮/agent 设置/Tasks/New Bot/亮色主界面）
- 每图缩至 800px 喂 glm-5.3-flash 出结构化问题清单（severity/area/desc/expect）
- **每条 P0/P1 逐条 DOM 几何验证**（getBoundingClientRect + computedStyle + 0.78.1 锚对照）再定性

## flash 报告 → 验证结果（12 条 P0/P1 全链验证）

| flash 报告 | 验证 | 结论 |
|---|---|---|
| P0 右栏标题首字母裁切（escription/onfiguration/odel） | 9 个 heading x=973>pane x=960，scrollWidth=clientWidth 无溢出 | **误报**（缩图笔画糊） |
| P0 Tasks 空态遮死对话区 | 10 图截图时序：Tasks 开着故全屏（正常 workspace 覆盖） | **误报**（截图态） |
| P1 消息列与 composer 不对齐（680 vs 648） | transcript 容器 680 含 padding 32 → 内容列 648=composer 648 | **误报**（容器宽≠内容列宽） |
| P1 composer 工具按钮孤悬容器外 | sparkle/附件钮是 composer 内绝对定位原版同构 | **误报** |
| P1 New Bot 弹窗无 scrim | ::backdrop rgba(0,0,0,.32) computedStyle 实测生效 | **误报**（32% 压暗缩图不可见） |
| P1 弹窗内无名称输入框 | input placeholder 'Name your Bot' 在，空态无边框是原版形态 | **误报** |
| P1 亮色切换只完成一半（composer/药丸仍暗） | 07 图截图时序：切 Light 前 New Bot 弹窗叠着 | **误报**（时序） |
| P1 Theme=Follow System vs Language=System Default 措辞不一 | DOM 实锤两处不一致；0.78.1 锚 Ea4oxV=["Follow System"] | **✅ 真 bug 已修** |
| P1 Spell check 开关颜色/位置矛盾 | 后续 DOM 验证（面板重开后）aria-checked 与视觉一致 | 误报（待复核） |
| P1「SetUp a routine」拼写错误 | 源码 agent-settings.tsx:199 'Set up a routine' 正确 | **误报**（缩图认字错） |
| P1 模型名「glm-5.3-flash」与原版命名不符 | 我方真模型即 litellm glm-5.3-flash，如实显示 | **非缺陷**（设计决定） |
| P1 bot 名「New chat」与按钮同名语义混淆 | 0.78.1 新会话默认名同款（原版即规格） | **非缺陷** |
| P2 时间戳英文与中文对话混排 | 0.78.1 英文 UI+中文内容同构 | **非缺陷** |

## 修复
- panels.tsx:170 LANGUAGE_OPTIONS system 标签 'System Default'→'Follow System'（0.78.1 锚 Ea4oxV 逐字）
- b20-language-wiring.spec.ts:40 断言同步
- 回归：b18+b20 e2e 2/2（12.5s）；build 过；demo 重启实测 Language=Follow System ✅

## 方法论沉淀
1. **flash 视觉审查在缩图（800px）上 P1 误报率高**（本批 12 条仅 1 真）——必须 DOM 几何验证后再定性，不能直接开修
2. 容器宽 vs 内容列宽、::backdrop computedStyle、scrollWidth 溢出三件套是裁切/对齐类报告的快速证伪法
3. 截图时序污染（弹窗叠着/面板开着）会批量制造假 P0——采集序列要原子（每面截前清态）
4. 「原版即规格」判定要回 0.78.1 产物锚（en 母表 eager-common）而非记忆

## evidence
- /tmp/hsim/shots/（11 张走查图+12-settings-fixed.png 修复后）
- /tmp/hsim/flash-review.json + flash-r2.json（flash 原始报告）
