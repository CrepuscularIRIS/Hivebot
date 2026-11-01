// Unit tests for the pure parts of src/p2temp (the service class itself runs
// inside the spawned dsh runtime and is covered by tests/market/).
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
