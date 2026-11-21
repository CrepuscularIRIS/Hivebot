# DIAG P5-61 · UI 主题闪烁与还原缺口（Sol 诊断）

> 代录，未经改写。诊断员受运行环境约束未写 DIAG 文件，以下为其最终回报原文。构建 SHA `5930660`（期间 main 前进至 2746c31，本诊断不作为新 HEAD 的验收）。临时 HOME + Xvfb + 软件渲染，未覆盖真实 GPU 路径。

1. 已复现**双向反色闪烁**；未改产品代码。
2. **真实闪烁帧**：`work/p5-parity/evidence/P5-61/flash-evidence.png`（已目检确认是 Grok Bot）——录像 22.033s 保存暗色却出现白色 Starting 封面；24.666s 保存亮色却出现黑色封面。
3. **主根因**：`app/ui/renderer-grok/shim/src/boot-cover.ts:9-22` 封面跟**系统 media** 主题；`shim/src/desktop.ts:46-50` 正文跟**持久化 preference**。两者相反时必然反色——不是 preference 被异步改回。
4. **时序证据**：`evidence/P5-61/assert-traces.log`——61.6ms 正文已暗而白封面 opacity=1；72.3ms 正文已亮而黑封面 opacity=1。封面还会在 token 安装前进入 ready；无内联首帧底色是缺口，但本次未证明它单独造成可见黑闪。
5. **worker 重渲染未复现整树重挂**：191+184 采样中外壳替换=0、主题 style 缺失=0；完成时 section 集合确实变化。脚本 `assert-traces.py` 可重跑；不应据此宣称所有重挂路径均排除。
6. **另一类混色帧**：`overrides/p5-55-layout.css:39,270,288-290` 的 120–150ms 背景过渡——正文先切换，composer、Connect apps、顶部按钮随后渐变；只等 data-theme 会拍到灰白中间态。窗口录像还显示暗色正文右上保留**白色原生控件块**：宿主只跟 nativeTheme，而 shim 的 tone 方法为空实现。
7. **旧 90 行豁免内**：工具/thinking 直渲、审批 dock、折叠选择器差异等；不能等同完整还原。新版 `evidence/compare/u1-appref.tsv` 已把部分旧豁免改为 8 行待签收、20 行未验证；审批位置/留白、高度 252→224px、composer 缺＋/麦克风等仍见 `evidence/P5-41f1/ACCEPTED-DEVIATIONS.md`（签收栏为空）。
8. **90 行外的高可见缺口**：反色封面、混色动效、原生控件白块；原版 r05 的 **Tasks 顶部入口当前未出现**，**Full conversation 入口被 `overrides/modules/sidebar.tsx:49` 主动剥除**。右键真实证据 `context-menu.png`；恢复这些能力不应只补空按钮。
9. **修复拆分建议**：①启动主题统一（boot-cover + shim 初始化，约 2–3 个产品文件，补反向 preference 回归）；②主题过渡与截图稳定条件（1 个 CSS + 定向 spec）；③原生控件主题接线（宿主/bridge，约 2–4 文件）；④Tasks/outline 单列能力缺口——先补真实数据通路，再谈外观还原。
10. 范围与版本记录：`evidence/P5-61/capture-metadata.json`；清理自查无匹配进程。
