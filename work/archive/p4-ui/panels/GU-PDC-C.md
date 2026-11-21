# GU-PDC · 席 C（6.1 Sol）

> 主会话代录：本席运行约束禁止写文件，以下为其回报原文，未经改写。

seat: C
verdict: REVISE
confidence: medium
reverse_take: 最可能失败的是"安装并建好 Bot"被当成"连接器真正可用"；更稳的是补一条真实工具调用与隔离断言，而不是增加界面。
findings:
- [HIGH] /home/lingxufeng/bot/app/ui/tests/e2e/market.spec.ts:126-170 — D5 旅程止于 recipe 含连接器、Bot 非只读，未证明 X 实际出现工具调用和结果、Y 工具表不含该工具，也没有 main tap 的 enabled:false 断言 — 证据：/home/lingxufeng/bot/work/p4-ui/BRIEF.md:48 明确要求这些结果；当前 spec 创建后直接进入 not-bundle 测试 — 建议：补齐该旅程；若转 U-31，必须显式登记 D5 未验，不得由本次 PASS 代替。
复核：已目视全部 19 图；info-pane 第三列/窄窗浮层、市场层级、失效四显示基本成立；原版登录后页面没有运行态截图，不能据此声称像素还原（/home/lingxufeng/bot/work/p1-re/RE-ui-shell.md:218）。
裁定：同意 failNext 追认（仅一次性失败、不发 IPC）及 registry 透传（enabled:false 闸门保留）；本席复跑分类与 M1 单测 51/51 通过，未发现 D9/D11 红线被放宽。
归口：四项可延至 U-31，但须逐条登记为未验：D10b 屏障、#11 分页、D7 直接调用、D8 省略路径；/home/lingxufeng/bot/work/p4-ui/PLAN.md:47 当前"只补 D12"不足以承接，不能用单测替代明确要求的 E2E。
