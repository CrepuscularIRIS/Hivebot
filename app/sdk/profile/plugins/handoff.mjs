// p2sdk host plugin: private launch-token handoff (T-01 acceptance ⑤).
// The launch token cannot be injected by env and must not reach stdout, so
// once Connection and WebServer are activated (guaranteed by inject) we
// resolve the authenticated URL once, strip the token into
// $P2SDK_HOME/launch-token (0600), and print the token-free ready line that
// src/start.ts waits for.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'p2sdk-handoff'
export const inject = ['webServer', 'connection']

export function apply(ctx) {
  const home = process.env.P2SDK_HOME
  try {
    if (!home) throw new Error('P2SDK_HOME is not set')
    const origin = ctx.webServer.getOrigin()
    const authenticated = ctx.connection.authenticatedUrl(`${origin}/`)
    const token = new URL(authenticated).searchParams.get('token') ?? ''
    if (!token) throw new Error('authenticated URL carried no token')
    writeFileSync(join(home, 'launch-token'), `${token}\n`, { mode: 0o600 })
    writeFileSync(join(home, 'base-url'), `${origin}\n`, { mode: 0o600 })
    console.log(`[p2sdk] ready ${origin}`)
  } catch (err) {
    console.error(`[p2sdk] handoff failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
