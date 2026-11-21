# BRIEF：GitHub 一键安装（Windows 优先）

> 记录：main (GLM 5.3) | 2026-11-11 | 用户原话：

「先跑起来, 我看看效果. windows侧等等都给出github上一键安装的脚本. 不然会很麻烦, 因为start mjs都是没有的」

## 要点（从原话提取）
1. 用户要能在 GitHub 拿到包后**一键安装**，Windows 侧优先（用户主力查看环境之一）。
2. 痛点：现在的公开仓（Hivebot 0.1.0 @ eaf93387，publish-hivebot.sh 排除式同步）clone 下来**装不起来**——用户点名 `start.mjs` 缺失（sdk 启动脚本不在发布产物里），手工拼依赖链太麻烦。
3. 隐含验收：普通用户从 GitHub 仓库/Release 页出发，跑一个脚本（或下载一个安装包）就能用上——不需要读开发文档。

## 待经理任务 A 拆解方向（不预设方案）
- 查 publish-hivebot.sh 发布链现状：什么进仓、什么没进（start.mjs 为何缺）、Release 有没有产物。
- 形态选项：install.ps1/install.sh 源码安装脚本 vs 预构建包（zip/deb/exe）+一键脚本 vs 两者（Windows 预构建、类 Unix 源码脚本）。
- Windows 侧：electron 打包产物如何产出/分发（现在的 win 打包链到哪一步）。
