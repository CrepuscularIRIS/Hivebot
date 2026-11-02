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
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import P2TempService, { basePresetRows, normalizeConnectors, readConnectorRows } from '../../src/p2temp/index.mjs'
import { presetIdOf } from '../../src/p2temp/preset-id.mjs'

// T-18: the fake registry validates rows with the REAL entryListProblem from
// the installed @deepseek-ai/dsh-agent-preset-registry (same createRequire
// anchor src/p2temp/index.mjs uses) — a hand-rolled stand-in drifted from the
// real activation rules once already (REVIEW-P2最终收尾 R4: the old mock made
// register() throw, which the real registry never does).
const registryRequire = createRequire(
  realpathSync(fileURLToPath(new URL('../../node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js', import.meta.url))),
)
const { entryListProblem } = await import(
  pathToFileURL(registryRequire.resolve('@deepseek-ai/dsh-agent-preset-registry'))
)

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
  const calls = { registered: [], created: [], registerAttempts: [] }
  const definitions =
    over.definitions ?? new Map([['standard', { config: { plugins: [{ id: 'persona', name: 'persona-pkg' }] } }]])
  const ctx = {
    reflect: { provide() {} },
    get: (key) => (over.get ? over.get(key) : key === 'profileContext' ? { dir: profileDir } : undefined),
    agentPresets: {
      definitions,
      // Mirrors the real registry (packages/preset/agent-preset-registry
      // src/index.ts:97-136): duplicate ids throw; otherwise the record lands
      // in the same in-memory definitions map the has-check reads BEFORE
      // activation, an activation failure (real entryListProblem above) stays
      // on record.broken — register RESOLVES and returns the unregister
      // disposer, it never rejects (REVIEW-P2最终收尾 R2/R4). registerAttempts
      // counts every call (throwing ones included) so tests can prove the
      // service never even reaches register twice for one preset id; the
      // activation delay opens the concurrent-registration window.
      register:
        over.register ??
        (async (preset) => {
          calls.registerAttempts.push(preset.id)
          await new Promise((resolve) => setTimeout(resolve, 5))
          if (definitions.has(preset.id)) throw new Error(`Duplicate agent preset: ${preset.id}`)
          calls.registered.push(preset)
          const record = { config: preset, ready: Promise.resolve() }
          definitions.set(preset.id, record)
          const problem = entryListProblem(preset.plugins)
          if (problem !== undefined) record.broken = problem
          let disposed = false
          return async () => {
            if (disposed) return
            disposed = true
            definitions.delete(preset.id)
            await record.ready
          }
        }),
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

// T-18: rows carry a "name" — the real registry's entryListProblem rejects
// nameless rows (definition.ts:26-28), so the old {id:'x'} fixture would be
// broken under the faithful register below.
const okProfile = fixture(
  '@p2sdk-fixture/demo',
  { dsh: { bundle: { patch: './cordis.patch.yml' } } },
  JSON.stringify([{ insert: [{ id: 'x', name: 'x-pkg' }] }]),
)

await case_('normalizeConnectors accepts a non-empty string array and returns the deduplicated, sorted copy', () => {
  assert.deepEqual(normalizeConnectors(['a']), ['a'])
  assert.deepEqual(normalizeConnectors(['a', 'b']), ['a', 'b'])
  // T-18 R3/R5: same normalization as presetIdOf — the id and the actually
  // registered content must derive from ONE canonical connector list.
  assert.deepEqual(normalizeConnectors(['a', 'a']), ['a'])
  assert.deepEqual(normalizeConnectors(['b', 'a', 'b']), ['a', 'b'])
})

await case_('normalizeConnectors rejects non-arrays, empty arrays, and non-string members', () => {
  for (const bad of [undefined, null, 'a', [], ['a', 1], [''], ['a', '  ']]) {
    assert.throws(() => normalizeConnectors(bad), /connectors must be a non-empty array/)
  }
})

await case_('readConnectorRows returns the insert rows of an installed JSON-patch bundle', async () => {
  assert.deepEqual(await readConnectorRows(okProfile, '@p2sdk-fixture/demo'), [{ id: 'x', name: 'x-pkg' }])
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

await case_('R1: readConnectorRows rejects bundle names that could escape the profile (traversal / absolute / multi-slash)', async () => {
  // U-19 R1a：名字先于一切文件访问做形状校验——join(profileDir,'node_modules',name)
  // 的拼接消费点不容许 ../、@scope/..、绝对路径、多斜杠、反斜杠（Windows 形态）。
  for (const bad of ['../..', '../../x', '@scope/..', '/abs/x', 'C:/x', 'a/b/c', '..\\..\\x', '.', '..', '', ' ']) {
    await assert.rejects(
      () => readConnectorRows(okProfile, bad),
      (error) => /p2temp\/connector-unavailable/.test(error.code) && /not a valid bundle name/.test(error.message),
    )
  }
  // 合法形态不受影响：scoped 与裸 npm 名
  assert.deepEqual(await readConnectorRows(okProfile, '@p2sdk-fixture/demo'), [{ id: 'x', name: 'x-pkg' }])
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

await case_('presetIdOf: same content ⇒ same id; connector order and duplicates do not matter; different presets differ', () => {
  const a = presetIdOf('standard', ['a', 'b'])
  assert.equal(a, presetIdOf('standard', ['b', 'a']), 'order-insensitive')
  assert.equal(a, presetIdOf('standard', ['a', 'a', 'b']), 'deduplicated')
  assert.match(a, /^p2temp-[0-9a-f]{12}$/)
  assert.notEqual(a, presetIdOf('coder', ['a', 'b']), 'base preset participates in the id')
})

await case_('presetIdOf: rejects missing or empty agentPreset and invalid connectors', () => {
  for (const bad of [undefined, null, '', '  ']) {
    assert.throws(() => presetIdOf(bad, ['a']), /requires an explicit agentPreset/)
  }
  for (const bad of [undefined, null, 'a', [], [1], [''], ['a', '']]) {
    assert.throws(() => presetIdOf('standard', bad), /requires a non-empty connectors array/)
  }
})

await case_('P2TempService happy path: base rows + connector rows, content-derived preset, session under temp id', async () => {
  const { ctx, calls } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, { some: 'config' })
  assert.equal(svc.config.some, 'config')
  const out = await svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'], agentPreset: 'standard', cwd: '/tmp/w' })
  assert.deepEqual(out, { sessionId: 'sid-1' })
  assert.equal(calls.registered.length, 1)
  assert.equal(calls.registered[0].id, presetIdOf('standard', ['@p2sdk-fixture/demo']))
  assert.deepEqual(calls.registered[0].plugins, [{ id: 'persona', name: 'persona-pkg' }, { id: 'x', name: 'x-pkg' }])
  assert.deepEqual(calls.created, [{ cwd: '/tmp/w', agentPreset: calls.registered[0].id }])
})

await case_('createWithConnectors: second identical call reuses the registered preset (no Duplicate, one register)', async () => {
  const { ctx, calls } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  await svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'], agentPreset: 'standard' })
  await svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'], agentPreset: 'standard' })
  assert.equal(calls.registered.length, 1, 'has-check skips the second register')
  assert.equal(calls.created.length, 2)
  assert.equal(calls.created[0].agentPreset, calls.created[1].agentPreset)
  assert.equal(calls.created[0].cwd, undefined)
})

await case_('P2TempService rejects a missing request and invalid connectors', async () => {
  const { ctx } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  await assert.rejects(() => svc.createWithConnectors(undefined), /connectors must be a non-empty array/)
  await assert.rejects(() => svc.createWithConnectors({ connectors: [] }), /connectors must be a non-empty array/)
  // CONTRACT §8 item 2: default agentPreset resolution belongs to main alone;
  // p2temp rejects an omitted one instead of silently assuming 'standard'.
  await assert.rejects(
    () => svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'] }),
    /agentPreset must be an explicit/,
  )
})

await case_('P2TempService rejects a run without profile context', async () => {
  const { ctx } = fakeCtx(okProfile, { get: () => undefined })
  const svc = new P2TempService(ctx, {})
  await assert.rejects(
    () => svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'], agentPreset: 'standard' }),
    /no profile context/,
  )
})

await case_('P2TempService rejects unknown presets and uninstalled connectors via the service path', async () => {
  const { ctx } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  await assert.rejects(
    () => svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'], agentPreset: 'nope' }),
    'unknown agentPreset "nope"',
  )
  await assert.rejects(
    () => svc.createWithConnectors({ connectors: ['@nope/missing'], agentPreset: 'standard' }),
    /is not installed under the profile/,
  )
})

await case_('presetEnsure: idempotent registration — content id, has-check skips an existing id', async () => {
  const { ctx, calls } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  const first = await svc.presetEnsure({ agentPreset: 'standard', connectors: ['@p2sdk-fixture/demo'] })
  assert.equal(first.presetId, presetIdOf('standard', ['@p2sdk-fixture/demo']))
  assert.equal(calls.registered.length, 1)
  assert.deepEqual(calls.registered[0].plugins, [{ id: 'persona', name: 'persona-pkg' }, { id: 'x', name: 'x-pkg' }])
  // Second ensure for the same recipe: the definition now exists, register is
  // not even attempted (the restart-recovery path main calls per recipe).
  const second = await svc.presetEnsure({ agentPreset: 'standard', connectors: ['@p2sdk-fixture/demo'] })
  assert.equal(second.presetId, first.presetId)
  assert.equal(calls.registered.length, 1)
})

await case_('presetEnsure/createWithConnectors: concurrent same-id calls share one in-flight registration (register reached once)', async () => {
  const { ctx, calls } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  const [ensureOut, created] = await Promise.all([
    svc.presetEnsure({ agentPreset: 'standard', connectors: ['@p2sdk-fixture/demo'] }),
    svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'], agentPreset: 'standard' }),
  ])
  assert.equal(ensureOut.presetId, presetIdOf('standard', ['@p2sdk-fixture/demo']))
  assert.equal(created.sessionId, 'sid-1')
  assert.equal(calls.registerAttempts.length, 1, 'second concurrent call reuses the in-flight promise, register is never reached twice')
  assert.equal(calls.registered.length, 1)
  assert.equal(ctx.agentPresets.definitions.size, 2, 'standard + the one temp preset, nothing else')
})

await case_('ensure failure clears the in-flight slot: a retry after failure runs the full path again', async () => {
  const { ctx, calls } = fakeCtx(okProfile, {
    register: async (preset) => {
      calls.registerAttempts.push(preset.id)
      await new Promise((resolve) => setTimeout(resolve, 5))
      throw new Error('activation failed')
    },
  })
  const svc = new P2TempService(ctx, {})
  await assert.rejects(() => svc.presetEnsure({ agentPreset: 'standard', connectors: ['@p2sdk-fixture/demo'] }), /activation failed/)
  await assert.rejects(() => svc.presetEnsure({ agentPreset: 'standard', connectors: ['@p2sdk-fixture/demo'] }), /activation failed/)
  assert.equal(calls.registerAttempts.length, 2, 'failed slot is cleared, retry starts a fresh registration')
})

await case_('presetEnsure: unrelated register failures propagate untouched', async () => {
  const boom = async () => { throw new Error('activation failed') }
  const { ctx } = fakeCtx(okProfile, { register: boom })
  const svc = new P2TempService(ctx, {})
  await assert.rejects(() => svc.presetEnsure({ agentPreset: 'standard', connectors: ['@p2sdk-fixture/demo'] }), /activation failed/)
})

await case_('presetEnsure: uninstalled connector throws a structured error naming it, poisoning no other preset', async () => {
  const { ctx, calls } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  await assert.rejects(async () => {
    await svc.presetEnsure({ agentPreset: 'standard', connectors: ['@nope/missing'] })
  }, (error) => {
    // Structured = code-discriminated RemoteError with the connector in
    // details; the registry must be untouched (§8 item 1: one failed recipe
    // never affects the other entries).
    assert.equal(error.code, 'p2temp/connector-unavailable')
    assert.deepEqual(error.details, { connector: '@nope/missing' })
    assert.match(error.message, /@nope\/missing/)
    return true
  })
  assert.equal(calls.registered.length, 0, 'no half-registered preset')
  assert.ok(ctx.agentPresets.definitions.has('standard'), 'existing presets stay')
  assert.equal([...ctx.agentPresets.definitions.keys()].filter((k) => k.startsWith('p2temp-')).length, 0)
})

await case_('presetEnsure: rejects missing agentPreset and invalid connectors', async () => {
  const { ctx } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  await assert.rejects(() => svc.presetEnsure({ connectors: ['@p2sdk-fixture/demo'] }), /must be an explicit/)
  await assert.rejects(() => svc.presetEnsure({ agentPreset: 'standard' }), /connectors must be a non-empty array/)
})

await case_('T-18①: duplicate connector names register one row set per connector — clean callers get the identical preset', async () => {
  const { ctx, calls } = fakeCtx(okProfile)
  const svc = new P2TempService(ctx, {})
  // First caller sends the dirty array ['demo','demo']: presetIdOf dedupes to
  // the shared content id, so the REGISTERED content must be the deduplicated
  // one too (id ⇔ content, CONTRACT §3.1) — not two copies of the row.
  const dup = await svc.presetEnsure({ agentPreset: 'standard', connectors: ['@p2sdk-fixture/demo', '@p2sdk-fixture/demo'] })
  const id = presetIdOf('standard', ['@p2sdk-fixture/demo'])
  assert.equal(dup.presetId, id)
  assert.equal(calls.registered.length, 1)
  assert.deepEqual(
    calls.registered[0].plugins,
    [{ id: 'persona', name: 'persona-pkg' }, { id: 'x', name: 'x-pkg' }],
    "['a','a'] and ['a'] register exactly the same plugins",
  )
  // The later clean caller ['demo'] must not inherit the first request's shape.
  const clean = await svc.createWithConnectors({ connectors: ['@p2sdk-fixture/demo'], agentPreset: 'standard' })
  assert.equal(clean.sessionId, 'sid-1')
  assert.equal(calls.registered.length, 1)
  assert.deepEqual(ctx.agentPresets.definitions.get(id).config.plugins, calls.registered[0].plugins)
})

await case_('T-18②: broken activation throws p2temp/preset-broken, disposes the record; retry after fixing the patch re-registers under the same id', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'p2temp-unit-'))
  const dir = join(profile, 'node_modules', 'broken-conn')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  // Row without a "name": passes the SDK read layer, fails the REAL
  // registry's entryListProblem → record.broken, register resolves (R2/R4).
  writeFileSync(join(dir, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'nameless' }] }]))
  const { ctx, calls } = fakeCtx(profile)
  const svc = new P2TempService(ctx, {})
  const id = presetIdOf('standard', ['broken-conn'])
  await assert.rejects(
    () => svc.presetEnsure({ agentPreset: 'standard', connectors: ['broken-conn'] }),
    (error) => {
      assert.equal(error.code, 'p2temp/preset-broken')
      assert.equal(error.details.presetId, id)
      assert.match(error.details.diagnostic, /names no plugin/)
      assert.match(error.message, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      return true
    },
  )
  assert.equal(ctx.agentPresets.definitions.has(id), false, 'the broken record is disposed — the id stays re-enterable')
  assert.equal(svc.inflight.has(id), false, 'the in-flight slot is cleared')
  // Fix the patch on disk; the same recipe must retry the FULL path and win.
  writeFileSync(join(dir, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'fixed', name: 'fixed-pkg' }] }]))
  const out = await svc.presetEnsure({ agentPreset: 'standard', connectors: ['broken-conn'] })
  assert.equal(out.presetId, id, 'same recipe → same content id')
  assert.equal(calls.registerAttempts.length, 2, 'the retry re-registered instead of reusing the broken id')
  assert.equal(ctx.agentPresets.definitions.get(id).broken, undefined)
})

await case_('T-18②: a leftover broken record under the id is never served — preset-broken, register untouched', async () => {
  const id = presetIdOf('standard', ['@p2sdk-fixture/demo'])
  const definitions = new Map([
    ['standard', { config: { plugins: [{ id: 'persona', name: 'persona-pkg' }] } }],
    [id, { config: { id, plugins: [] }, broken: 'stale failure' }],
  ])
  const { ctx, calls } = fakeCtx(okProfile, { definitions })
  const svc = new P2TempService(ctx, {})
  await assert.rejects(
    () => svc.presetEnsure({ agentPreset: 'standard', connectors: ['@p2sdk-fixture/demo'] }),
    (error) => {
      assert.equal(error.code, 'p2temp/preset-broken')
      assert.equal(error.details.diagnostic, 'stale failure')
      return true
    },
  )
  assert.equal(calls.registerAttempts.length, 0, 'the has-check neither served nor re-registered the broken id')
})

await case_('T-18②: register without a disposer still reports broken loudly on every retry', async () => {
  const profile = fixture('nodispose-conn', { dsh: { bundle: { patch: './cordis.patch.yml' } } }, JSON.stringify([{ insert: [{ id: 'nameless' }] }]))
  const { ctx, calls } = fakeCtx(profile, {
    // A register shaped like the real one minus the returned disposer (older
    // fakes / wrappers): broken must still surface, never a success id.
    register: async (preset) => {
      calls.registerAttempts.push(preset.id)
      const problem = entryListProblem(preset.plugins)
      ctx.agentPresets.definitions.set(preset.id, { config: preset, ready: Promise.resolve(), ...(problem ? { broken: problem } : {}) })
    },
  })
  const svc = new P2TempService(ctx, {})
  for (let attempt = 1; attempt <= 2; attempt++) {
    await assert.rejects(
      () => svc.presetEnsure({ agentPreset: 'standard', connectors: ['nodispose-conn'] }),
      (error) => error.code === 'p2temp/preset-broken',
      `attempt ${attempt} must not return a success id for a broken preset`,
    )
  }
  assert.equal(calls.registerAttempts.length, 1, 'the leftover broken record short-circuits retries at the has-check')
})

await case_('REMOTE marker descriptor sits on the prototype with both p2temp methods', () => {
  const desc = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(new P2TempService(fakeCtx(okProfile).ctx, {})),
    '@deepseek-ai/dsh-typert-protocol/remote-methods',
  )
  assert.equal(desc.value.version, 1)
  assert.deepEqual(
    desc.value.methods.map((m) => m.exportName),
    ['session.createWithConnectors', 'preset.ensure'],
  )
})

console.log(JSON.stringify(results))
process.exitCode = results.some((r) => !r.ok) ? 1 : 0
