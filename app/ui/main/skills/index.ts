// T7a（L4-c）：main 侧 skill 启用 API——list / enable / disable。
// 语义（RE-skills Q2/Q4/Q7）：启用 = 复制快照到目标 bot 私有根
// <dataDir>/workspaces/<botId>/.dsh/skills/<name>/（T6 已证按 bot 私有、dsh 下一请求即发现）；
// 停用 = 删副本；改源不联动。「你的 skills」= 各 bot 私有根的并集（派生视图，本单不另建库目录；
// ponytail: A 删源后该 skill 从并集消失——独立库等「Add new skill / 文件导入」时再建）。
// 信任边界：这是渲染进程能调的写文件入口——botId/name 正则 + 工作区 lstat（拒符号链接）、
// 源树只许常规文件与目录（符号链接会把「复制」变「引用」）、字符数上限、250 条上限、staging 原子落位。
import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type SkillsResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; details: {} } }

export interface SkillsDeps {
  /** bots.json 所在目录（$PBOTS_DATA_DIR）；bot 工作区 = <dataDir>/workspaces/<botId>。 */
  dataDir: string
}

export interface SkillsHandle {
  handler: (req: unknown) => Promise<SkillsResult>
}

const fail = (code: string, message: string): SkillsResult => ({ ok: false, error: { code: `pbots/${code}`, message, details: {} } })
const invalidArgs = (message: string): SkillsResult => fail('invalid-args', message)

// RE Q4：slug——小写字母数字 + 连字符段
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const BOT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
// RE Q4 硬数字：256,000 字符（按字符不按字节）、每 bot 250 条
const MAX_SKILL_CHARS = 256_000
const MAX_BOT_SKILLS = 250

/** frontmatter 只取 name/description 两个顶层标量（app/ui 不装 yaml 库，正则读首个 --- 块；
 * ponytail: 多行 description 取不全——当前写入口只有 name 单行，够用）。 */
function parseFrontmatter(text: string): { name?: string; description?: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (m === null) return {}
  const out: { name?: string; description?: string } = {}
  const name = m[1].match(/^name:\s*(.+)$/m)
  if (name !== null) out.name = name[1].trim()
  const desc = m[1].match(/^description:\s*(.+)$/m)
  if (desc !== null) out.description = desc[1].trim()
  return out
}

const skillsRoot = (dataDir: string, botId: string): string => join(dataDir, 'workspaces', botId, '.dsh', 'skills')

/** 列某 bot 私有根里的 skill（目录形态；扁平 <name>.md 跳过——T6 存的是目录形态，
 * ponytail: dsh 也认扁平文件，等有写入口产出它时再支持）。 */
async function listBotSkills(dataDir: string, botId: string): Promise<Array<{ name: string; description?: string }>> {
  const root = skillsRoot(dataDir, botId)
  let entries
  try { entries = await readdir(root, { withFileTypes: true }) } catch { return [] }
  const out: Array<{ name: string; description?: string }> = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    try {
      const text = await readFile(join(root, e.name, 'SKILL.md'), 'utf8')
      const fm = parseFrontmatter(text)
      out.push({ name: e.name, description: fm.description })
    } catch { /* 无 SKILL.md 或不可读 → 非法 skill，跳过 */ }
  }
  return out
}

async function assertBotDir(dataDir: string, botId: string): Promise<SkillsResult | null> {
  if (!BOT_ID_RE.test(botId)) return invalidArgs(`bad botId: ${botId}`)
  try {
    const st = await lstat(join(dataDir, 'workspaces', botId))
    if (!st.isDirectory()) return invalidArgs(`not a directory: ${botId}`)
  } catch { return fail('not-found', `bot workspace not found: ${botId}`) }
  return null
}

/** 源树只允许常规文件与目录（符号链接 = 把复制变引用，还能指到工作区外）。 */
async function assertPlainTree(dir: string): Promise<string | null> {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return `unreadable: ${dir}` }
  for (const e of entries) {
    if (e.isDirectory()) {
      const bad = await assertPlainTree(join(dir, e.name))
      if (bad !== null) return bad
    } else if (!e.isFile()) {
      return `non-regular entry: ${join(dir, e.name)}`
    }
  }
  return null
}

async function countBotSkills(dataDir: string, botId: string): Promise<number> {
  try {
    const entries = await readdir(skillsRoot(dataDir, botId), { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).length
  } catch { return 0 }
}

async function fileBytesEqual(a: string, b: string): Promise<boolean> {
  try {
    const [x, y] = await Promise.all([readFile(a), readFile(b)])
    return x.equals(y)
  } catch { return false }
}

async function opList(dataDir: string, botId: string): Promise<SkillsResult> {
  const onBot = await listBotSkills(dataDir, botId)
  let workspaces
  try { workspaces = await readdir(join(dataDir, 'workspaces'), { withFileTypes: true }) } catch { workspaces = [] }
  const candidates: Array<{ fromBotId: string; name: string; description?: string }> = []
  for (const ws of workspaces) {
    if (!ws.isDirectory() || ws.name === botId) continue
    for (const s of await listBotSkills(dataDir, ws.name)) {
      const mine = onBot.find((o) => o.name === s.name)
      if (mine !== undefined) {
        // 同名且 SKILL.md 字节相同 → 目标已有一模一样的，不作为候选
        if (await fileBytesEqual(
          join(skillsRoot(dataDir, botId), s.name, 'SKILL.md'),
          join(skillsRoot(dataDir, ws.name), s.name, 'SKILL.md'),
        )) continue
      }
      candidates.push({ fromBotId: ws.name, name: s.name, description: s.description })
    }
  }
  return { ok: true, value: { onBot, candidates } }
}

async function opEnable(dataDir: string, botId: string, fromBotId: string, name: string): Promise<SkillsResult> {
  if (!NAME_RE.test(name)) return invalidArgs(`bad skill name: ${name}`)
  if (botId === fromBotId) return invalidArgs('botId === fromBotId')
  for (const id of [botId, fromBotId]) {
    const bad = await assertBotDir(dataDir, id)
    if (bad !== null) return bad
  }
  const srcDir = join(skillsRoot(dataDir, fromBotId), name)
  try {
    const st = await lstat(srcDir)
    if (!st.isDirectory()) return invalidArgs(`source is not a directory: ${name}`)
    const md = await lstat(join(srcDir, 'SKILL.md'))
    if (!md.isFile()) return invalidArgs('source SKILL.md is not a regular file')
  } catch { return fail('not-found', `source skill not found: ${fromBotId}/${name}`) }
  const badTree = await assertPlainTree(srcDir)
  if (badTree !== null) return invalidArgs(`source tree has ${badTree}`)

  const srcText = await readFile(join(srcDir, 'SKILL.md'), 'utf8')
  // RE Q4：按字符（UTF-8 解码后的 string.length），不是字节
  if (srcText.length > MAX_SKILL_CHARS) return fail('too-large', `SKILL.md exceeds ${MAX_SKILL_CHARS} chars: ${srcText.length}`)
  if (await countBotSkills(dataDir, botId) >= MAX_BOT_SKILLS) {
    return fail('limit', `bot already has ${MAX_BOT_SKILLS} skills`)
  }

  // 撞名：依次 -2、-3…（RE Q4 函数 H）；副本 frontmatter 的 name 行改成最终名
  let finalName = name
  for (let n = 2; ; n++) {
    const target = join(skillsRoot(dataDir, botId), finalName)
    try { await lstat(target); finalName = `${name}-${n}`; continue } catch { break }
  }

  // 原子落位：先复制到扫描根之外的 staging，再 rename 进 skills/<最终名>
  const targetRoot = skillsRoot(dataDir, botId)
  await mkdir(targetRoot, { recursive: true })
  const staging = join(dataDir, 'workspaces', botId, '.dsh', '.skills-staging', randomUUID())
  await mkdir(staging, { recursive: true })
  try {
    await cp(srcDir, join(staging, 'skill'), { recursive: true, verbatimSymlinks: false })
    if (finalName !== name) {
      const mdPath = join(staging, 'skill', 'SKILL.md')
      const rewritten = (await readFile(mdPath, 'utf8')).replace(/^(name:\s*)(.+)$/m, `$1${finalName}`)
      await writeFile(mdPath, rewritten)
    }
    // rename 撞上并发创建 → 换下一个后缀（RE Q4 去重的并发面）
    for (let n = 2; ; n++) {
      try {
        await rename(join(staging, 'skill'), join(targetRoot, finalName))
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EEXIST' || code === 'ENOTEMPTY') {
          finalName = `${name}-${n}`
          const rewritten = (await readFile(join(staging, 'skill', 'SKILL.md'), 'utf8')).replace(/^(name:\s*)(.+)$/m, `$1${finalName}`)
          await writeFile(join(staging, 'skill', 'SKILL.md'), rewritten)
          continue
        }
        throw error
      }
    }
    return { ok: true, value: { name: finalName } }
  } catch (error) {
    // 失败不留半截副本
    await rm(join(targetRoot, finalName), { recursive: true, force: true }).catch(() => {})
    return fail('storage', `enable failed: ${String(error)}`)
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {})
  }
}

async function opDisable(dataDir: string, botId: string, name: string): Promise<SkillsResult> {
  if (!NAME_RE.test(name)) return invalidArgs(`bad skill name: ${name}`)
  const bad = await assertBotDir(dataDir, botId)
  if (bad !== null) return bad
  const target = join(skillsRoot(dataDir, botId), name)
  try {
    const st = await lstat(target)
    if (!st.isDirectory()) return invalidArgs(`not a directory: ${name}`)
  } catch { return fail('not-found', `skill not found on bot: ${name}`) }
  await rm(target, { recursive: true, force: true })
  return { ok: true, value: {} }
}

/** 注册：main/index.ts 里 ipcMain.handle('pbots:skills', (e, req) => { assertSender(e); return h(req) })。 */
export function registerSkills(deps: SkillsDeps): SkillsHandle {
  const handler = async (req: unknown): Promise<SkillsResult> => {
    if (typeof req !== 'object' || req === null) return invalidArgs('req must be an object')
    const { op } = req as { op?: unknown }
    if (op === 'list' || op === 'enable' || op === 'disable') {
      const { botId } = req as { botId?: unknown }
      if (typeof botId !== 'string') return invalidArgs('botId must be a string')
      if (op === 'list') {
        const bad = await assertBotDir(deps.dataDir, botId)
        if (bad !== null) return bad
        return opList(deps.dataDir, botId)
      }
      if (op === 'enable') {
        const { fromBotId, name } = req as { fromBotId?: unknown; name?: unknown }
        if (typeof fromBotId !== 'string' || typeof name !== 'string') return invalidArgs('fromBotId/name must be strings')
        return opEnable(deps.dataDir, botId, fromBotId, name)
      }
      const { name } = req as { name?: unknown }
      if (typeof name !== 'string') return invalidArgs('name must be a string')
      return opDisable(deps.dataDir, botId, name)
    }
    return invalidArgs(`unknown op: ${String(op)}`)
  }
  return { handler }
}
