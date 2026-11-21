# T79d · 设置面收尾（T79 巡检 P1×3+P2×1）

- claimed: 2026-11-16 主 agent（GLM 5.3）· 分支 feat/T79d（worktree /tmp/bot-wt/T79d）
- 来源: queue 18d 行（T79-TOUR P1-3/4/5+P2-1）；经理开单范围在此行

## 范围（四件，只碰设置面）

1. **Connector preferences / Clear 入卡**（P1-3）：设置 General 两行挤在卡外——对 0.78.1 设置卡容器锚（RE-SETTINGS general 区卡结构）入卡
2. **账户卡复制钮同行**（P1-4，PLAN D 行旧账）：复制钮掉到 email 下一行——原版同行（对照 0.78.1 account 卡布局）
3. **Models 图标**（P1-5，PLAN D 旧账）：导航 Models 用齿轮——原版专属图标（icon 名按 0.78.1 settings nav 锚）
4. **暗色 nav hover token**（P2-1）：暗色 hover 底≈选中底（差 2%）——改 `--sand-bg-secondary`（hover 用 6% 档，经理已核原版 6%/8% 分档）

## 边界

- 只碰设置覆盖层（settings-panels.tsx/settings-view.tsx/settings-view-t57.css）+p5-55（暗色 token 行——排在 T79a 合并后防冲突；T79a 已合并则直接）
- 先红：settings spec 断言入卡（容器类内）/同行（rect 同 y 范围）/图标 data-icon-name/token 值
- 锚从 RE-SETTINGS-0.78.1.md + deb0781 产物取，查不到写明降级口径

## 验收

- t79d spec 2p（先红）+settings.spec 回归+亮暗截图 evidence/T79d/（经理亲检）
