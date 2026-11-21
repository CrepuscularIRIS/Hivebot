# BRIEF：UI 边框体系对齐 + Connect 预设

> 记录：main (GLM 5.3) | 2026-11-11 | 用户原话：

「这个UI的边框等等, 和原版的Grok Bot还是不太一样. 然后COnnect应该和一些Grok Bot的预设是差不多的. REA继续去看看」

## 要点
1. 用户在桌面看了 real 演示实例（/tmp/hivebot-demo），**边框等**与原版 Grok Bot 仍有差距（T57 线只对了设置对话框内部；用户观感指向更广的面：窗口边、面板描边、卡片边、分隔线……具体哪些面由 REA 系统性枚举）。
2. **Connect apps 应带原版式预设**——原版的 Connect/Integrations 入口有预置条目（app 目录），不是空市场。
3. 用户明确指示：**REA 继续**（用 0.78.1 产物查证，不猜）。

## 现状观察（2026-11-11 演示实例截图，/tmp/hivebot-demo/shot{2,3}.png）
- **边框现状**：整体「无边框扁平感」——窗口外缘无边框；侧栏与主区之间仅 1 条 1px 深灰垂直分隔线；顶部与内容之间无水平分隔线；composer 有细浅灰描边大圆角长条；弹窗靠背景色差+圆角分层、无描边无阴影。
- **Connect 现状**：面板打开即「No catalog configured」全空态（居中标题+描述+Add index source 白底按钮）——目录完全没配，**没有预置条目**。用户预期：原版有预置 app 目录。

## 2026-11-12（Connect 启动配置的形态拉直）

> 「我记得本来这个sdk不是这么配置的. 而是每一个bot好像不一样,会和REA一样去初始化. 怎么搞到后面都不一样了?」
> 「目标肯定是之前的原版Grok Bot+部分DSH的适配. 而不是所有都适配.」

背景：T69b 后盘点发现 wrapper.mjs 里两张 JS Map（REQUIRED_ARGS U-25 既有 + PACKAGE_ENV T69b 新加）把每个包的启动 args/env 取值硬编码在生成器代码里——原生范式是每个 bot 一份声明式配置（dsh patch yml / 原版 variableFields 条目数据 / REA MCP 注册），差异在数据不在代码。用户定调：产品形态一律以原版 Grok Bot 为规格，DSH 只做必要的底层适配，不做全量 DSH 化。

## 2026-11-12（主 bot=DSH Superagent 的产品结构定调）

> 「底层不是和之前我记得差不多, 比如说grok bot是默认一开始就是一个主bot, 这个我们理解为DSH Superagent, 一上来就命名. 然后剩下的创建就只能创建dsh的部分」

产品结构：主 bot 开箱即有（原版 Grok Bot 形态）= DSH Superagent，首启引导命名；其余 bot 创建走 DSH（Superagent 之下的部分）。待 Connect 主线收尾后立项核对现状（bots.json 已有 mainBotId 概念——T34 播种见过 mainBotId）。

## 2026-11-12（UI 系统性修复——用户直接反馈）

> 「目前的这个UI问题还是很大, 建议交给Opus全部系统性质的修复一下. 包括里面的选项反馈, 里面很多的字体大小, 没有居中等等一系列问题」

用户看了当前 UI 后的直接反馈：系统性问题——选项反馈、字体大小、居中等一系列。要求 Opus（经理）主持全面系统性修复（不是零敲碎打的单点修）。修复以原版 0.78.1 为规格锚。
