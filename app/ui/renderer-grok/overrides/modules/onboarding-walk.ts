// T28：0.79.3 引导步骤序列与三页常量（探针：index.eager-app@380k dh 九步、Qge={tools,create}
// 恒滤除——walk 无这两步；三页受服务端实验开关，我们无实验服务按全开写死）。
// 数据源：work/grok-0.79.3-re/onboarding-0793-extract.json（i18n 逐字）。

export type WalkStep = 'meet' | 'computer-demo' | 'jobs' | 'role' | 'attribution' | 'connect'
export const WALK: readonly WalkStep[] = ['meet', 'computer-demo', 'jobs', 'role', 'attribution', 'connect']

export function next(step: WalkStep): WalkStep | 'hand-off' {
  const i = WALK.indexOf(step)
  return i < 0 || i + 1 >= WALK.length ? 'hand-off' : WALK[i + 1]!
}
export function prev(step: WalkStep): WalkStep | null {
  const i = WALK.indexOf(step)
  return i <= 0 ? null : WALK[i - 1]!
}

/** 三页 scene 摆位：0.79.3 编舞 @7708 里 attribution/role/connect 与 tools 同 case——映射给上游 scenePlacements。 */
export const SCENE_AS: Record<Exclude<WalkStep, 'meet' | 'computer-demo' | 'jobs'>, 'tools'> = { role: 'tools', attribution: 'tools', connect: 'tools' }

export interface RoleChoice { readonly id: string; readonly label: string }
export const ROLE: { readonly title: string; readonly choices: readonly RoleChoice[] } = {
  title: 'What will you be working on most?',
  choices: [
    { id: 'engineering', label: 'Engineering' }, { id: 'design', label: 'Design' }, { id: 'marketing', label: 'Marketing' },
    { id: 'customer-support', label: 'Customer Support' }, { id: 'product', label: 'Product' }, { id: 'ops-finance', label: 'Ops & Finance' },
    { id: 'recruiting-people', label: 'Recruiting & People' }, { id: 'sales', label: 'Sales' }, { id: 'productivity', label: 'Productivity' },
  ],
}

export const ATTRIBUTION: { readonly title: string; readonly choices: readonly RoleChoice[] } = {
  title: 'How did you first hear about Grok Bot?',
  choices: [
    { id: 'x', label: 'X (Twitter)' }, { id: 'instagram-facebook', label: 'Instagram or Facebook' }, { id: 'youtube', label: 'YouTube' },
    { id: 'tiktok', label: 'TikTok' }, { id: 'reddit', label: 'Reddit' }, { id: 'linkedin', label: 'LinkedIn' },
    { id: 'search-engine', label: 'Search engine' }, { id: 'app-stores', label: 'App stores' }, { id: 'tv-outdoor-ad', label: 'TV or outdoor ad' },
    { id: 'influencer-creator', label: 'Influencer or creator' }, { id: 'friend-colleague', label: 'Friend or colleague' }, { id: 'ai-assistant', label: 'AI assistant' },
  ],
}

export const CONNECT: { readonly title: string; readonly connectors: readonly string[]; readonly skip: string } = {
  title: 'Connect your apps',
  // shim 无账号邮箱（探针：按邮箱域给 Outlook 系或 Gmail 系）——固定 Gmail 系
  connectors: ['Gmail', 'Google Calendar'],
  skip: 'Skip for now',
}

/** 0.79.3 creatorContext：role 英文标签进设定句；没选 role 为空串（tools 恒 []，第二句不出现）。 */
import { TEMPLATES } from './onboarding-templates-0793'

export function creatorContext(roleId: string | null): string {
  if (roleId === null) return ''
  const label = ROLE.choices.find((c) => c.id === roleId)?.label
  return label === undefined ? '' : `The user primarily works in ${label} — tailor suggestions and work to that area.`
}

/** hand-off 建主 bot 的默认形象（探针 provision：name/shape/color 用默认值；我们取 blob/black——回执记出处）。 */
export const HANDOFF_DEFAULTS = { name: '', avatarShape: 'blob', avatarColor: 'black' } as const

/** T28c：底栏文案（extract nav 逐字）。 */
export const NAV = { nextDefault: 'Next', back: 'Back', continueLabel: 'Continue', skip: 'Skip', skipForNow: 'Skip for now' } as const

/** T28c：Fisher-Yates 洗牌（纯函数：不改入参；同 rand 序列输出确定——可测）。 */
export function shuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

/** T28b：该 role 的前 2 个模板 → createAgent 请求体（0.79.3 Me(role,2)——description=模板职责+creatorContext 拼接）。 */
export interface RoleUseCaseBotRequest { readonly origin: 'user'; readonly isKickstartRequested: boolean; readonly isAutomatic: boolean; readonly templateId: string; readonly name: string; readonly description: string }
export function roleUseCaseBots(roleId: string | null): RoleUseCaseBotRequest[] {
  if (roleId === null) return []
  const ctx = creatorContext(roleId)
  return TEMPLATES.filter((t) => t.role === roleId).slice(0, 2).map((t) => ({
    origin: 'user' as const, isKickstartRequested: true, isAutomatic: true, templateId: t.id, name: t.name,
    description: [t.description, ctx].filter((x) => x !== '').join(' '),
  }))
}
