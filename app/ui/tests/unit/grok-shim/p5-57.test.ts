// P5-57 · 新 UI 面的纯逻辑：bot 配置投影（D10c / D11）、市场三分类 + 文案（P-C P4/P5、U-26 ① wrapper 名）、
// 「New bot with this configuration」预填（D13–D15）、失效 bot 的侧栏预览（shim 记录投影 → 0.18 projectRendererAgent）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { botConfigOf } from '../../../renderer-grok/shim/src/bots'
import { toAgentRecord } from '../../../renderer-grok/shim/src/agents'
import { classify, installedNameOf, outcomeText, targetVersion, type Entry } from '../../../renderer-grok/overrides/modules/market-store'
import { installedBundles, modelOptions, monogram, text } from '../../../renderer-grok/overrides/modules/pbots-ui'
import { projectRendererAgent } from '../../../renderer-grok/frontend/src/production/model'
import { wrapperNameOf } from '../../../../sdk/src/market/wrapper-name.mjs'

const base = { recipes: {}, model: null, isMain: false, running: false }

describe('botConfigOf · header/summary preset + M3 recipes → 配置投影', () => {
  it('普通 preset：原样、无连接器、不只读', () => {
    expect(botConfigOf({ ...base, rawPreset: 'p2-alpha' })).toMatchObject({ preset: 'p2-alpha', connectors: [], readOnly: false, unknownRecipe: false })
  })
  it('p2temp + live recipe：基础 preset + 连接器', () => {
    const c = botConfigOf({ ...base, rawPreset: 'p2temp-1', recipes: { 'p2temp-1': { agentPreset: 'standard', connectors: ['@x/y'], live: true } } })
    expect(c).toMatchObject({ preset: 'standard', connectors: ['@x/y'], readOnly: false, unknownRecipe: false })
  })
  it('p2temp + live=false → 只读（D10c）；recipe 缺失 → 只读 + unknownRecipe', () => {
    expect(botConfigOf({ ...base, rawPreset: 'p2temp-1', recipes: { 'p2temp-1': { agentPreset: 'standard', connectors: ['@x/y'], live: false } } }).readOnly).toBe(true)
    expect(botConfigOf({ ...base, rawPreset: 'p2temp-9' })).toMatchObject({ preset: null, readOnly: true, unknownRecipe: true })
  })
  it('preset 未知（快照 / roster 未到）→ null，不判只读', () => {
    expect(botConfigOf({ ...base, rawPreset: null })).toMatchObject({ preset: null, readOnly: false })
  })
})

describe('失效 bot 侧栏预览（D10c 角标）', () => {
  it('preview → lastMessagePreview → 0.18 lastMessage', () => {
    const rec = toAgentRecord({ sessionId: 's', title: 'X', isMain: false, running: false, unread: false, activity: null, updatedAt: 1, preview: 'Connector unavailable' })
    expect(projectRendererAgent(rec)?.lastMessage).toBe('Connector unavailable')
    expect(projectRendererAgent(toAgentRecord({ sessionId: 's', title: 'X', isMain: false, running: false, unread: false, activity: null, updatedAt: 1 }))?.lastMessage).toBeUndefined()
  })
})

const entry = (over: Partial<Entry> = {}): Entry => ({ name: '@agent-infra/mcp-server-filesystem', versions: [{ version: '1.0.0', install: { spec: 'x@1.0.0' } }], ...over })

describe('市场三分类（P4）', () => {
  it('源名或 wrapper 名已装 → installed（U-26 ①），installedNameOf 给实际 bundle 名', () => {
    const e = entry()
    expect(classify(e, new Set([e.name]), undefined)).toBe('installed')
    const w = wrapperNameOf(e.name)
    expect(classify(e, new Set([w]), undefined)).toBe('installed')
    expect(installedNameOf(e, new Set([w]))).toBe(w)
    expect(installedNameOf(e, new Set())).toBeNull()
  })
  it('not-installable / 无 install.spec → browse；本会话 not-bundle → unsupported；其余 installable', () => {
    expect(classify(entry({ metadata: { keywords: ['not-installable'] } }), new Set(), undefined)).toBe('browse')
    expect(classify(entry({ versions: [{ version: '1' }] }), new Set(), undefined)).toBe('browse')
    expect(classify(entry(), new Set(), { kind: 'failed', code: 'not-bundle', message: '' })).toBe('unsupported')
    expect(classify(entry(), new Set(), { kind: 'failed', code: 'boom', message: '' })).toBe('installable')
    expect(classify(entry(), new Set(), undefined)).toBe('installable')
  })
  it('targetVersion：defaultVersion 指向的那条，否则首条', () => {
    const e = entry({ versions: [{ version: '2' }, { version: '1' }], defaultVersion: '1' })
    expect(targetVersion(e)?.version).toBe('1')
    expect(targetVersion(entry({ versions: [{ version: '2' }, { version: '1' }] }))?.version).toBe('2')
  })
  it('失败文案：not-bundle 专门说明；unconfirmed；其余 code: message', () => {
    expect(outcomeText({ kind: 'failed', code: 'not-bundle', message: '' })).toBe("This package isn't a supported connector bundle.")
    expect(outcomeText({ kind: 'unconfirmed', code: 'pbots/unavailable', message: '' })).toMatch(/Couldn't confirm/)
    expect(outcomeText({ kind: 'failed', code: 'E1', message: 'bad' })).toBe('E1: bad')
  })
})

describe('pbots-ui 投影小工具', () => {
  it('installedBundles：只要 installed 且未 missing', () => {
    expect(installedBundles([{ name: 'a', installed: true }, { name: 'b', installed: false }, { name: 'c', installed: true, availability: 'missing' }]).map((b) => b.name)).toEqual(['a'])
    expect(installedBundles(null)).toEqual([])
  })
  it('modelOptions：groups 拍平成 provider/model', () => {
    expect(modelOptions({ default: { model: 'm0' }, groups: [{ id: 'p', name: 'P', models: [{ id: 'm', name: 'M' }] }] }))
      .toEqual({ fallback: 'm0', options: [{ value: 'p/m', label: 'P · M', provider: 'p', model: 'm' }] })
  })
  it('text：en 优先；monogram：去 scope 首字', () => {
    expect(text({ 'zh-CN': '中', en: 'En' })).toBe('En')
    expect(text('s')).toBe('s')
    expect(monogram('@scope/pkg')).toBe('P')
  })
})

// T71：Connect 页去 DSH 字眼——源码契约格（本文件无 DOM 渲染基建；DOM 真行为由
// market.spec / t69 / t58 e2e 路径断言覆盖，此处钉源码面防漏网，与验收 3 grep 同面）。
describe('T71 Connect 页源码契约（DSH 字眼不上主页）', () => {
  const src = readFileSync(join(__dirname, '..', '..', '..', 'renderer-grok', 'overrides', 'modules', 'market-surface.tsx'), 'utf8')

  it('① Index sources 入口唯一（Installed 底部），主页 tools 段无此钮', () => {
    const hits = src.split('data-action="manage-index-sources"').length - 1
    expect(hits, 'manage-index-sources 恰一次（Installed 底部）').toBe(1)
  })

  it("② unsupported = Couldn't connect + details 折叠；browse 无 npm 说明", () => {
    expect(src).toContain("Couldn't connect")
    expect(src).toContain('<details')
    expect(src).toContain('data-install-error="not-bundle"')
    expect(src, '无 npm install coordinates 说明').not.toContain('no npm install coordinates')
  })

  it('④ T71c：Installed 入口无条件追加（错误/骨架/空/列表任何态 sourcesBtn 都在）', () => {
    expect(src, '无条件追加形态').toContain('body = <>{body}{sourcesBtn}</>')
    expect(src, '不再有 length===0 条件追加（错误态漏入口的根因）').not.toContain('if (m.bundles !== null && m.bundles.length === 0) body = <>{body}{sourcesBtn}</>')
  })

  it('③ 用户可见面无 Your plugins / npm / bundle / No catalog 字眼', () => {
    for (const banned of ['Your plugins', 'no npm install coordinates', 'connector bundle', 'No catalog configured']) {
      expect(src, `源码不含 ${banned}`).not.toContain(banned)
    }
  })
})
