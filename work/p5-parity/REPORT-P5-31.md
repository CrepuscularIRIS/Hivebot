# REPORT · P5-31 审批卡 / 设置适配 L-AP（v3 改范围）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-31 @ ef7bbf0（基 4836bb4），13 文件 +~200/-40，上游 diff=0。定稿 ui/P5-31-final.md。

## 交付（只写覆盖/shim）
①Always allow 完全隐藏：overrides/modules/local-tool-view.tsx 替换 Prompt/Dock 导出，卡只剩 Allow once/Deny once（Always 按钮 DOM 数 0）；Esc=Deny once 保留。**Never 一并隐藏**（派发未点名，理由：无代码执行 renderer 侧 never，coordinator 映射 rejected，点它只等于拒一次——不同意加回只需一行）
②设置 Execution 下拉+团队文案：settings-panels 覆盖整卡不渲染（不做只读展示：renderer 读不到真实档位，写死会显示错误）
③完整命令：shim askText() bash/文件卡显示同 callId 实参全文、request_network 卡 reason 全文；顺带修 displayReason 实为 {en} 对象从未命中的 bug；卡片竖排+token 配色（上游对比度不足）
④D9 断言更新：两钮恰好/命令全文/request_network 回合（Esc 拒，值集 allowed-once×1+rejected×2）；d11-d12 禁区词扫描恢复无剔除+新增设置缺Execution 断言
⑤shim get/set 恒 ask（never 内存态删）

## 测试
红基线（摘覆盖→Always 计数 1 红）；ui 360/360；全量 e2e 61/0（跑在样式修正前 build——**修正后重建受影响 4 spec 7/7 绿**，verifier 请在最终 build 复跑全量）；sdk 未动。

## 交后续
与 P5-55 冲突面：卡壳 inline style（P5-55 改 r24 需 !important 或改本文件）；MODULE_OVERRIDES 两边加行需三方合并。连接器「始终允许」（A7/M1 alwaysAllow）未做——实现时按事件类别加回按钮。用户气泡窄内容竖排=P5-55 版式。
