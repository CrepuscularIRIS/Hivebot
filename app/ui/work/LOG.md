## 2026-11-08 · merge T36（T36+T36b 两轮复验通过）+ 生产旁证 6
- feat/T36 @0ada98d0 → 主线（--no-ff）；m3 双拒分支共存确认（:124 helper/:130 worker）
- 合并后回测：ui grok-shim+m3 **306 passed**；sdk 八件 **115 passed**；p6-workers e2e **2 passed**
- T37b 复验通过同批挪 done；流程偏差裁定记档（第二次未验先并——以后只并 done/ 的单）
- 生产旁证（重启实例 ready@39775，回合中不重启）：
  - 主 bot 调 subagent → `started subagent 2433bf84…`；helper 数 2→3
  - **label=「统计工作区txt文件数量」**（主 bot 起的 description 中文原样）running=true（进行中即可见）
  - 其他 bot 的 helper 1 个（Write hello.txt）——shim 过滤 parent!==mainBotId 不显示 ✓
  - 截图未截（API 旁证齐：label/parent 判别/回合中可见/他人不显四要素；用户可在侧栏亲验 Workers 分组）
- queue 新提议：setMain 与在飞 roster 拉取竞态（T36 前既有，低优先）
