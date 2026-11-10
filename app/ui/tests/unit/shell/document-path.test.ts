// resolveAppPath 防穿越单测（⑦(f) 的 403 分支——URL 解析器先规范化 %2e%2e，e2e 到不了这分支）。
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: {},
  ipcMain: { handle: () => {}, on: () => {} },
  protocol: { handle: () => {}, registerSchemesAsPrivileged: () => {} },
}))

import { resolveAppPath } from '../../../main/index'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'

const root = tmkdir('bot-U-00-doc-')

describe('resolveAppPath', () => {
  it('/ 根路径 → index.html', () => {
    const r = resolveAppPath(root, '/')
    expect(r.status).toBe(200)
    expect(r.file!.endsWith(join(root, 'index.html'))).toBe(true)
  })
  it('普通资源路径保留', () => {
    expect(resolveAppPath(root, '/assets/x.js').status).toBe(200)
  })
  it('解码后 ../ 穿越 → 403', () => {
    expect(resolveAppPath(root, '/%2e%2e/%2e%2e/etc/passwd').status).toBe(403)
  })
  it('坏编码 → 400', () => {
    expect(resolveAppPath(root, '/%zz').status).toBe(400)
  })
})
