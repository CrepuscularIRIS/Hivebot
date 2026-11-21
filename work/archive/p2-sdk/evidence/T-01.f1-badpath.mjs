// 坏路径：连接死后 open()；error 帧先到、消费者后到（queue 路径错误语义）
import wsPkg from '/tmp/bot-wt/T-01.f1/app/sdk/node_modules/ws/index.js'
const { WebSocketServer } = wsPkg
import { MuxError, MuxSocket } from '/tmp/bot-wt/T-01.f1/app/sdk/examples/lib/mux.mjs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const wss = new WebSocketServer({ port: 0 })
let serverSocket
wss.on('connection', (ws) => { serverSocket = ws; ws.on('message', () => {}) })
const { port } = wss.address()
const mux = new MuxSocket(`ws://127.0.0.1:${port}`, 'x=1')
await mux.ready
// 坏路径 A：error 帧先到、消费者后到 → next() 必须从队列抛错（非静默 done）
const s1 = await mux.open('bad-queue-err', {})
await sleep(30)
serverSocket.send(JSON.stringify({ type: 'error', streamId: s1.streamId, error: { code: 'Q' } }))
await sleep(30)
const iter1 = s1[Symbol.asyncIterator]()
const r1 = await Promise.race([iter1.next().then((v) => ({ kind: 'ok', v }), (e) => ({ kind: 'throw', e })), sleep(3000).then(() => ({ kind: 'hang' }))])
console.log('A queue-path error:', r1.kind, r1.e ? `${r1.e.constructor.name}: ${r1.e.message}` : JSON.stringify(r1.v))
// 坏路径 B：服务端断开后 open() → 必须抛错，不得返回死流
serverSocket.close() // server-side close of the only connection
await sleep(100)
let r2
try { await mux.open('bad-after-drop', {}); r2 = 'FAIL: resolved, dead stream returned' } catch (e) { r2 = e instanceof MuxError ? `PASS ${e.constructor.name}: ${e.message}` : `FAIL wrong type: ${e?.constructor?.name}` }
console.log('B open after drop:', r2)
mux.close()
await new Promise((res) => wss.close(() => res()))
const pass = r1.kind === 'throw' && r1.e instanceof MuxError && r2.startsWith('PASS')
console.log(pass ? 'BADPATH PASS' : 'BADPATH FAIL')
process.exit(pass ? 0 : 1)
