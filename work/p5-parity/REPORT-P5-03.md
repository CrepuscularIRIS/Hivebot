# REPORT · P5-03（0c plugin_manager 移除）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-03 @ 1ff7c17（基 a3ccb97），worktree /tmp/bot-wt/P5-03。3 文件 +819：approval.yml（三个 preset 整 config 覆盖块 +398）、guard.mjs（NEVER_TOOLS 名字 NEVER +11）、guard-plugin-manager.test.ts（新 410 行）。

## 机制（G2-r1 纠正出处 + 实证）
① 裸 id 覆盖够不到 preset 嵌套行（applyEntryPatches 只沿数据态 group 递归）——dump-config 双向实证；② 整 config 覆盖 = 上游 Web 编辑器同一机制（按 id 定位整 config 替换）；③ 洞是真的：web 启动恒 provide profileContext → disabled 恒 false，红基线 standard 会话 31 工具含 plugin_manager；④ 弃选禁顶层 plugin-manager 服务行（会砸 dsh-plugin-market 的 inject——本仓 market 包装链依赖）；⑤ launcher fail-loud 不适用（无行缺失场景）。

## 验收 ①-③+drift 全 PASS
① 四 preset 会话工具表不含 plugin_manager（红基线含之=stock 差分）；② 后层 patch 重启用后三 action（list/停 shell-ask/装 bundle）全 isError+原因、asked===0、profiles/web 树与 runtime-patch.yml sha 不变（PLAN 写 $DSH_HOME/profile 实际是 profiles/web）；③ stock 差分同调用产生 approval/request；drift 文本级钉死覆盖块=上游文件仅翻一键，升级即红。

## 自验
sdk 28 files/227 绿（单文件 4/4，TDD 先红）；app/ui 未动不在双包清单。

## 坑（给后续）
1. fake 插件按会话持内存游标：同会话二次 writeScriptCalls 不重置——每 turn 用新会话或一次写全
2. 覆盖块冻结上游内容：升级 dsh-web-app 靠 drift 用例判红刷新（合并硬闸门窗口 ≤ 一次依赖升级）
3. --dump-config 是 patch 层快速证伪工具，preset/profile 类任务先用它对 diff
