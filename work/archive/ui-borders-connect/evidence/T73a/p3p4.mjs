// T73a P3+P4：坏连接器的爆炸半径（profile 级 enabled 下）＋关闭/卸载后工具消失
// 只取证不改产品。输出每步一行 JSON。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const { launchRuntime } = await import('/home/lingxufeng/bot/app/sdk/tests/support/runtime.ts')

const MEM_SPEC = '@modelcontextprotocol/server-memory@2.1.1'

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
const summarize = (tag, names) => JSON.stringify({ step: tag, tools: names.length, mem: names.filter((n) => n.includes('memory')).length, bad: names.filter((n) => n.includes('bad')).length })

// 坏 wrapper bundle：command 指向不存在路径——启动必挂（failOnStartupError:true）
const badDir = (home) => {
  const dir = join(home, 'bad-wrapper')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 't73a-bad-wrapper', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }) + '\n')
  writeFileSync(join(dir, 'cordis.patch.yml'), JSON.stringify([{ insert: [{
    id: 'market-mcp-bad', name: 'file:///home/lingxufeng/bot/app/sdk/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js',
    config: { serverName: 'bad-connector', transport: 'stdio', command: '/nonexistent/bad-entry', args: [], env: {}, cwd: '', failOnStartupError: true },
  }] }]) + '\n')
  return dir
}

let rt = await launchRuntime({})
const cwd = `${rt.home}/workspace`
try {
  // 基线场景同 P1：memory enabled:true
  await rt.client.call('pluginManager/installBundle', { spec: MEM_SPEC, options: { enabled: true } })
  const b0 = (await rt.client.call('session/create', { request: { cwd } })).sessionId
  console.log(summarize('P3-baseline-good', await toolNames(rt, b0)))

  // P3：装坏 wrapper（enabled:true）
  const bad = await rt.client.call('pluginManager/installBundle', { spec: badDir(rt.home), options: { enabled: true } })
  console.log(JSON.stringify({ step: 'P3-install-bad', application: bad?.application ?? null, error: bad?.error ?? null }))
  const b1 = (await rt.client.call('session/create', { request: { cwd } })).sessionId
  console.log(summarize('P3-new-bot-with-bad', await toolNames(rt, b1)))
  console.log(summarize('P3-old-bot-b0-next-turn', await toolNames(rt, b0)))

  // P4：关闭 memory（setBundleEnabled false）→ 新 bot / 已有 bot 下一轮
  const off = await rt.client.call('pluginManager/setBundleEnabled', { name: '@p2sdk-market/modelcontextprotocol__server-memory', enabled: false })
  console.log(JSON.stringify({ step: 'P4-setEnabled-false', ok: !(off instanceof Error), error: off?.error ?? null }))
  const b2 = (await rt.client.call('session/create', { request: { cwd } })).sessionId
  console.log(summarize('P4-new-bot-after-off', await toolNames(rt, b2)))
  console.log(summarize('P4-old-bot-b1-next-turn', await toolNames(rt, b1)))
  console.log('EXIT=0')
} catch (e) {
  console.log(JSON.stringify({ step: 'fatal', error: String(e).slice(0, 400) }))
  console.log('EXIT=1')
} finally {
  await rt.stop()
}
