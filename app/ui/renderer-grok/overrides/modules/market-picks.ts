// T69：Connect apps 内置「Hivebot picks」目录源——开箱即有目录，不再空页。
// 方案（经理定）：内置 renderer 静态模块，不走 dsh setIndexes（dsh plugin-market 只收 http(s)）；
// 两类条目——①离线能装的（npm 包预置于 app/sdk devDependencies，安装走现有 wrapper）；
// ②原版目录常见但要登录的服务（needs-sign-in 关键字 → browse 分类 + 「Needs sign-in」trailing，
// Q-048-2=A：显示需要登录、不假装能点）。图标用现有 fallback，不搬品牌图（Q-054-3 默认 A）。
import type { Entry } from './market-store'

export const BUILTIN_PICKS_URL = 'builtin:hivebot-picks'
export const BUILTIN_PICKS_TITLE = 'Hivebot picks'

// 能装条目唯一数据源 = app/sdk/src/market/picks.json（T70：每个 bot 的差异在数据不在
// 代码；wrapper 侧同一份 JSON 查 launch，renderer 侧生成目录 Entry——不把 launch 带
// 进 Entry，启动配置不出 renderer）。版本 = sdk devDependencies 预置版本（单测读
// package.json 逐包比对防漂移——目录 spec 指向未预置版本会离线装失败）。
import PICKS_DATA from '../../../../sdk/src/market/picks.json'

/** 能装条目（断网探针过：起包 + tools/list ≥1，无 key 无登录）。listed:false = 不上目录
 * 但保留 wrapper 启动配置（T72：Filesystem 读写的是隐藏 workspace，撤目录不撤配置——
 * D5 真链路（装 → 实调）与第三方源装到它时的启动行为都靠这份配置）。 */
const installable: Entry[] = (PICKS_DATA as Array<{ name: string; version: string; title: string; description: string; keywords?: string[]; listed?: boolean }>)
  .filter((p) => p.listed !== false)
  .map((p) => ({
    name: p.name,
    title: p.title,
    description: p.description,
    metadata: { keywords: p.keywords ?? [] },
    versions: [{ version: p.version, install: { spec: `${p.name}@${p.version}` } }],
  }))

/** 要登录的常见服务（原版目录常客——本地无 OAuth 通路，如实标注，无 Connect 钮）。 */
const needsSignIn: Entry[] = [
  ['gmail', 'Gmail', 'Read and search your Gmail inbox.'], ['gcal', 'Google Calendar', 'See and create calendar events.'],
  ['gdrive', 'Google Drive', 'Browse and share files in Drive.'], ['slack', 'Slack', 'Send messages and read channels.'],
  ['github', 'GitHub', 'Issues, pull requests and repo search.'], ['notion', 'Notion', 'Search and update your pages.'],
  ['linear', 'Linear', 'Issues and project tracking.'], ['figma', 'Figma', 'Inspect frames and export assets.'],
  ['jira', 'Jira', 'Tickets and sprints.'], ['dropbox', 'Dropbox', 'Files and shared folders.'],
  ['box', 'Box', 'Enterprise file sharing.'], ['m365', 'Microsoft 365', 'Mail, calendar and OneDrive.'],
  ['canva', 'Canva', 'Designs and brand kits.'], ['airtable', 'Airtable', 'Bases, tables and views.'],
].map(([name, title, description]) => ({
  name: `signin:${name}`,
  title, description,
  metadata: { keywords: ['needs-sign-in', name] },
}))

export const PICKS: Entry[] = [...installable, ...needsSignIn]

/** 内置源本地检索（与 dsh pluginMarket/search 同口径：text 模糊过滤 + offset/limit 分页）。 */
const plain = (v: unknown): string => (typeof v === 'string' ? v : '')

export function searchPicks(opts: { text?: string; offset?: number; limit?: number } = {}): { entries: Entry[]; total: number; nextOffset: number | null } {
  const q = (opts.text ?? '').trim().toLowerCase()
  const hit = q === '' ? PICKS : PICKS.filter((e) => {
    const hay = [e.name, plain(e.title), plain(e.description), ...(e.metadata?.keywords ?? [])].join(' ').toLowerCase()
    return hay.includes(q)
  })
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? 50
  const slice = hit.slice(offset, offset + limit)
  return { entries: slice, total: hit.length, nextOffset: offset + limit < hit.length ? offset + limit : null }
}

export const isBuiltin = (url: string | null | undefined): boolean => url === BUILTIN_PICKS_URL
