# PLAN：UI 边框体系对齐 + Connect 预设（ui-borders-connect）

> 立项：manager (Opus 5.5) 任务 A | 2026-11-11 | 需求 `BRIEF.md` | 规格 `work/grok-0.79.3-re/RE-BORDERS-0.78.1.md`、`RE-CONNECT-PRESETS-0.78.1.md`

## 判断

1. **边框**：REA §5 差异表是拿 recovered `view.css` 静态值比的，没算 `overrides/p5-55-layout.css`（!important 覆盖层）——侧栏头 / 顶栏底线、侧栏底色、气泡玻璃环、typing 气泡其实已对。真实差异集中在三处：结构线还是 1px（侧栏右缘、info pane）、composer 四态（恒定 1px primary、拖拽另画虚线框）、会话区残留 0.18 橄榄色硬编码（hover 动作钮、附件卡、发送状态行）。
2. **验收前提**：.5px 在 DPR=1 下 computed 读回 1px（LEARNINGS 末条），T57 只能 ±1 收。本线所有 e2e 一律 `--force-device-scale-factor=2` 并把「DPR===2」当第一格。
3. **Connect**：原版本地无预设，条目来自 xAI 服务端目录。用户要「打开就像原版」→ 由我们给一份内置目录（能装的 + 原版常见要登录条目标 Needs sign-in）。Q-049 被用户新话取代 → Q-054（不阻塞，默认 A/A/A 施工）。

## 任务索引

| 单 | 内容 | 依赖 | 状态 |
|---|---|---|---|
| T66 | 结构线 hairline：侧栏右缘 .5px、info pane（查锚）、设置 nav 分隔 → tertiary、浮层菜单 / tooltip / popover 实测对齐；已对项加锁 | — | done（2026-11-12 manager 验收 @7e0b2d07，待合并） |
| T67 | composer 四态（.5px secondary → hover/focus primary → drag accent）+ 22/18 双圆角 + 展开不锁高 + 拖拽改外框变色 | — | done（2026-11-12 manager 验收 @06153370，待合并） |
| T68 | 会话区橄榄色硬编码 token 化（hover 动作钮 / 附件卡 / 发送状态行）+ agent 气泡 max-width min(80%,560,−82)；全集无旧色断言 | T66 合并 | done（T68→T68b 2026-11-12 终验，待合并） |
| T69 | Connect 内置「Hivebot picks」目录源：能装的 4~6 个（断网实测）+ 要登录条目 Needs sign-in 无按钮 | T58 合并（同改 market-surface.tsx）；Q-054 默认 | done（2026-11-12 经理终验 T69+T69b @feat/T69=54dd3eda，待合并） |
| T70 | 启动配置拉回条目数据（BRIEF 2026-11-12）：picks.json 带 launch、`{workspace}` 占位、wrapper 查表透传、删两张 Map；行为不变、launch 不经 M1 | T69 合并 | done（2026-11-12 manager 验收 @d912cbbf，待合并） |
| T71 | Connect 去 DSH 字眼：Index sources 收 Installed 底、Couldn't connect + 细节折叠、「Your plugins」→「Installed」（Q-055-1/2/4） | Q-056-1 默认 | done（2026-11-12 复验 @d6f627e1，含 T71b；待合并） |
| T71c | Installed 预览条露字「Installed」（零安装无孤立 0）+ sourcesBtn 无条件追加（错误态也够得到 Index sources） | T71 合并 | done（2026-11-12 经理验收 @53aa65e5，待合并） |
| T72 | Filesystem 撤出 picks 目录（listed:false，启动配置留）（Q-055-5） | — | done（2026-11-12 manager 验收 @1cf325e9，待合并） |
| T73a | 探针：新装连接器怎样对已有 / 新 bot 生效（Q-055-3） | — | done（2026-11-12：定 P1 路） |
| T73b | 用时准入门：bot×连接器「始终允许」存储 + 判定 + RPC/M1（安全单） | — | done（含 T73b2；2026-11-12 终验 @b7906447，待合并） |
| T73c | ConnectorGrant 审批卡 + 设置一键 Clear | T73b | done（终验 2026-11-12 @7274ebed，待合并） |
| T73d | 去「装上等挑选」，已装连接器对全部 bot 生效 | T73a、T73b/c 合并 | 计划 |

## 不做 / 提议（进 queue 提议区）
- mermaid / media 全屏查看器的同色硬编码（非日常面）。
- Connect 页按原版 11 分类分节（「From Grok」「Team picks」+ 分类名）——等 T69 条目落地、用户看过再定。
- 原版 47 张品牌图（Q-054-3=B 才做）。
- 窗口外缘边框（BRIEF 现状观察「窗口外缘无边框」）：Linux 无 titleBarOverlay、原版自绘三钮，REA 未报外缘描边，不开单。
