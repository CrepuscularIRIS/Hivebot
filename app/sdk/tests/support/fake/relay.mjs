// T-02 negative control: a whole-turn-buffering relay between the client and
// its mux socket (the 伪流式 anti-pattern). The relay exchanges its own
// operator token, dials the real /api/remote.mux upstream, forwards
// client->upstream frames immediately, and holds every upstream frame until
// the buffered turn ends (turn/end event or upstream close) — so a client
// behind it cannot see chunk 1 while the turn is still open.
import { WebSocket, WebSocketServer } from 'ws'

export async function startBufferingRelay({ baseUrl, token }) {
  const res = await fetch(`${baseUrl}/connect?token=${encodeURIComponent(token)}&interactions=none`, {
    redirect: 'manual',
  })
  if (res.status !== 302 && res.status !== 303) {
    throw new Error(`relay token exchange failed: HTTP ${res.status}`)
  }
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  if (!cookie) throw new Error('relay token exchange returned no cookie')

  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await new Promise((resolve) => wss.once('listening', resolve))
  const url = `ws://127.0.0.1:${wss.address().port}`

  wss.on('connection', (down) => {
    const up = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/api/remote.mux`, { headers: { cookie } })
    const held = []
    let flushed = false
    const flush = () => {
      if (flushed) return
      flushed = true
      for (const frame of held) down.send(frame)
      held.length = 0
    }
    up.on('message', (data) => {
      const text = String(data)
      if (flushed) {
        down.send(text)
        return
      }
      held.push(text)
      let value = null
      try {
        value = JSON.parse(text).value
      } catch {
        return
      }
      if (value?.type === 'event' && value.event?.type === 'turn/end') flush()
    })
    up.on('close', () => {
      flush()
      down.close()
    })
    up.on('error', () => {})
    down.on('message', (data) => {
      if (up.readyState === WebSocket.OPEN) up.send(String(data))
    })
    down.on('error', () => {})
  })

  return {
    url,
    cookie,
    close() {
      for (const socket of wss.clients) socket.terminate()
      wss.close()
    },
  }
}
