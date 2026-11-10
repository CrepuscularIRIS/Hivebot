// P2-TEMP：P3 可推翻
// Test-only observer plugin for T-03 acceptance ③: snapshots the remote
// method table the gateway actually dispatches to $P2SDK_HOME/methods.json.
// The web profile assembles no typert-loader, so generated contributions are
// absent and ctx.typert.local is empty; the real table is the gateway's SRC
// claim set — every registered Cordis service whose prototype carries a
// typertRemote binding plus Remote markers. This walks the same
// ctx.reflect.props as the gateway's collectSrcClaims (read inline here to
// avoid resolving @deepseek-ai/dsh-typert-protocol from a test fixture).
// Rewritten on a 500ms interval (unref'd) so late service activations are
// picked up; the tests poll until the table contains their needle.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'p2sdk-methods-snapshot'

const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'
const ORIGINAL = Symbol.for('cordis.original')

function collect(ctx) {
  const endpoints = []
  for (const [serviceKey, definition] of Object.entries(ctx.reflect.props)) {
    if (definition.type !== 'service') continue
    const receiver = ctx.get(serviceKey)
    if (receiver === undefined || receiver === null || typeof receiver !== 'object') continue
    // ctx.get returns Cordis service proxies; the gateway reads the original
    // through its `original` symbol first (originalOf), same here. The
    // typertRemote binding is an own instance property; Remote markers live
    // on the prototype chain.
    const original = receiver[ORIGINAL] ?? receiver
    const binding = original.typertRemote
    if (typeof binding?.namespace !== 'string') continue
    let proto = Object.getPrototypeOf(original)
    const seen = new Set()
    while (proto !== null && proto !== Object.prototype && !seen.has(proto)) {
      seen.add(proto)
      const marker = proto[REMOTE_METHOD_DESCRIPTOR]
      if (Array.isArray(marker?.methods)) {
        for (const m of marker.methods) endpoints.push(`${binding.namespace}/${m.exportName ?? m.method}`)
      }
      proto = Object.getPrototypeOf(proto)
    }
  }
  return [...new Set(endpoints)].sort()
}

export function apply(ctx) {
  const write = () => {
    // T-12: P2SDK_HOME left the dsh env (REVIEW R1); DSH_HOME is canonical.
    const home = process.env.DSH_HOME
    if (!home) return
    const typert = ctx.get('typert')
    const generated = typert?.local?.list?.().map((d) => `${d.namespace}/${d.method}`) ?? []
    const endpoints = [...collect(ctx), ...generated]
    writeFileSync(join(home, 'methods.json'), `${JSON.stringify([...new Set(endpoints)].sort(), null, 1)}\n`)
  }
  write()
  const timer = setInterval(write, 500)
  timer.unref()
  ctx.effect(() => () => clearInterval(timer))
}
