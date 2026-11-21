# BRIEF · Windows UI 错位修复 + settings/connectors UI 打磨（REA 驱动）

## 用户原话（2026-11-11）

> 目前的UI问题还是很大, 比如Windows里面显示UI错位一系列问题. 这块可以修复一下吗? 还有很多Grok Bot的功能, 比如settings, connector的UI之类的一系列的问题. REA后继续打磨.

## 背景与顺序

- 用户定调：**第一目的=复刻完整 Grok Bot**；本批=UI 质量专项（Windows 实机错位 + settings/connectors 面）。
- 推进方式：先 REA 拿原版 UI 规格（布局/间距/字号/控件形态），再对照修——「REA后继续打磨」。
- 关联在途：T51（feat/T51 分支，市场死路→Index sources）施工完待验收；T48 探针四格截图= settings/connectors 现状基线；REA 已有 RE-SETTINGS-0.78.1.md / RE-CONNECTORS-0.78.1.md（文案与流程规格，**布局像素规格未提取**——本批 REA 的增量点）。

## 已知线索

### Windows UI 错位（复现环境现成）
- **Win11 VM 活着**：qemu（~/vm-store/run/qemu.pid）+ VM 内 Hivebot 0.1.0（Session 2，schtasks hbtest）；宿主→VM ssh 免密（`ssh -i ~/.ssh/hivebot_vm_key -p 2222 hivebot@127.0.0.1`）；VNC 截屏 `vncdo -s :5 capture`。
- 「错位一系列」具体形态未取证——立项第一步应在 VM 内逐屏截图取证（主界面/市场/settings/onboarding/新建 bot 对话框），对照 Linux 同屏找 Windows 特有差异。
- 候选根因方向（待证据裁决）：Windows 字体度量（Segoe UI vs 测试侧默认字体）撑破固定宽高、DPI 缩放、自绘 titlebar 控件位、滚动条占位差异、Electron Windows 平台分支样式。

### settings / connectors UI（现状已钉，目标=原版）
- settings：只剩 General（Account/Appearance/Agent 三组），无 API key/Router 面；原版七区（REA RE-SETTINGS §A）。
- connectors：T51 后市场有 Index sources 管理（未合并）；onboarding Connect 步恒灰；Q-047 的 key 卡（T49/T50 方向=抄 DSH dsh-credentials）待开工。
- 打磨基准：0.78.1 产物（~/Downloads/grok-bot_0.78.1_amd64.deb；解包在 /dev/shm/pbots-re/gb0781/，REA 可复用）+ work/grok-0.79.3-re/ 既有提取。

## 要求

1. REA 增量：提取原版 **UI 布局规格**（settings 七区/市场/连接器卡的间距、字号、控件形态、暗色值——CSS 级锚点），产出可直接对照修的规格文档。
2. 立项拆单：Windows 错位取证单先行（VM 截图矩阵）→ 错位修复单；settings/connectors 打磨单挂 REA 规格。
3. 要用户拍板的进 QUESTIONS.md。
