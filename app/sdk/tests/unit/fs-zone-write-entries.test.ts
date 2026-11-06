// T16-3c（EVAL §8-3 第三件）：rc.1 五写入口的执行层收口证明格。
// 上游 dsh-fs-sandbox 的 SandboxedFileSystem 已把 writeText/editText/patchText/
// deleteFile/moveFile 全部走 checkedTarget（moveFile 源与目标各查一次）；我们的
// ZoneCheckedFileSystem 覆盖 checkedTarget → 三个新入口自动继承 zone 拒。
// 本格直测执行层（不经工具/pre-execute）：区外写拒（WRITE_OUT）与 NEVER 根拒
// （credential root）两个方向 × 三入口，加正对照（区内目标穿过 zone 判定）。
import { createRequire } from 'node:module'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { ZoneCheckedFileSystem } from '../../src/policy/fs-zone.mjs'
import { tmkdir } from '../support/tmp-sweep.ts'

const fromDsh = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const { default: LocalFs } = await import(fromDsh.resolve('@deepseek-ai/dsh-fs-local'))
const cleanup: Array<() => void> = []
afterEach(() => { while (cleanup.length) cleanup.pop()!() })

const NEVER_MARK = 'never-root denied'
const OUT_MARK = 'write-outside-workspace denied'

function harness() {
  const root = tmkdir('bot-t16-we-')
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const ws = join(root, 'ws')
  // T16b：原写死 join(tmpdir(), 'bot-t16-we-outside')——每跑在 TMPDIR 留一份
  // （终验红项）。改 root 下的区外子目录：root 是 tmkdir 受管目录，afterEach
  // 自清；zone 判定只要求在 workspaceRoot（ws）之外，语义不变。
  const outside = join(root, 'outside')
  const never = join(root, 'home', '.ssh') // NEVER 根（凭证形态）
  for (const dir of [ws, outside, never]) mkdirSync(dir, { recursive: true })
  for (const dir of [ws, outside, never]) writeFileSync(join(dir, 'a.txt'), dir === ws ? 'INSIDE' : 'OUTSIDE-MARKER')
  const fs = Object.assign(Object.create(ZoneCheckedFileSystem.prototype), {
    config: { cwd: ws, diffBasisMaxBytes: 1 << 20 }, internals: {}, locks: new Map(), p2sdkNeverRoots: [never],
    ctx: { sandboxPolicy: { resolve: () => ({ mode: 'workspace-write', workspaceRoot: ws }) } },
  })
  const resolve = (p: string) => fs.resolve(p)
  return { fs, ws, outside, never, resolve }
}

const hunks = [{ range: '', lines: [{ kind: 'add', text: 'x' }] }]

it('① patchText/deleteFile/moveFile 区外目标（真 /tmp）→ WRITE_OUT', async () => {
  const h = harness()
  await expect(h.fs.patchText(await h.resolve(join(h.outside, 'a.txt')), hunks, undefined), 'patchText 区外').rejects.toThrow(OUT_MARK)
  await expect(h.fs.deleteFile(await h.resolve(join(h.outside, 'a.txt')), undefined), 'deleteFile 区外').rejects.toThrow(OUT_MARK)
  await expect(
    h.fs.moveFile(await h.resolve(join(h.ws, 'a.txt')), await h.resolve(join(h.outside, 'b.txt')), {}),
    'moveFile 目标区外',
  ).rejects.toThrow(OUT_MARK)
})

it('② patchText/deleteFile/moveFile NEVER 根（home/.ssh）→ never-root denied', async () => {
  const h = harness()
  await expect(h.fs.patchText(await h.resolve(join(h.never, 'a.txt')), hunks, undefined), 'patchText NEVER').rejects.toThrow(NEVER_MARK)
  await expect(h.fs.deleteFile(await h.resolve(join(h.never, 'a.txt')), undefined), 'deleteFile NEVER').rejects.toThrow(NEVER_MARK)
  await expect(
    h.fs.moveFile(await h.resolve(join(h.never, 'a.txt')), await h.resolve(join(h.ws, 'b.txt')), {}),
    'moveFile 源 NEVER',
  ).rejects.toThrow(NEVER_MARK)
})

it('③ 正对照：区内目标穿过 zone 判定（错误不含 p2sdk policy = 到达上游业务层）', async () => {
  const h = harness()
  // 区内目标不被 zone 拒：允许成功（更强的穿过证明）或非 p2sdk 的业务错。
  for (const attempt of [
    async () => h.fs.patchText(await h.resolve(join(h.ws, 'a.txt')), hunks, undefined),
    async () => h.fs.deleteFile(await h.resolve(join(h.ws, 'a.txt')), undefined),
    async () => h.fs.moveFile(await h.resolve(join(h.ws, 'a.txt')), await h.resolve(join(h.ws, 'b.txt')), {}),
  ]) {
    try { await attempt() } catch (e) { expect((e as Error).message, '区内错误不含 p2sdk policy').not.toContain('p2sdk policy') }
  }
  // 区外文件必须原样未动（拒发生在写入前）
  const { readFileSync } = await import('node:fs')
  expect(readFileSync(join(h.outside, 'a.txt'), 'utf8')).toBe('OUTSIDE-MARKER')
  expect(readFileSync(join(h.never, 'a.txt'), 'utf8')).toBe('OUTSIDE-MARKER')
})
