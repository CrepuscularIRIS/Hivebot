# REPORT · P5-53 对照台（§12.7）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-53 @ b964c76（基 677015e），308 文件全在 work/，产品零改动。交付 harness/compare/（fixture+双桩+cdp+views+run+README 8 文件）+ evidence/compare/（10 拼图 / u1-diff 1142 行 28 部位×30 属性 / persona 264 帧 / styles / summary）。一条命令 node run.mjs ~4 分钟全 headless。

## 验收 PASS
16 视图（4 变体×亮暗×两侧）boundary 全 0；U1′ 差异表初版在档；可复跑。

## 关键新事实
1. **R3/S0 已提交的桩复现不了各自归档截图**（不同桩迭代产物）：对照台桩补齐——v3 卡片 ask 需 description+action+target 三字段（只 description → row TypeError）、v1 需 permissionScope/Revision、v1 clientPersistence.read 位置参数
2. 0.78.1 会话面板 boot 不开（须点击侧栏 openAgent）
3. **0.78.1 tool-call 行在桩下静默丢行**（非报错；字段二分无效；R3 原样复现）→ 待 RE 跟进（P5-R10）
4. **0.18 移植树无时间分隔 producer**（renderer 支持该 kind 但无人生成；0.78.1 自动生成）→ 差异表已记，P5-50/55 补
5. 两套 persona 引擎同源（0.78.1 也吃 avatarShape/Color/currentActivity）

## 未完成
v3 thinking 形状未实证（留 RE）；提问场景在 fixture 但两侧不消费（P5-33/56 接入后启用）；市场/设置有拼图未进样式表。R3 遗留 4 server（8877-8880）仍待用户清。
