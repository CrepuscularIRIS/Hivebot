# SuperAgent 落地运行手册（B31–B36）

架构总览见 [ARCHITECTURE.md](./ARCHITECTURE.md)（B30 产出：能力映射+主副 bot 语义模型）。本手册是实施侧的运行文档——bundle 怎么进 dsh runtime、panel 怎么开、主 bot 怎么钉定、真模型验收怎么跑。

## 1. 落地链总览（B31–B35 已完成）

| 批 | 内容 | 证据 |
|---|---|---|
| B31 | 主 bot 路由：`@Bot 名 任务`→改投 worker 会话（shim sendPrompt 内路由，localStorage `pbots.shim.superagent-router` 开关） | e2e b31-superagent-router（4.8s） |
| B32 | 引擎搬运：dsh-superagent-prototype → `app/superagent/`（masterSessionId 配置/local Source/local channel） | superagent 12 tests + typecheck |
| B33 | bundle 进 runtime：patch yml 叠 P2SDK_PATCH 冒号→dsh --patch 激活；skills/ 随包 | e2e b33-superagent-runtime（5.5s） |
| B34 | masterSessionId 真接线：主 bot 会话 user/message→watchLocalSession→engine intake | e2e b34-master-session（7.6s） |
| B35 | engine 完整循环（引擎级）：receive→decide(accept)→ticket→executor.start | tests/b35-engine-loop.spec.ts 2p |

## 2. bundle 构建与激活

```bash
cd app/superagent
pnpm install && pnpm run build          # lib/index.js（~690KB ESM）
```

激活 = 把 insert patch 叠进 dsh runtime。单 patch 文件形状：

```yaml
- insert:
    - id: dsh-superagent
      name: 'file:///绝对路径/app/superagent/lib/index.js'
      config:
        stateDir: '/绝对路径/状态目录'
        masterSessionId: '主bot会话id'   # 留空=不监听 UI（orchestrator 模式）
```

e2e/rig 里通过 `P2SDK_PATCH` 环境变量冒号叠加：`"${fakeOverlayPath()}:${saPatch}"`（app/sdk/src/start.ts:82 extraPatches）。

**注意**：skills/ 目录必须随包（packaged() 运行时校验 `skills/dsh-superagent-feishu/SKILL.md` 等存在，B33 踩过）。

## 3. web panel（运营面）

bundle 激活后 registerHttp 挂 loopback 管理路由（app/superagent/src/app/http.ts），同源强制。路由树：overview / tickets / ticket/:id / decisions / threads / thread/:id / settings / sources / uptime。访问方式：dsh webserver 域下 `/panel/` 前缀（原型 README §panel）。

## 4. 主 bot 钉定（masterSessionId）

- 配置项在 patch config（B32 Task 2）：`masterSessionId` 优先于 KV 存储，pin 后不回写。
- 接线点 runtime.ts:165：`watchLocalSession(ctx,{sessionId:masterId, receive:trigger=>passes.receive(trigger)})`——主 bot 会话的每条用户消息变成 local Trigger 进 engine。
- UI 侧主 bot标识：shim `window.pbotsUi.setMain(sessionId)`（B31 e2e 用法）。

## 5. 真模型验收清单（B36 候选，需真 LLM 环境）

1. **assessor 链**：主 bot 会话发任务 → candidate 卡片 deliver 回主会话 → 主会话 LLM 调用 decide 工具 accept → ticket 建立。mock overlay 下止步于 intake（无 LLM 决策）。
2. **worker 会话可见**：accept 后 executor 起 `worker-<ticketId>` 持久会话——UI sidebar 应出现该会话（shim Workers 分组 T36 已在位，origin==='subagent' 判定）。
3. **回写正文**：worker turnEnded → engine.report(completed) → outbox reply → local channel 注入主会话（B32 sendLocal 已做，未在真 LLM 下验证）。
4. **panel 数据**：/panel/tickets 应列出 ticket；/panel/overview 显 uptime。

## 6. 已知边界（shortcut 标注）

- B31 路由是文本级（MENTION 正则+标题匹配），非 0.78.1 语义路由；full work-item lifecycle 由 B32 引擎接管（task-board.ts 头注 shortcut）。
- envelope 命名分裂：dsh gateway session/create 要 `{request:{}}`、session/list 要 `{_request:{}}`——跨端点 RPC 时逐个核对（B34 坑）。
- masterSessionId 未配时 bundle 不监听 UI（orchestrator 模式）——这是默认。
