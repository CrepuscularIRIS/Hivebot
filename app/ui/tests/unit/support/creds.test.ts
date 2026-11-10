// R9 附件：凭证 env 兜底 —— 后台派发 shell（run_in_background / cron）不继承交互 shell 的
// LITELLM_MASTER_KEY 时，从 app/ui/.env（gitignored，值不进 git）读取。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { describe, expect, it } from 'vitest'
import { envOrDotenv } from '../../support/creds'

describe('R9：envOrDotenv —— process.env 优先，缺省读 .env 文件，两处都无 → undefined', () => {
  it('三级取值顺序', () => {
    const name = `U29_CRED_${Date.now()}`
    const dot = join(tmkdir('bot-u29-env-'), '.env')
    writeFileSync(dot, `# comment\n${name}=file-key\nOTHER=x\n`)
    expect(envOrDotenv(name, dot)).toBe('file-key')        // 仅文件有
    process.env[name] = 'env-key'
    expect(envOrDotenv(name, dot)).toBe('env-key')         // env 优先
    delete process.env[name]
    expect(envOrDotenv(name, join(dot, '..', 'nope.env'))).toBeUndefined() // 文件不存在（正常路径，不抛）
    expect(envOrDotenv(name)).toBeUndefined()              // 无文件参数且 env 无 → undefined（spec 按 no-silent-skip FAIL）
  })
})

// U-32 O1+O3（REVIEW-P4终审复审）：dotenv 兜底解析按标准惯例（dotenv npm / docker-compose
// env_file）补齐 —— 剥匹配引号、剥空白+# 起的行内注释、容忍 export 前缀与行首空白。
// 值一律虚构，不是真实凭证。
describe('U-32 O1/O3：.env 值解析 —— dotenv 标准形态', () => {
  const name = 'U32_CRED_FAKE_KEY'
  const parse = (content: string): string | undefined => {
    const dot = join(tmkdir('bot-u32-env-'), '.env')
    writeFileSync(dot, content)
    return envOrDotenv(name, dot)
  }

  it('无引号形态不回归', () => {
    expect(parse(`${name}=dummy-key\n`)).toBe('dummy-key')
  })

  it('双引号 / 单引号剥掉（引号不进凭证链）', () => {
    expect(parse(`${name}="dummy-key"\n`)).toBe('dummy-key')
    expect(parse(`${name}='dummy-key'\n`)).toBe('dummy-key')
  })

  it('行内注释剥掉（空白+# 起；无空白 # 不算注释）', () => {
    expect(parse(`${name}=dummy-key # note\n`)).toBe('dummy-key')
    expect(parse(`${name}=dummy-key#nospace\n`)).toBe('dummy-key#nospace')
  })

  it('export 前缀与行首空白容忍', () => {
    expect(parse(`export ${name}=dummy-key\n`)).toBe('dummy-key')
    expect(parse(`  ${name}=dummy-key\n`)).toBe('dummy-key')
  })

  it('引号内的 # 不当注释；引号后注释剥掉；引号内值原样保留', () => {
    expect(parse(`${name}="a # b"\n`)).toBe('a # b')
    expect(parse(`${name}="dummy-key" # trailing\n`)).toBe('dummy-key')
  })

  it('空值（含空引号）仍 → undefined（no-silent-skip 语义不变）', () => {
    expect(parse(`${name}=\n`)).toBeUndefined()
    expect(parse(`${name}=""\n`)).toBeUndefined()
    expect(parse(`${name}=  # only comment\n`)).toBeUndefined()
  })
})
