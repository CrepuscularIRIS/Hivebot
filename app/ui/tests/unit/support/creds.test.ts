// R9 附件：凭证 env 兜底 —— 后台派发 shell（run_in_background / cron）不继承交互 shell 的
// LITELLM_MASTER_KEY 时，从 app/ui/.env（gitignored，值不进 git）读取。
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { envOrDotenv } from '../../support/creds'

describe('R9：envOrDotenv —— process.env 优先，缺省读 .env 文件，两处都无 → undefined', () => {
  it('三级取值顺序', () => {
    const name = `U29_CRED_${Date.now()}`
    const dot = join(mkdtempSync(join(tmpdir(), 'bot-u29-env-')), '.env')
    writeFileSync(dot, `# comment\n${name}=file-key\nOTHER=x\n`)
    expect(envOrDotenv(name, dot)).toBe('file-key')        // 仅文件有
    process.env[name] = 'env-key'
    expect(envOrDotenv(name, dot)).toBe('env-key')         // env 优先
    delete process.env[name]
    expect(envOrDotenv(name, join(dot, '..', 'nope.env'))).toBeUndefined() // 文件不存在（正常路径，不抛）
    expect(envOrDotenv(name)).toBeUndefined()              // 无文件参数且 env 无 → undefined（spec 按 no-silent-skip FAIL）
  })
})
