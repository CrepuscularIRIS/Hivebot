# REPORT · P5-55 0.18→0.78.1 收口

> 主会话代录（builder 写报告被拦），2026-11-03。完整逐行表在 evidence/P5-55/disposition-u1.tsv（1086 行）。

分支 feat/P5-55 @ 32aef12（基 4836bb4），改动全在 overrides/+shim+测试，上游 diff=0。

## 结论
**app 列对 ref 列可行动差异 open=0**（1068 行修 996/豁 72+新口径 18 豁）；剩余 90 行豁免=架构 40/数据 16/空态 12/亚像素 12/计算值等价 10。U2′ 31 行：修 21/等价 2/豁 8。点名 8 项：修 6/等价 1/豁 1。单测 359/359+e2e 62/62；三联 16 视图 0 报错、头像 264/264；visual 基线已重写。

## 关键改动
p5-55-palette.css（gen-tokens.py 色板+XVF 注册 sha256 同原版；**正文保持系统字体——0.78.1 的 XVF 由服务端开关 sand_xvf_typeface 控制默认关，实测 ref 也系统字体**）；p5-55-layout.css（版式按 ref 实测值）；transcript/markers 覆盖（未读线滚动 unreadScrollTop+Copy 兜底）；**shim 根因修：用户消息 send-message→message+role:user**（0.18 把 send-message 判 assistant 侧）；inject-shim 字体拷贝；harness appref+disposition 脚本。

## 两个实测翻案
折叠宽 0.78.1 实测=88（78 是旧 renderer 值，保持 88）；主 bot star 角标同 fixture 下 ref 也不显示（等价）。

## 合并注意（重要）
**P5-31 已并 main**：p5-55-layout.css 的 B8/B9 段按 0.18 按钮顺序（Never·Always·Allow once）用位置选择器定主钮——合并后需复核该段+重写 visual 基线（P5-57 也会改基线）。

## 范围外发现
侧栏悬停预览卡被滚动容器裁半张（low）；图标字体缺失已修（方块→cursor-icons）。
