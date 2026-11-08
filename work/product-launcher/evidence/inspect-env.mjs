// 连 Electron 主进程 Node inspector，取 process.env 里关心的键名是否存在（不取值）。
const port = process.argv[2]
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const ws = new WebSocket(list[0].webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const expr = `JSON.stringify(Object.fromEntries(${JSON.stringify(['PBOTS_DSH_HANDOFF', 'PBOTS_DATA_DIR', 'P2SDK_LLM_API_KEY', 'LITELLM_MASTER_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'])}.map(k => [k, k in process.env])))`
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr } }))
const msg = await new Promise((r) => { ws.onmessage = (e) => r(JSON.parse(e.data)) })
console.log('electron-main process.env:', msg.result?.result?.value ?? JSON.stringify(msg))
ws.close()
