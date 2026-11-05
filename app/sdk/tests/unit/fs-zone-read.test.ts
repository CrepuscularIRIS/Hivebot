// P6-26：真上游读取 + 确定性 resolve/open 后接缝，不启动并发换链进程。
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ZoneCheckedFileSystem, applyZoneRecheck } from '../../src/policy/fs-zone.mjs'
import { noteZoneVerdict } from '../../src/policy/resolve.mjs'

const fromDsh = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const { default: LocalFs } = await import(fromDsh.resolve('@deepseek-ai/dsh-fs-local'))
const cleanup: Array<() => void> = []
afterEach(() => { vi.restoreAllMocks(); while (cleanup.length) cleanup.pop()!() })

function harness() {
  const root = mkdtempSync('/tmp/bot-p626-read-')
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const ws = join(root, 'ws')
  const outside = join(root, 'outside')
  const never = join(root, 'home', '.ssh')
  for (const dir of [join(ws, 'sub'), outside, never]) mkdirSync(dir, { recursive: true })
  for (const dir of [join(ws, 'sub'), outside, never]) writeFileSync(join(dir, 'a.txt'), dir === join(ws, 'sub') ? 'INSIDE' : 'FAKE-CRED-MARKER')
  const fs = Object.assign(Object.create(ZoneCheckedFileSystem.prototype), {
    config: { cwd: ws, diffBasisMaxBytes: 1 << 20 }, internals: {}, locks: new Map(), p2sdkNeverRoots: [never],
  })
  let wrapper: (exec: object, next: () => Promise<unknown>) => Promise<unknown>
  applyZoneRecheck({
    on: (_: string, fn: typeof wrapper) => { wrapper = fn },
    get: (name: string) => ({ fs, sandboxPolicy: { resolve: () => ({ mode: 'workspace-write', workspaceRoot: ws }) } })[name],
  }, [never])
  async function run(body: () => Promise<unknown>, approved?: string[]) {
    const exec = { name: 'read', arguments: { file_path: approved?.[0] ?? join(ws, 'sub', 'a.txt') } }
    noteZoneVerdict(exec, { kind: 'workspace-read', allInside: !approved, targets: approved ?? [join(ws, 'sub', 'a.txt')] })
    return wrapper!(exec, body)
  }
  function swap(to: string) {
    renameSync(join(ws, 'sub'), join(ws, 'original'))
    symlinkSync(to, join(ws, 'sub'))
  }
  const target = (path = join(ws, 'sub', 'a.txt')) => fs.resolve(path)
  return { fs, ws, outside, never, run, swap, target }
}

const methods = ['readText', 'readBytes', 'readByteRange', 'streamText', 'listDir'] as const
async function read(fs: any, method: typeof methods[number], target: object, signal?: AbortSignal) {
  if (method === 'readBytes') return Buffer.from(await fs.readBytes(target, signal, 1 << 20)).toString()
  if (method === 'readByteRange') return Buffer.from(await fs.readByteRange(target, { offset: 0, length: 100 }, signal)).toString()
  if (method === 'streamText') {
    let text = ''
    for await (const chunk of await fs.streamText(target, signal)) text += chunk
    return text
  }
  return fs[method](target, signal)
}

it.each(methods)('%s：模型调用中换链到区外时后端拒绝', async (method) => {
  const h = harness()
  const target = await h.target(method === 'listDir' ? join(h.ws, 'sub') : undefined)
  await expect(h.run(async () => { h.swap(h.outside); return read(h.fs, method, target) }))
    .rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED' })
})

it.each(methods)('%s：上游读取前换链，读取仍绑定区内已打开对象', async (method) => {
  const h = harness()
  writeFileSync(join(h.outside, 'outside-only'), 'OUTSIDE')
  const original = LocalFs.prototype[method]
  const seam = vi.spyOn(LocalFs.prototype, method).mockImplementation(function (target, ...args) {
    h.swap(h.outside)
    return original.call(this, target, ...args)
  })
  const result = await h.run(async () => read(h.fs, method, await h.target(method === 'listDir' ? join(h.ws, 'sub') : undefined)))
  expect(seam).toHaveBeenCalledOnce()
  expect(JSON.stringify(result)).not.toContain('FAKE-CRED-MARKER')
  expect(JSON.stringify(result)).not.toContain('outside-only')
  expect(JSON.stringify(result)).not.toContain('/proc/self/fd')
  if (method !== 'listDir') expect(result).toBe('INSIDE')
  else {
    const entry = (result as any[])[0]
    expect(entry.name).toBe('a.txt')
    expect(entry.target.displayPath).toContain('sub/a.txt')
  }
})

it('获批区外路径只能读原目标；另一区外路径与 NEVER 均拒', async () => {
  const h = harness()
  const approved = join(h.outside, 'a.txt')
  expect(await h.run(async () => h.fs.readText(await h.target(approved)), [approved])).toBe('FAKE-CRED-MARKER')
  const other = join(h.outside, 'other.txt')
  writeFileSync(other, 'OTHER')
  await expect(h.run(async () => h.fs.readText(await h.target(other)), [approved])).rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED' })
  await expect(h.run(async () => h.fs.readText(await h.target(join(h.never, 'a.txt'))), [approved])).rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED' })
})

it.each(['outside', 'never'] as const)('fresh resolve 后、open 前换链到 %s：核对已打开对象后拒', async (destination) => {
  const h = harness()
  const target = await h.target()
  const resolve = h.fs.resolve.bind(h.fs)
  await expect(h.run(async () => {
    vi.spyOn(h.fs, 'resolve').mockImplementationOnce(async (...args) => {
      const fresh = await resolve(...args)
      h.swap(h[destination])
      return fresh
    })
    return h.fs.readText(target)
  })).rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED' })
})

it('stream 作用域跨出工具返回仍保留；没有开始的 iterable 不持有 fd，中途 abort 不需再 next 即关 fd', async () => {
  const h = harness()
  const target = await h.target()
  const controller = new AbortController()
  const baseline = readdirSync('/proc/self/fd').length
  const stream = await h.run(async () => h.fs.streamText(target, controller.signal)) as AsyncIterable<string>
  expect(readdirSync('/proc/self/fd').length).toBeLessThanOrEqual(baseline + 2)
  const iterator = stream[Symbol.asyncIterator]()
  expect((await iterator.next()).value).toBe('INSIDE')
  controller.abort()
  await new Promise((resolve) => setTimeout(resolve, 25))
  expect(readdirSync('/proc/self/fd').length).toBeLessThanOrEqual(baseline + 2)
  await iterator.return?.()
})

it('内部读取不套模型区域限制', async () => {
  const h = harness()
  expect(await h.fs.readText(await h.target(join(h.outside, 'a.txt')))).toBe('FAKE-CRED-MARKER')
})

it('1000 次成功、失败、预中止、stream break/abort 后 fd 回到基线', async () => {
  const h = harness()
  const target = await h.target()
  writeFileSync(join(h.ws, 'sub', 'large.txt'), 'a'.repeat(200000))
  const large = await h.target(join(h.ws, 'sub', 'large.txt'))
  const baseline = readdirSync('/proc/self/fd').length
  await h.run(async () => {
    for (let i = 0; i < 1000; i++) {
      if (i % 5 === 0) expect(await h.fs.readText(target)).toBe('INSIDE')
      if (i % 5 === 1) await expect(h.fs.readBytes(target, undefined, 1)).rejects.toMatchObject({ code: 'FS_TOO_LARGE' })
      if (i % 5 === 2) {
        const abort = new AbortController(); abort.abort()
        await expect(h.fs.readText(target, abort.signal)).rejects.toMatchObject({ code: 'FS_ABORTED' })
      }
      if (i % 5 === 3) { for await (const _ of await h.fs.streamText(large)) break }
      if (i % 5 === 4) {
        const abort = new AbortController()
        const iterator = (await h.fs.streamText(large, abort.signal))[Symbol.asyncIterator]()
        await iterator.next(); abort.abort()
        await expect(iterator.next()).rejects.toMatchObject({ code: 'FS_ABORTED' })
      }
    }
  })
  // Node ReadStream.destroy 的 close 在下一事件循环完成。
  await new Promise((resolve) => setTimeout(resolve, 25))
  expect(readdirSync('/proc/self/fd').length).toBeLessThanOrEqual(baseline + 2)
}, 30000)

it('打开失败和上游 I/O 错误仅显示原 displayPath', async () => {
  const h = harness()
  await h.run(async () => {
    const missing = await h.target(join(h.ws, 'sub', 'missing'))
    await expect(h.fs.readText(missing)).rejects.toMatchObject({ code: 'FS_NOT_FOUND', message: expect.not.stringContaining('/proc/self/fd') })
    const original = LocalFs.prototype.readBytes
    vi.spyOn(LocalFs.prototype, 'readBytes').mockImplementationOnce((target) => { throw new Error(`I/O failed at ${target.targetKey}`) })
    await expect(h.fs.readBytes(await h.target(), undefined, 10)).rejects.toMatchObject({ message: expect.not.stringContaining('/proc/self/fd') })
    expect(original).toBeTypeOf('function')
  })
})
