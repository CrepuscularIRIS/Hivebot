// R9 附件（REVIEW-P4终审）：凭证 env 兜底。后台派发的 shell（run_in_background / cron）不继承
// 交互 shell 的 LITELLM_MASTER_KEY（VERIFY-U-31 已实证），此时从 app/ui/.env 读取
// （gitignored —— 根 .gitignore 已有 .env/.env.*；值不进 git、不进代码）。两处都没有 → undefined，
// 消费方（d1-real-model.spec）按 no-silent-skip 设计显式 FAIL。
import { readFileSync } from 'node:fs'

/** process.env 优先；缺省时读 dotenvPath（每行 KEY=VALUE，# 注释行忽略）；都没有 → undefined。 */
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
  const line = text.split('\n').find((l) => !l.trimStart().startsWith('#') && l.startsWith(`${name}=`))
  const value = line?.slice(name.length + 1).trim()
  return value === undefined || value === '' ? undefined : value
}
