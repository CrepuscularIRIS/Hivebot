// Session-level client on top of examples/lib/mux.mjs (T-01).
// Connect flow per packages/api/gateway/tests/operator-connect.host.spec.ts:
// GET /connect?token=…&interactions=… -> Set-Cookie -> 302 ./api/remote.mux.
import { MuxSocket, rpc } from './mux.mjs'

export class DshClient {
  constructor({ baseUrl, cookie, socket }) {
    this.baseUrl = baseUrl
    this.cookie = cookie
    this.socket = socket
  }

  /** HTTP unary call. */
  call(method, args = {}) {
    return rpc(this.baseUrl, this.cookie, method, args)
  }

  /** Open a session/follow stream with live assistant chunks enabled. */
  async follow(sessionId, { assistantStream = true, onFrame } = {}) {
    // Typert wire methods wrap their payload as { request: … }.
    const stream = await this.socket.open('session/follow', {
      request: {
        address: { kind: 'session', sessionId },
        ...(assistantStream ? { assistantStream: true } : {}),
      },
    })
    if (!onFrame) return stream
    for await (const frame of stream) onFrame(frame)
    return stream
  }

  close() {
    this.socket.close()
  }
}

/** Exchange the launch token for an operator cookie and open the mux socket. */
export async function connect({ baseUrl, token, interactions = 'none' }) {
  const res = await fetch(`${baseUrl}/connect?token=${encodeURIComponent(token)}&interactions=${interactions}`, {
    redirect: 'manual',
  })
  if (res.status !== 302 && res.status !== 303) {
    throw new Error(`token exchange failed: HTTP ${res.status}`)
  }
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  if (!cookie) throw new Error('token exchange returned no cookie')
  const socket = new MuxSocket(baseUrl.replace(/^http/, 'ws') + '/api/remote.mux', cookie)
  await socket.ready
  return new DshClient({ baseUrl, cookie, socket })
}
