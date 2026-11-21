// Fake phone for the DS Bot phone link. Mode A: pair (with dsbot://pair?... uri). Mode B: reconnect (host key + host id args).
import { RelayTransport, SecureTransport, RpcClient, generateKeyPair, deviceIdFor, randomToken } from '/tmp/dsbot-src/link/src/index.ts'
import { readFileSync, writeFileSync } from 'node:fs'

const IDENTITY_FILE = '/tmp/fake-phone/phone-identity.json'
const loadIdentity = () => { try { return JSON.parse(readFileSync(IDENTITY_FILE, 'utf8')) } catch { return null } }
const saveIdentity = (id) => writeFileSync(IDENTITY_FILE, JSON.stringify(id))
let identity = loadIdentity()
if (!identity) {
  const keys = generateKeyPair()
  identity = { deviceId: deviceIdFor(keys.publicKey), ...keys }
  saveIdentity(identity)
}
if (!identity.accessToken) { identity.accessToken = randomToken(); saveIdentity(identity) }

const mode = process.argv[2]
let server, hostDeviceId, hostKey, hello
if (mode === 'pair') {
  const u = new URL(process.argv[3])
  server = u.searchParams.get('server'); hostDeviceId = u.searchParams.get('host'); hostKey = u.searchParams.get('key')
  hello = { name: 'Fake Phone', pairingCode: u.searchParams.get('code') }
  saveIdentity({ ...identity }) // freeze identity+token before pairing handshake
} else {
  hostKey = process.argv[3]; hostDeviceId = process.argv[4]; server = process.argv[5] || 'ws://127.0.0.1:8791/v1/link'
  hello = { name: 'Fake Phone' }
}

const relay = new RelayTransport(server, { deviceId: identity.deviceId, identityKey: identity.publicKey, accessToken: identity.accessToken, targetDeviceId: hostDeviceId, capabilities: ['transport.relay'] })
const secure = new SecureTransport(relay, identity, { deviceId: hostDeviceId, identityKey: hostKey }, { hello })
const rpc = new RpcClient(secure, 30000)
const events = []
rpc.onEvent(e => events.push(e))
await rpc.connect()
console.log('[phone] connected, mode =', mode)

const state = await rpc.rpc('bot', { endpoint: 'state', state: {} })
const v = state?.value ?? state
console.log('[phone] state ok:', state?.ok, 'revision', v?.revision, 'bots', (v?.bots ?? []).map(b => b.name))

if (mode === 'send') {
  const state1 = await rpc.rpc('bot', { endpoint: 'state', state: {} })
  const v1 = state1?.value ?? state1
  const chief = v1?.mainBotId
  const chiefBot = (v1?.bots ?? []).find(b => b.id === chief || b.name === 'Chief')
  console.log('[phone] sending to', chief)
  const send = await rpc.rpc('bot', { endpoint: 'send', payload: { text: 'Reply with exactly: PHONE LINK OK', sessionId: chief }, state: {} })
  console.log('[phone] send ok:', send?.ok, send?.ok ? '' : JSON.stringify(send?.error ?? {}).slice(0, 200))
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000))
    const page = await rpc.rpc('bot', { endpoint: 'chat', payload: { botId: chiefBot?.id ?? chief } }).catch(e => ({ err: String(e) }))
    const text = JSON.stringify(page)
    if (text.includes('PHONE LINK OK')) { console.log('[phone] CHAT REPLY PASS'); process.exit(0) }
    process.stdout.write('.')
  }
  console.log('\n[phone] reply timeout; events:', events.length)
  process.exit(1)
}
console.log('[phone] PASS')
process.exit(0)
