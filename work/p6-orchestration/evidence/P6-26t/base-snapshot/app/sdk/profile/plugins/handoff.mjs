// p2sdk host plugin: private launch-token handoff (T-01 acceptance ⑤).
// The launch token cannot be injected by env and must not reach stdout, so
// once Connection and WebServer are activated (guaranteed by inject) we
// resolve the authenticated URL once, strip the token into the operator-side
// handoff dir (0600), and print the token-free ready line that src/start.ts
// waits for.
// T-01.f3 R1: the handoff dir comes from the plugin config (generated
// runtime-patch.yml), never from the dsh environment — a model-driven shell
// inside the runtime cannot discover the credential path via printenv.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'p2sdk-handoff'
export const inject = ['webServer', 'connection']

export function apply(ctx, config = {}) {
  const dir = config.dir
  try {
    if (typeof dir !== 'string' || dir.length === 0) throw new Error('handoff config.dir is not set')
    const origin = ctx.webServer.getOrigin()
    const authenticated = ctx.connection.authenticatedUrl(`${origin}/`)
    const token = new URL(authenticated).searchParams.get('token') ?? ''
    if (!token) throw new Error('authenticated URL carried no token')
    writeFileSync(join(dir, 'launch-token'), `${token}\n`, { mode: 0o600 })
    writeFileSync(join(dir, 'base-url'), `${origin}\n`, { mode: 0o600 })
    console.log(`[p2sdk] ready ${origin}`)
  } catch (err) {
    console.error(`[p2sdk] handoff failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
