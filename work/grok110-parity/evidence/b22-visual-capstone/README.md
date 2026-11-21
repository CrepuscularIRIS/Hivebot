# B22 evidence 清单（2026-11-18）

五张 1280x820 主线截图，e2e b22-visual-capstone spec 一次过产物：

| 图 | 覆盖面 | 目检结论 |
|---|---|---|
| b22-general.png | B18 General 区全行 | Account→Appearance(Theme/Language/Spell check)→Bot(Timezone/Auto-review)→Security Key→通知音→硬件加速，区序+行序对齐 0.78.1 GPANE 规格 |
| b22-tasks-island.png | B21 侧栏 Tasks 行 | list-todo icon+Tasks 文案在侧栏底部（plugins 前），无角标（无 needs-you 数据，progress-only 预期内） |
| b22-task-board.png | B21 看板空态 | h1 Tasks+Sort by(Status/Bot)+空态文案逐字（qXAOim 锚） |
| b22-older-history.png | B19 older 状态行 | 滚顶触发 loading 状态行（"Loading earlier messages…"），sentinel 生效 |
| b22-composer.png | composer 常态 | 中文输入态正常，T67 四态框不变 |

对照 0.78.1 RE 锚（harness/out/anchors-RE-UI-LAYOUT/UI-FACES）：布局 token 全 intact（113/115，gone 的 ui-9ekpj0-B 属 1.1.0 删除项）。
