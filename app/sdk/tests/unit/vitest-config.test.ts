import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

// P5-H7: vitest.config 读 PBOTS_TEST_WORKERS 给 maxWorkers 设上限。
// config 在 import 时读 env，用裸 node 子进程分别注入，避免模块缓存串味。
const configUrl = pathToFileURL(join(import.meta.dirname, '../../vitest.config.ts')).href
const script = `import(${JSON.stringify(configUrl)}).then(m => console.log(JSON.stringify(m.default.test?.maxWorkers ?? null)))`

const maxWorkersOf = (value: string | undefined): number | null => {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (value === undefined) delete env.PBOTS_TEST_WORKERS
  else env.PBOTS_TEST_WORKERS = value
  const out = execFileSync(process.execPath, ['-e', script], { env, encoding: 'utf8' })
  return JSON.parse(out.trim())
}

it('PBOTS_TEST_WORKERS 未设 → maxWorkers 不设（vitest 默认不变）', () => {
  expect(maxWorkersOf(undefined)).toBeNull()
})

it('PBOTS_TEST_WORKERS=4 → maxWorkers=4', () => {
  expect(maxWorkersOf('4')).toBe(4)
})

it('PBOTS_TEST_WORKERS=abc → 配置错误进程退出（fail fast）', () => {
  expect(() => maxWorkersOf('abc')).toThrow(/PBOTS_TEST_WORKERS/)
})
