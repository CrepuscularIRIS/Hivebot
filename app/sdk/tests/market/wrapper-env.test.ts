// T69b（审查意见 1）：memory wrapper 的 env 必须把 MEMORY_FILE_PATH 指到该用户
// dshHome 派生的持久目录——包默认写自己 dist/memory.jsonl（随 node_modules 走，
// 升级即丢、不同 HOME 共用一份）。表外包（filesystem）env 仍 {}。
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { marketWrapperDirFor } from '../../src/market/wrapper.mjs'
import { tmkdir } from '../support/tmp-sweep.ts'

type McpRow = { config?: { env?: Record<string, string> } }

const patchRows = (wrapperDir: string): McpRow[] => {
  const raw = JSON.parse(readFileSync(join(wrapperDir, 'cordis.patch.yml'), 'utf8')) as Array<{ insert?: unknown[] }>
  return (raw[0]?.insert ?? []) as McpRow[]
}

const MEM = '@modelcontextprotocol/server-memory@2.1.1'
const FS = '@agent-infra/mcp-server-filesystem@1.2.29'

it('不同 dshHome 的 memory wrapper：MEMORY_FILE_PATH 各自派生、不含 node_modules', () => {
  const homeA = join(tmkdir('t69b-a-'), 'dsh-home')
  const homeB = join(tmkdir('t69b-b-'), 'dsh-home')
  const dirA = marketWrapperDirFor({ spec: MEM, dshHome: homeA })
  const dirB = marketWrapperDirFor({ spec: MEM, dshHome: homeB })
  expect(dirA).toBeTruthy(); expect(dirB).toBeTruthy()
  const envA = patchRows(dirA!)[0]?.config?.env ?? {}
  const envB = patchRows(dirB!)[0]?.config?.env ?? {}
  expect(envA.MEMORY_FILE_PATH, 'A 有 MEMORY_FILE_PATH').toBeTruthy()
  expect(envB.MEMORY_FILE_PATH, 'B 有 MEMORY_FILE_PATH').toBeTruthy()
  expect(envA.MEMORY_FILE_PATH).not.toBe(envB.MEMORY_FILE_PATH)
  expect(envA.MEMORY_FILE_PATH!.startsWith(homeA), 'A 以 homeA 开头').toBe(true)
  expect(envB.MEMORY_FILE_PATH!.startsWith(homeB), 'B 以 homeB 开头').toBe(true)
  expect(envA.MEMORY_FILE_PATH).not.toContain('node_modules')
})

it('表外包（filesystem）：env 仍为 {}（无 env 注入）', () => {
  const home = join(tmkdir('t69b-fs-'), 'dsh-home')
  const dir = marketWrapperDirFor({ spec: FS, dshHome: home })
  expect(dir).toBeTruthy()
  expect(patchRows(dir!)[0]?.config?.env ?? {}).toEqual({})
})
