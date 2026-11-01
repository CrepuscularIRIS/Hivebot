// Unit tests for the pure parts of src/p2temp (the service class itself runs
// inside the spawned dsh runtime and is covered by tests/market/).
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { basePresetRows, normalizeConnectors, readConnectorRows } from '../../src/p2temp/index.mjs'

it('normalizeConnectors accepts a non-empty string array and returns it', () => {
  expect(normalizeConnectors(['a'])).toEqual(['a'])
  expect(normalizeConnectors(['a', 'b'])).toEqual(['a', 'b'])
})

it('normalizeConnectors rejects non-arrays, empty arrays, and non-string members', () => {
  for (const bad of [undefined, null, 'a', [], ['a', 1], [''], ['a', '  ']] as unknown[][]) {
    expect(() => normalizeConnectors(bad as unknown as string[])).toThrow(/connectors must be a non-empty array/)
  }
})

it('readConnectorRows returns the insert rows of an installed JSON-patch bundle', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'p2temp-unit-'))
  const dir = join(profile, 'node_modules', '@p2sdk-fixture/demo')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(dir, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'x' }] }]))
  await expect(readConnectorRows(profile, '@p2sdk-fixture/demo')).resolves.toEqual([{ id: 'x' }])
})

it('R14: readConnectorRows anchors relative and absolute insert names beside the patch', async () => {
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
  const url = (p: string) => pathToFileURL(p).href
  await expect(readConnectorRows(profile, '@p2sdk-fixture/rel')).resolves.toEqual([
    { id: 'rel', name: url(join(dir, 'lib/index.mjs')) },
    { id: 'up', name: url(join(profile, 'node_modules', '@p2sdk-fixture', 'sibling/plugin.mjs')) },
    { id: 'abs', name: url('/abs/plugin.mjs') },
    { id: 'bare', name: 'some-package' },
  ])
})

it('R14: readConnectorRows anchors names inside nested group rows too', async () => {
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
  const url = (p: string) => pathToFileURL(p).href
  const rows = await readConnectorRows(profile, 'grouped')
  expect(rows[0].config[0].name).toBe(url(join(dir, 'lib/nested.mjs')))
  expect(rows[0].config[1].name).toBe('some-package')
  expect(rows[0].config[2].config[0].name).toBe(url(join(profile, 'node_modules', 'deep.mjs')))
})

it('readConnectorRows rejects uninstalled connectors', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'p2temp-unit-'))
  await expect(readConnectorRows(profile, '@nope/missing')).rejects.toThrow('is not installed under the profile')
})

it('readConnectorRows rejects manifests without dsh.bundle.patch', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'p2temp-unit-'))
  const dir = join(profile, 'node_modules', 'plain')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'plain' }))
  await expect(readConnectorRows(profile, 'plain')).rejects.toThrow('declares no dsh.bundle.patch')
})

it('readConnectorRows rejects non-JSON patch files', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'p2temp-unit-'))
  const dir = join(profile, 'node_modules', 'yamlpatch')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(dir, 'cordis.patch.yml'), '- insert:\n  - id: yaml-only\n')
  await expect(readConnectorRows(profile, 'yamlpatch')).rejects.toThrow('patch is not JSON (T-03 scope)')
})

it('readConnectorRows rejects patches that insert nothing', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'p2temp-unit-'))
  const dir = join(profile, 'node_modules', 'empty')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(dir, 'cordis.patch.yml'), JSON.stringify([{ replace: 'web-runtime' }]))
  await expect(readConnectorRows(profile, 'empty')).rejects.toThrow('patch inserts nothing')
})

it('basePresetRows returns the recorded plugin rows of a known preset', () => {
  const registry = { definitions: new Map([['standard', { config: { plugins: [{ id: 'persona' }] } }]]) }
  expect(basePresetRows(registry, 'standard')).toEqual([{ id: 'persona' }])
})

it('basePresetRows rejects an unknown preset and a registry without definitions', () => {
  const registry = { definitions: new Map([['standard', { config: { plugins: [] } }]]) }
  expect(() => basePresetRows(registry, 'nope')).toThrow('unknown agentPreset "nope"')
  expect(() => basePresetRows({}, 'standard')).toThrow('unknown agentPreset "standard"')
})
