// T73a P1：profile 级 enabled:true 后——已有 bot / 重启 / 新 bot / 勾选 bot 的工具表
// 只取证不改产品。输出每步一行 JSON，末行 EXIT。
const { launchRuntime } = await import('/home/lingxufeng/bot/app/sdk/tests/support/runtime.ts')

const MEM_SPEC = '@modelcontextprotocol/server-memory@2.1.1'
const WRAPPER = '@p2sdk-market/modelcontextprotocol__server-memory'

const toolNames = async (rt, sessionId) => {
  const names = []
  const stream = await rt.client.follow(sessionId, { assistantStream: true })
  const done = (async () => {
    for await (const frame of stream) {
      if (frame.type === 'event' && frame.event?.type === 'request/header') {
        for (const t of frame.event.data.header.tools ?? []) names.push(t.name)
      }
      if (frame.type === 'event' && frame.event?.type === 'turn/end') return
    }
  })()
  await rt.client.call('session/prompt', { request: { requestId: `t73a-${sessionId}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'hi' }] } })
  await done
  stream.cancel()
  return names
}
const memTools = (names) => names.filter((n) => n.includes('memory'))

let rt = await launchRuntime({})
const cwd = `${rt.home}/workspace`
try {
  // A：已有 bot（无连接器）
  const a = (await rt.client.call('session/create', { request: { cwd } })).sessionId
  const toolsA0 = await toolNames(rt, a)
  console.log(JSON.stringify({ step: 'A-baseline', tools: toolsA0.length, mem: memTools(toolsA0).length }))

  // enabled:true 直装（绕过 M1 守卫——探针就在 SDK 层）
  const install = await rt.client.call('pluginManager/installBundle', { spec: MEM_SPEC, options: { enabled: true } })
  console.log(JSON.stringify({ step: 'install-enabled-true', application: install?.application ?? null, error: install?.error ?? null, bundle: install?.bundle ?? install?.target ?? null }))

  // A 热轮：不重启，下一轮 prompt
  const toolsA1 = await toolNames(rt, a)
  console.log(JSON.stringify({ step: 'A-hot-next-turn', tools: toolsA1.length, mem: memTools(toolsA1) }))

  // C：勾了该连接器的新 bot（现行 UI 路径）
  const c = (await rt.client.call('p2temp/session.createWithConnectors', { request: { connectors: [WRAPPER], agentPreset: 'standard', cwd } })).sessionId
  const toolsC = await toolNames(rt, c)
  console.log(JSON.stringify({ step: 'C-with-connector', tools: toolsC.length, mem: memTools(toolsC) }))

  // 重启（同 HOME）→ A 旧 session 能否继续 + 新 bot B（无连接器）
  await rt.stop()
  rt = await launchRuntime({ env: { P2SDK_HOME: rt.home } })
  let toolsA2 = null
  try {
    toolsA2 = await toolNames(rt, a)
    console.log(JSON.stringify({ step: 'A-after-restart', tools: toolsA2.length, mem: memTools(toolsA2) }))
  } catch (e) {
    console.log(JSON.stringify({ step: 'A-after-restart', error: String(e).slice(0, 160) }))
  }
  const b = (await rt.client.call('session/create', { request: { cwd } })).sessionId
  const toolsB = await toolNames(rt, b)
  console.log(JSON.stringify({ step: 'B-new-bot-no-connector-after-restart', tools: toolsB.length, mem: memTools(toolsB) }))
  console.log('EXIT=0')
} catch (e) {
  console.log(JSON.stringify({ step: 'fatal', error: String(e).slice(0, 400) }))
  console.log('EXIT=1')
} finally {
  await rt.stop()
}
