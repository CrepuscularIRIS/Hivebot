// R9 附件（REVIEW-P4终审）：凭证 env 兜底。后台派发的 shell（run_in_background / cron）不继承
// 交互 shell 的 LITELLM_MASTER_KEY（VERIFY-U-31 已实证），此时从 app/ui/.env 读取
// （gitignored —— 根 .gitignore 已有 .env/.env.*；值不进 git、不进代码）。两处都没有 → undefined，
// 消费方（d1-real-model.spec）按 no-silent-skip 设计显式 FAIL。
import { readFileSync } from 'node:fs'

/** process.env 优先；缺省时读 dotenvPath（dotenv 标准形态：KEY=VALUE，容忍行首空白与
 * export 前缀，值可带匹配的单/双引号与「空白+#」行内注释）；都没有 → undefined。 */
export function envOrDotenv(name: string, dotenvPath?: string): string | undefined {
  const fromEnv = process.env[name]
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv
  if (dotenvPath === undefined) return undefined
  let text: string
  try {
    text = readFileSync(dotenvPath, 'utf8')
  } catch {
    return undefined // 无 .env 文件：正常路径（唯一来源是环境变量）
  }
  const line = text.split('\n').find((l) => {
    const t = stripExport(l.trim())
    return !t.startsWith('#') && t.startsWith(`${name}=`)
  })
  if (line === undefined) return undefined
  return parseDotenvValue(stripExport(line.trim()).slice(name.length + 1))
}

/** 剥 `export ` 前缀（docker-compose env_file / dotenv v16 同款容忍）。 */
function stripExport(line: string): string {
  return line.startsWith('export ') ? line.slice('export '.length).trimStart() : line
}

/** dotenv 值解析（dotenv npm / docker-compose 惯例）：剥两端匹配的单/双引号（引号内 # 不当
 * 注释）；未加引号时剥「空白+#」起的行内注释；空值 → undefined。 */
function parseDotenvValue(raw: string): string | undefined {
  const v = raw.trim()
  if (v === '' || v.startsWith('#')) return undefined // 值区整体为注释（KEY= # note）→ 空
  const q = v[0]
  if (q === '"' || q === "'") {
    const close = v.indexOf(q, 1)
    if (close > 0) {
      const rest = v.slice(close + 1)
      if (rest === '' || rest.trimStart().startsWith('#')) return v.slice(1, close) || undefined
    }
  }
  const hash = v.search(/\s#/)
  const unquoted = (hash === -1 ? v : v.slice(0, hash)).trim()
  return unquoted === '' ? undefined : unquoted
}
