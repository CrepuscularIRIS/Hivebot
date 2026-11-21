# PLAN · Windows UI 错位 + settings / connectors UI 打磨

> 立项：manager 任务 A，2026-11-11。需求见 `BRIEF.md`。工单顺序以 `work/tickets/queue.md`「UI 质量专项」节为准。

## 1. 立项判断
- 「Windows 错位」形态没取证。先取证再修：T54 在 Win11 VM（1280×800、96 DPI）与 Linux 同屏同尺寸截图 + 元素几何 + 实际命中字体，出对照表。候选原因只能从这张表来。
- 原版自己就有 Windows 分支：`/dev/shm/pbots-re/gb0781/extracted/dist/renderer/assets/index.eager-app-iGTgHP_Q.js` 有 `if(l==='win32')` 的标题栏 / 窗口控件分支，`chunk-general-pane-*.js` 也有 win32 分支。我们没对照过这些分支，很可能是错位的一部分来源 → 列进 REA 派工（`REA-TASK-layout.md` §6）。
- settings / connectors 打磨缺的是**像素规格**，文案 / 流程已有（RE-SETTINGS / RE-CONNECTORS）。原版免登录渲染脚手架现成（`work/p5-parity/harness/grok-r3/`，RE-stub-boot），所以参照图可以拍真的，不靠推。
- 已看到的全局缺陷：暗色 primary 按钮白底白字（`p5-55-palette.css:722` `--sand-text-on-primary: #f5f5f5`；T51 截图、T7b 提议、T30db 单按钮补丁都是它）。一处根治，不逐按钮补 → T56，等 REA §2 给原版用哪个变量。

## 2. 顺序（第一目的 = 复刻完整 Grok Bot）
1. 现在并行：T54 取证（主 agent，VM）‖ REA 布局规格（reverse-engineer agent，`REA-TASK-layout.md`）‖ T51b（T51 返修，收尾已在途的单）。
2. 两份到齐 → 经理任务 A 续：按 T54 对照表 + REA Windows 节写错位修复单（预计按原因类分组：字体栈 / 标题栏窗口控件 / 写死宽高 / 滚动条，一类一单）。
3. 设置 / 市场打磨单挂 REA 规格：T56 按钮调色板 → 设置对话框外壳与行 → 市场行 / 空态 / 表单 → 连接器卡。
4. T49（DSH credentials 桥，后端、安全单）不碰 UI，可与 1 并行；T50（Models 区界面）改为**等 REA 设置行规格**再施工，按原版设置行的样子做。

## 3. 任务索引（2026-11-11 重排，任务 B/C 之后）

| 行 | 工单 | 依赖 | 状态 |
|---|---|---|---|
| W0 | T54 / T54b Windows 取证 | — | done（T54c 第三轮 6 帧像素校验通过：窗口化时自绘头部与 —□× 同排、无错位；可见问题=T60 三处泄漏+VM 装的 0.1.0 旧市场文案；100% 缩放下成立，125%/150% 未测） |
| W1 | Windows 错位修复 | Q-051（用户截图） | 等截图 |
| W2 | titleBarOverlay 配色照原版公式 + 140px 右侧避让核对 | Q-051 若指向标题栏 | 提议 |
| R1 | REA 布局规格 | — | done（`work/grok-0.79.3-re/RE-UI-LAYOUT-0.78.1.md`） |
| P1 | T56 暗色 neutral primary 字色 | R1 §2.2 | done（@ bcfe6247，待合并） |
| P5 | T60 bot 标题吃介绍提示 | — | done（@ d6018d44，待合并） |
| P2 | T57 设置对话框对齐 | T56 | done（T57+T57b @ 442d6be1，待合并）|
| P2c | T57c 分组卡真实 DOM 层 | T57 合并 | done（@ a6c00fa8 待合并） |
| P3 | T58 市场浮层对齐 | T51 合并、T56 | done（T58→T58b→T58c 2026-11-12 终验，待合并） |
| P6 | T59 侧栏折叠钮（复刻缺失） | — | done（@6e98af80，待合并） |
| P7 | T61 Windows 远端 Skills 加载失败排查 | — | 计划 |
| P4 | 连接器卡外观 | R1 §5 | 计划（低） |

## 4. 待用户拍板
- Q-051：Windows 错位截图（阻塞 Windows 专项）。
- Q-050：缩放比例（不阻塞；默认 100% + 150%）。

## 5. 教训
- 取证单两次栽在「回执描述 ≠ 图」：验收时经理必须逐张打开 + 像素统计（全黑 / 重复 md5），不能只看数量。
- 不经读码就接受「我们没做 X」的前提：T55 方向（照原版 win32 分支）在 `main/window.ts` 里早已实现。
