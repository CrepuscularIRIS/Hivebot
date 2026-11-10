// P2-TEMP：P3 可推翻
// Minimal stdio MCP server for T-03 acceptance ②: newline-delimited JSON-RPC 2.0
// over stdin/stdout, verified by spike against @modelcontextprotocol/client
// 2.2.0 (the SDK dsh-mcp-client uses). Zero dependencies on purpose: the SDK
// server packages are not app/sdk dependencies and T-03 may not touch
// package.json. Exposes exactly one tool `ping` -> "pong".
import { createInterface } from 'node:readline'

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })

const readline = createInterface({ input: process.stdin })
readline.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.id === undefined) return // notification (notifications/initialized)
  switch (msg.method) {
    case 'initialize':
      reply(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'p2sdk-fixture', version: '1.0.0' },
      })
      break
    case 'tools/list':
      reply(msg.id, {
        tools: [
          { name: 'ping', description: 'Replies pong.', inputSchema: { type: 'object', properties: {} } },
        ],
      })
      break
    case 'tools/call':
      reply(msg.id, { content: [{ type: 'text', text: 'pong' }] })
      break
    default:
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `unknown method ${msg.method}` } })
  }
})
