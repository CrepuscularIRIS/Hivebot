// U-32 O4 独立实测：直调 shellChildEnv，fake 凭证值注入 worker env。
import { shellChildEnv, SANDBOXED_CREDENTIAL_KEYS } from './sdk-env.cjs'

const KEYS = [...SANDBOXED_CREDENTIAL_KEYS]
// 注入虚构值（非真实凭证）
for (const k of KEYS) process.env[k] = `vfy-fake-${k}`

const home = '/tmp/vfy-u32/fake-home'
const env = shellChildEnv(home, { PBOTS_DSH_HANDOFF: '/tmp/vfy-u32/handoff' })

let fail = 0
for (const k of KEYS) {
  const absent = env[k] === undefined
  if (!absent) fail++
  console.log(`${absent ? 'PASS' : 'FAIL'} | Electron env 无 ${k}`)
}
const checks = [
  ['HOME 沙箱', env.HOME === home],
  ['XDG_CONFIG_HOME', env.XDG_CONFIG_HOME === `${home}/.config`],
  ['XDG_CACHE_HOME', env.XDG_CACHE_HOME === `${home}/.cache`],
  ['PBOTS_DATA_DIR', env.PBOTS_DATA_DIR === `${home}/data`],
  ['extra 照传', env.PBOTS_DSH_HANDOFF === '/tmp/vfy-u32/handoff'],
  ['PATH 保留(非凭证键不误删)', typeof env.PATH === 'string' && env.PATH.length > 0],
]
for (const [label, ok] of checks) { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}`) }
for (const k of KEYS) {
  const kept = process.env[k] === `vfy-fake-${k}`
  if (!kept) fail++
  console.log(`${kept ? 'PASS' : 'FAIL'} | worker process.env 未删 ${k}`)
}
console.log(`\nfail=${fail}`)
process.exit(fail === 0 ? 0 : 1)
