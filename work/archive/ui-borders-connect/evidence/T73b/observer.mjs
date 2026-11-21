// T73b 第 0 步 observer：tools/pre-execute 到达时原样落盘 exec.name 与 session header.id。
import { appendFileSync } from 'node:fs'

export const name = 't73b-observer'

export function apply(ctx) {
  try { appendFileSync(process.env.P2SDK_OBS, JSON.stringify({ hooked: true, proto: Object.getOwnPropertyNames(Object.getPrototypeOf(ctx)).slice(0, 50), keys: Object.keys(ctx).slice(0, 50) }) + '\n') } catch (e) { try { appendFileSync(process.env.P2SDK_OBS, 'hooked-err ' + String(e).slice(0, 200) + '\n') } catch { /* ignore */ } }
  ctx.on('tools/pre-execute', (exec, next) => {
    try {
      appendFileSync(process.env.P2SDK_OBS, JSON.stringify({ name: exec.name, sessionId: exec.agent?.session?.header?.id }) + '\n')
    } catch { /* 观察失败不影响链路 */ }
    return next()
  })
}
