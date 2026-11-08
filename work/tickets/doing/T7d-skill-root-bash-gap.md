# T7d：bash 写 skill 根漏卡收口（预建目录 + wrapper ro-bind）

> 开单：main 照 queue 7e 行 + T7c 回执 §6 风险 1 转实体 | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T7c 已知缺口——shell-ask 判定 `targets` 落 `.dsh/skills`/`.agents/skills` 出卡，但 **bash 路径不经过 targets**：`cat > .dsh/skills/x/SKILL.md` 零卡写成
> 分支 / 作业目录：feat/T7d @ /tmp/bot-wt/T7d
> claimed：2026-11-06 23:4x（前轮）；2026-11-07 20:3x 续（吸收主线后完工）
> accepted：

## 目标
bot 用 bash 写自己的 skill 根必须失败（挂载点不可写），与 write/edit 出卡同语义。

## 方案（queue 7e 原文）
1. **预建**：工作区建出时 mkdir `.dsh/skills`、`.agents/skills`（两处落点：main mintWorkspace 本机分支；SDK workspace_ensure 远端——远端 mkdir 由 subprocess 已支持，追加两目录）。
2. **ro-bind**：bwrap wrapper 对会话工作区下这两个目录 ro-bind（挂载点不可 rename/rm/写）——wrapper 参数集加 `--ro-skill-root <path>`（或复用现有 --policy 语义？不——独立参数，bwrap-wrap.py 加分支）。
3. 先红：T7c 后 bash `cat > .dsh/skills/x/SKILL.md` 零卡写成（贴原样）。

## 边界
1. 只动：`app/ui/main/m3-meta/orchestrate.ts`（mintWorkspace 预建）、`app/sdk/src/p2sdk/workspace.mjs`（远端预建）、`app/sdk/sandbox/bwrap-wrap.py`（ro-bind 参数）、`app/sdk/src/start.ts`（wrapperArgv 传参）、测试、回执。
2. wrapper 改动守 bwrap-wrap.py 头部测试约定（P5 系列的 --info-fd/挂载序测试不破）。
3. e2e 错开 T11 的窗口。

## 验收
1. 先红原样（本机 e2e：bash cat > skill 根零卡写成）。
2. 修后：同命令退出非零（Read-only file system）；write/edit 出卡不变（T7c 回归）。
3. wrapper 单测（bwrap-wrap.py 的参数解析加 ro-skill-root 分支）。
4. 回归：write-outside/tiers-policy/guard-fs 全绿。

## 产出
- 修改/新建上列文件 + receipts/T7d.md
