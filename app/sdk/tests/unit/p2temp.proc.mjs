// T-11②: src/p2temp unit assertions, executed in a plain `node` subprocess.
// Why a subprocess: vitest's v8 coverage merges same-URL script coverage, and
// a file measured in both vite-transformed (worker) and raw (subprocess)
// coordinates loses ranges in the merge. src/p2temp runs raw inside dsh, so
// its unit assertions run raw here too (NODE_V8_COVERAGE is inherited from
// the vitest worker when coverage is on, so this process reports into the
// same merged report); src/start.ts stays worker-side instead.
// Prints one JSON array of per-case results; exits non-zero if any failed.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import P2TempService, { basePresetRows, normalizeConnectors, readConnectorRows } from '../../src/p2temp/index.mjs'

const results = []
const case_ = async (name, fn) => {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: `${error?.message ?? error}` })
  }
}

/** Minimal cordis stand-in: Service only needs ctx.reflect.provide. */
function fakeCtx(profileDir, over = {}) {
  const calls = { registered: [], created: [] }
  const ctx = {
    reflect: { provide() {} },
    get: (key) => (over.get ? over.get(key) : key === 'profileContext' ? { dir: profileDir } : undefined),
    agentPresets: {
      definitions: new Map([['standard', { config: { plugins: [{ id: 'persona' }] } }]]),
      register: async (preset) => { calls.registered.push(preset) },
    },
    sessionController: {
      create: async (args) => { calls.created.push(args); return { sessionId: `sid-${calls.created.length}` } },
    },
  }
  return { ctx, calls }
}

function fixture(name, manifest, patch) {
  const profile = mkdtempSync(join(tmpdir(), 'p2temp-unit-'))
  const dir = join(profile, 'node_modules', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  if (patch !== undefined) writeFileSync(join(dir, 'cordis.patch.yml'), patch)
  return profile
}

const okProfile = fixture(
  '@p2sdk-fixture/demo',
  { dsh: { bundle: { patch: './cordis.patch.yml' } } },
  JSON.stringify([{ insert: [{ id: 'x' }] }]),
)

await case_('normalizeConnectors accepts a non-empty string array and returns it', () => {
  assert.deepEqual(normalizeConnectors(['a']), ['a'])
  assert.deepEqual(normalizeConnectors(['a', 'b']), ['a', 'b'])
})

await case_('normalizeConnectors rejects non-arrays, empty arrays, and non-string members', () => {
  for (const bad of [undefined, null, 'a', [], ['a', 1], [''], ['a', '  ']]) {
    assert.throws(() => normalizeConnectors(bad), /connectors must be a non-empty array/)
  }
})

await case_('readConnectorRows returns the insert rows of an installed JSON-patch bundle', async () => {
  assert.deepEqual(await readConnectorRows(okProfile, '@p2sdk-fixture/demo'), [{ id: 'x' }])
})

await case_('readConnectorRows rejects uninstalled connectors / manifests without dsh.bundle.patch / non-JSON patches / empty patches', async () => {
  await assert.rejects(
    () => readConnectorRows(mkdtempSync(join(tmpdir(), 'p2temp-unit-')), '@nope/missing'),
    /is not installed under the profile/,
  )
  await assert.rejects(
    () => readConnectorRows(fixture('plain', { name: 'plain' }), 'plain'),
    /declares no dsh\.bundle\.patch/,
  )
  await assert.rejects(
    () => readConnectorRows(
      fixture('@p2sdk-fixture/yaml', { dsh: { bundle: { patch: './cordis.patch.yml' } } }, '- insert:\n  - id: yaml-only\n'),
      '@p2sdk-fixture/yaml',
    ),
    /patch is not JSON \(T-03 scope\)/,
  )
  await assert.rejects(
    () => readConnectorRows(
      fixture('empty', { dsh: { bundle: { patch: './cordis.patch.yml' } } }, JSON.stringify([{ replace: 'web-runtime' }])),
      'empty',
    ),
    /patch inserts nothing/,
  )
})

await case_('R14: readConnectorRows anchors relative and absolute insert names beside the patch', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'p2temp-unit-'))
  const dir = join(profile, 'node_modules', '@p2sdk-fixture/rel')
  mkdirSync(join(dir, 'lib'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(
    join(dir, 'cordis.patch.yml'),
    JSON.stringify([
      {
        insert: [
          { id: 'rel', name: './lib/index.mjs' },
          { id: 'up', name: '../sibling/plugin.mjs' },
          { id: 'abs', name: '/abs/plugin.mjs' },
          { id: 'bare', name: 'some-package' },
        ],
      },
    ]),
  )
  const url = (p) => pathToFileURL(p).href
  assert.deepEqual(await readConnectorRows(profile, '@p2sdk-fixture/rel'), [
    { id: 'rel', name: url(join(dir, 'lib/index.mjs')) },
    { id: 'up', name: url(join(profile, 'node_modules', '@p2sdk-fixture', 'sibling/plugin.mjs')) },
    { id: 'abs', name: url('/abs/plugin.mjs') },
    { id: 'bare', name: 'some-package' },
  ])
})

await case_('R14: readConnectorRows anchors names inside nested group rows too', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'p2temp-unit-'))
  const dir = join(profile, 'node_modules', 'grouped')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(
    join(dir, 'cordis.patch.yml'),
    JSON.stringify([
      {
        insert: [
          {
            id: 'group',
            group: true,
            config: [
              { id: 'nested-rel', name: './lib/nested.mjs' },
              { id: 'nested-bare', name: 'some-package' },
              { id: 'nested-group', group: true, config: [{ id: 'deep', name: '../deep.mjs' }] },
            ],
          },
        ],
      },
    ]),
  )
  const url = (p) => pathToFileURL(p).href
  const rows = await readConnectorRows(profile, 'grouped')
  assert.equal(rows[0].config[0].name, url(join(dir, 'lib/nested.mjs')))
  assert.equal(rows[0].config[1].name, 'some-package')
  assert.equal(rows[0].config[2].config[0].name, url(join(profile, 'node_modules', 'deep.mjs')))
})

await case_('basePresetRows returns recorded rows and rejects unknown presets / registries without definitions', () => {
  const registry = { definitions: new Map([['standard', { config: { plugins: [{ id: 'persona' }] } }]]) }
  assert.deepEqual(basePresetRows(registry, 'standard'), [{ id: 'persona' }])
  assert.throws(() => basePresetRows(registry, 'nope'), 'unknown agentPreset "nope"')
  assert.throws(() => basePresetRows({}, 'standard'), 'unknown agentPreset "standard"')
})

await case_('P2TempService happy path: base rows + connector rows, one-shot preset, session under temp id', async () => {
  const { ctx, calls } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, { some: 'config' })
  assert.equal(svc.config.some, 'config')
  assert.equal(svc.tempPresets, 0)
  const out = await svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'], cwd: '/tmp/w' })
  assert.deepEqual(out, { sessionId: 'sid-1' })
  assert.equal(calls.registered.length, 1)
  assert.match(calls.registered[0].id, /^p2temp-1-[0-9a-f]+$/)
  assert.deepEqual(calls.registered[0].plugins, [{ id: 'persona' }, { id: 'x' }])
  assert.deepEqual(calls.created, [{ cwd: '/tmp/w', agentPreset: calls.registered[0].id }])
})

await case_('P2TempService defaults agentPreset to standard and increments the one-shot counter', async () => {
  const { ctx, calls } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  await svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'] })
  await svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'] })
  assert.match(calls.registered[0].id, /^p2temp-1-/)
  assert.match(calls.registered[1].id, /^p2temp-2-/)
  assert.equal(calls.created[0].cwd, undefined)
})

await case_('P2TempService rejects a missing request and invalid connectors', async () => {
  const { ctx } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  await assert.rejects(() => svc.createWithConnectors(undefined), /connectors must be a non-empty array/)
  await assert.rejects(() => svc.createWithConnectors({ connectors: [] }), /connectors must be a non-empty array/)
})

await case_('P2TempService rejects a run without profile context', async () => {
  const { ctx } = fakeCtx(okProfile, { get: () => undefined })
  const svc = new P2TempService(ctx, {})
  await assert.rejects(() => svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'] }), /no profile context/)
})

await case_('P2TempService rejects unknown presets and uninstalled connectors via the service path', async () => {
  const { ctx } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  await assert.rejects(
    () => svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'], agentPreset: 'nope' }),
    'unknown agentPreset "nope"',
  )
  await assert.rejects(
    () => svc.createWithConnectors({ connectors: ['@nope/missing'] }),
    /is not installed under the profile/,
  )
})

await case_('REMOTE marker descriptor sits on the prototype with the createWithConnectors method', () => {
  const desc = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(new P2TempService(fakeCtx(okProfile).ctx, {})),
    '@deepseek-ai/dsh-typert-protocol/remote-methods',
  )
  assert.equal(desc.value.version, 1)
  assert.deepEqual(
    desc.value.methods.map((m) => m.exportName),
    ['session.createWithConnectors'],
  )
})

console.log(JSON.stringify(results))
process.exitCode = results.some((r) => !r.ok) ? 1 : 0
