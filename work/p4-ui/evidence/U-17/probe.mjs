// U-17 验收独立探针（verifier 自写，不复用 builder 测试文件）
// 跑法：node /home/lingxufeng/bot/work/p4-ui/evidence/U-17/probe.mjs
// 验证：P1 指数退避形状 2^n+封顶 / P2 onDead 清 socket（ready 挂起+rpc 结构化+apiCount 0）
//       / P3 首败重试期间 rpc 排队、恢复后放行
import { createServer } from 'node:http'
import wsPkg from 'file:///tmp/bot-wt/U-17/app/ui/node_modules/ws/index.js'
const { WebSocketServer } = wsPkg
import { DshConnection } from 'file:///tmp/bot-wt/U-17/app/ui/out/probe-connect.mjs'

const log = []
const fail = (m) => { console.log(`FAIL ${m}`); process.exitCode = 1 }
let connectAttempts = 0        // /connect 请求次数
let failFirst = 0              // >0 时前 N 次 /connect 回 500
const timestamps = []          // 每次 /connect 时刻
let rpcCalls = 0               // /api/* POST 次数

const server = createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://x')
  if (u.pathname === '/connect') {
    connectAttempts += 1; timestamps.push(Date.now())
    if (connectAttempts <= failFirst) { res.writeHead(500); res.end(); return }
    res.writeHead(302, { 'set-cookie': `dsh-session=p${connectAttempts}; Path=/`, location: './api/remote.mux' }); res.end(); return
  }
  if (u.pathname.startsWith('/api/')) {
    rpcCalls += 1
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const parsed = JSON.parse(body)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ type: 'server-response', rpcId: parsed.rpcId, result: { ok: true, value: { echo: parsed.method } } }))
    })
    return
  }
  res.writeHead(404); res.end()
})
await new Promise((r) => { server.listen(0, '127.0.0.1', r) })
const base = `http://127.0.0.1:${server.address().port}`
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, sock, head) => { wss.handleUpgrade(req, sock, head, () => {}) })

// P1 退避形状：failFirst=3，backoffMs=50 → 间隔应 ~50/100/200（2^n），基数 2000 封顶 80 → ~80
{
  failFirst = 3; timestamps.length = 0; connectAttempts = 0
  const c = new DshConnection({ baseUrl: base, token: 't', interactions: 'answer', backoffMs: 50, backoffMaxMs: 10_000, startTimeoutMs: 5_000 })
  const g = await c.start(); c.stop()
  const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i])
  log.push(`P1a g=${g} attempts=${timestamps.length} gaps=${gaps.join(',')}`)
  if (g !== 1) fail('P1a 首连成功后 generation 应为 1')
  if (timestamps.length !== 4) fail('P1a 应 3 败 1 成共 4 次尝试')
  if (!(gaps[0] >= 45 && gaps[1] >= 90 && gaps[2] >= 180)) fail('P1a 间隔未按 2^n 增长（期望 ≥50/100/200）')
  if (gaps.some((x) => x > 500)) fail('P1a 间隔异常偏大')

  failFirst = 1; timestamps.length = 0; connectAttempts = 0
  const c2 = new DshConnection({ baseUrl: base, token: 't', interactions: 'answer', backoffMs: 2_000, backoffMaxMs: 80, startTimeoutMs: 5_000 })
  await c2.start(); c2.stop()
  const gap = timestamps[1] - timestamps[0]
  log.push(`P1b cap: gap=${gap}ms（未封顶应为 ~2000）`)
  if (!(gap >= 75 && gap <= 400)) fail('P1b backoffMaxMs 封顶未生效')
}

// P2 onDead 清 socket：成功连接 → terminate → ready() 挂起、rpc 结构化超时、apiCount 0、generation 不变
{
  failFirst = 0; connectAttempts = 0
  const c = new DshConnection({ baseUrl: base, token: 't', interactions: 'answer', backoffMs: 3_000, rpcTimeoutMs: 250 })
  const g0 = await c.start()
  const sock = await c.ready()
  let dead = false; sock.onDead(() => { dead = true })
  // 找到服务端 ws 连接并断开（服务端主动断 → 客户端 socket die）
  wss.clients.forEach((ws) => ws.terminate())
  await new Promise((r) => setTimeout(r, 300))
  const early = await Promise.race([c.ready().then(() => 'resolved'), new Promise((r) => setTimeout(() => r('pending'), 300))])
  const rpcRes = await c.rpc('session/list', {})
  log.push(`P2 dead=${dead} earlyReady=${early} gen=${c.currentGeneration} apiCount=${c.apiCount} rpc=${JSON.stringify(rpcRes)}`)
  if (!dead) fail('P2 未观察到 onDead')
  if (early !== 'pending') fail('P2 ready() 在死 socket 间隙返回了柄（未挂起等新代）')
  if (c.currentGeneration !== g0) fail('P2 死亡间隙 generation 被伪造')
  if (c.apiCount !== 0) fail('P2 rpc 超时后 apiCount 应为 0')
  if (rpcRes.ok !== false || rpcRes.error?.code !== 'pbots/unavailable') fail('P2 rpc 超时应返回结构化 pbots/unavailable')
  if (!rpcRes.error?.message.includes('250ms')) fail('P2 错误消息应含超时时长')
  c.stop()
}

// P3 首败重试期 rpc 排队：failFirst=2，rpc 先于 start 发出，重试成功后应放行且只发一次 HTTP
{
  failFirst = 2; connectAttempts = 0; rpcCalls = 0
  const c = new DshConnection({ baseUrl: base, token: 't', interactions: 'answer', backoffMs: 30, backoffMaxMs: 200, startTimeoutMs: 5_000, rpcTimeoutMs: 5_000 })
  const rpcP = c.rpc('session/list', {})
  const g = await c.start()
  const res = await rpcP
  log.push(`P3 g=${g} rpc=${JSON.stringify(res)} apiCount=${c.apiCount} httpRpcCalls=${rpcCalls}`)
  if (res.ok !== true || res.value?.echo !== 'session/list') fail('P3 排队的 rpc 未在恢复后成功放行')
  if (c.apiCount !== 1 || rpcCalls !== 1) fail('P3 rpc 应恰好发出一次')
  c.stop()
}

console.log(log.join('\n'))
console.log(process.exitCode ? 'PROBE FAIL' : 'PROBE PASS')
wss.close(); server.close()
process.exit(process.exitCode ?? 0)
