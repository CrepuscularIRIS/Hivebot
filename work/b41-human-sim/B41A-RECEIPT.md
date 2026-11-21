# B41a 回执：superagent 主 bot 自动发现（masterSessionId discovered 链）

## 改动（feat/B41a-master-handshake：5fb43ff6+3b842619，merge 进 main）
- app/superagent/src/app/master-id.ts：resolveMasterId(pin, discovered, stored, fallback) 4 参；readDiscoveredMasterId(dataDir) 读 $dataDir/bots.json mainBotId；watchBotsMeta(dataDir, current, onRepin) fs.watch 变更重钉
- app/superagent/src/app/runtime.ts:107-110：discovered 接线（dataDir ?? PBOTS_DATA_DIR env）；未 pin 时挂 watchBotsMeta
- app/superagent/src/deployment.ts：Config/Machine 加 dataDir 键
- app/ui/tests/e2e/b41a-discovered-master.spec.ts：两段式（overlay 建会话+bots.json 预写→重启带 superagent 不 pin→KV master-id 断言）

## 对照 0.78.1
无对应（0.78.1 单机无多 bot 编排）；此为 DSH/SuperAgent 适配层（B30 ARCHITECTURE.md B31–B33 路径）。

## shortcut
fake overlay 会话无真实 agent 回环（user 消息只到 inbox/spliced 不产 user/message 事件）——trigger 表端到端断言留给真模型 smoke（demo launcher 手验）；e2e 只锁 discovered 命中 KV。

## 验证
- superagent vitest 19/19（b41a 5p 新）；tsc 0 错；build 693KB
- e2e：b41a 11.5s 过+b34 pin 回归 10.3s 过（主线合并后重跑）
