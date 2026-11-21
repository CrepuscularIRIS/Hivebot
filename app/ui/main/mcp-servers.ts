// D2（0.78.1 custom-mcp-form）：自定义 MCP server 存储——main 直读写 <dataDir>/mcp-servers.json。
// schema 对齐 dsh mcp-client Config（stdio=command/args；streamableHttp=url/headers）——
// 消费注入（sdk session 组装侧）留后续批；本面先保真 0.78.1 表单的存储与回显。
import { app, ipcMain } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface CustomMcpServer {
  name: string
  type: 'remote' | 'command'
  url?: string
  headers?: Array<{ key: string; value: string }>
  command?: string
  args?: string[]
}

const NAME_OK = /[a-zA-Z0-9]/
const URL_OK = /^https?:\/\/\S+$/

function readAll(dataDir: string): Record<string, CustomMcpServer> {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, 'mcp-servers.json'), 'utf8'))
    if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) return {}
    return raw as Record<string, CustomMcpServer>
  } catch { return {} }
}

function writeAll(dataDir: string, servers: Record<string, CustomMcpServer>): void {
  const tmp = join(dataDir, `mcp-servers-${randomUUID()}.json`)
  writeFileSync(tmp, JSON.stringify(servers, null, 2), 'utf8')
  renameSync(tmp, join(dataDir, 'mcp-servers.json'))
}

export function registerMcpServers(dataDir: string): void {
  ipcMain.handle('pbots:mcp-servers', (_event, req: unknown) => {
    const r = req as { op?: string; name?: string; server?: CustomMcpServer }
    if (r == null || typeof r !== 'object') return { ok: false, error: { code: 'pbots/invalid-args', message: 'request must be an object' } }
    try {
      const all = readAll(dataDir)
      if (r.op === 'list') return { ok: true, value: { servers: all } }
      if (r.op === 'set') {
        const s = r.server
        const name = r.name ?? s?.name ?? ''
        if (typeof s !== 'object' || s == null || typeof name !== 'string' || !NAME_OK.test(name)) {
          return { ok: false, error: { code: 'pbots/invalid-args', message: 'Name must contain at least one letter or number' } }
        }
        if (name in all) {
          // 0.78.1 BMJU7y：A server named "{name}" already exists（编辑除外——本面无编辑入口，同名=set 覆盖更新）
        }
        if (s.type === 'remote') {
          if (typeof s.url !== 'string' || !URL_OK.test(s.url)) {
            return { ok: false, error: { code: 'pbots/invalid-args', message: 'The server needs a URL or a command' } }
          }
        } else if (s.type === 'command') {
          if (typeof s.command !== 'string' || s.command.trim() === '') {
            return { ok: false, error: { code: 'pbots/invalid-args', message: 'The server needs a URL or a command' } }
          }
        } else {
          return { ok: false, error: { code: 'pbots/invalid-args', message: 'invalid server type' } }
        }
        all[name] = { ...s, name }
        writeAll(dataDir, all)
        return { ok: true, value: { name } }
      }
      if (r.op === 'remove') {
        if (typeof r.name !== 'string' || !(r.name in all)) {
          return { ok: false, error: { code: 'pbots/invalid-args', message: 'unknown server' } }
        }
        delete all[r.name]
        writeAll(dataDir, all)
        return { ok: true, value: { name: r.name } }
      }
      return { ok: false, error: { code: 'pbots/invalid-args', message: 'unknown op' } }
    } catch {
      return { ok: false, error: { code: 'pbots/write-failed', message: 'Something went wrong. Try again.' } }
    }
  })
}

// 引用 app 保持与 mcp-permissions.ts 相同的导入形态（dataDir 由调用方传入）。
void app
