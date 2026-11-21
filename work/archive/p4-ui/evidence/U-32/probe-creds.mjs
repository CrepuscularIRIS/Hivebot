// U-32 O1+O3 独立实测：直接调 worktree 的 envOrDotenv（esbuild 编译副本），自构 .env 变体。
// 键名与值全部虚构，非真实凭证。
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { envOrDotenv } from './creds.cjs'

const NAME = 'VFY_FAKE_KEY_X' // 虚构键名
let pass = 0, fail = 0
function check(label, content, expected) {
  const dot = join(mkdtempSync(join(tmpdir(), 'vfy-u32-env-')), '.env')
  writeFileSync(dot, content)
  const got = envOrDotenv(NAME, dot)
  const ok = got === expected
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | got=${JSON.stringify(got)} expected=${JSON.stringify(expected)}`)
}

// O1/O3 原文点名的四种形态
check('双引号', `${NAME}="vfy-dummy-1"\n`, 'vfy-dummy-1')
check('单引号', `${NAME}='vfy-dummy-1'\n`, 'vfy-dummy-1')
check('行内注释(空白+#)', `${NAME}=vfy-dummy-1 # note\n`, 'vfy-dummy-1')
check('export 前缀', `export ${NAME}=vfy-dummy-1\n`, 'vfy-dummy-1')
check('行首空白', `  ${NAME}=vfy-dummy-1\n`, 'vfy-dummy-1')
// 组合 / 边角
check('引号内 #', `${NAME}="a # b"\n`, 'a # b')
check('引号后注释', `${NAME}="vfy-dummy-1" # trailing\n`, 'vfy-dummy-1')
check('单引号+尾注释', `${NAME}='vfy-dummy-1' # t\n`, 'vfy-dummy-1')
check('CRLF', `${NAME}=vfy-dummy-1\r\n`, 'vfy-dummy-1')
check('tab 前注释', `${NAME}=vfy-dummy-1\t# t\n`, 'vfy-dummy-1')
check('无空格 # 保留(保守规则)', `${NAME}=vfy-a#b\n`, 'vfy-a#b')
check('空值', `${NAME}=\n`, undefined)
check('空引号', `${NAME}=""\n`, undefined)
check('值区纯注释', `${NAME}=  # only\n`, undefined)
check('整行注释跳过', `# ${NAME}=vfy-x\nOTHER=1\n`, undefined)
check('前缀不误配(KEY2)', `OTHER=1\n${NAME}2=vfy-wrong\n${NAME}=vfy-right\n`, 'vfy-right')
check('不崩溃:未闭合引号', `${NAME}="unclosed\n`, '"unclosed')

// env 优先语义不回归（虚构值）
process.env[NAME] = 'vfy-from-env'
const dot2 = join(mkdtempSync(join(tmpdir(), 'vfy-u32-env-')), '.env')
writeFileSync(dot2, `${NAME}=vfy-from-file\n`)
const got2 = envOrDotenv(NAME, dot2)
const ok2 = got2 === 'vfy-from-env'
ok2 ? pass++ : fail++
console.log(`${ok2 ? 'PASS' : 'FAIL'} | env 优先 | got=${JSON.stringify(got2)}`)
delete process.env[NAME]

console.log(`\nTOTAL pass=${pass} fail=${fail}`)
process.exit(fail === 0 ? 0 : 1)
