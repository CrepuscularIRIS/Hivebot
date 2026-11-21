// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { routeMainBotPrompt, SUPERAGENT_ROUTER_VERSION } from '../../renderer-grok/frontend/src/recovered/features/conversation/workspace/superagent-router'

describe('B31 superagent main-bot router (pure functions)', () => {
  it('routes direct chat to main bot unchanged when router is on', () => {
    const out = routeMainBotPrompt({ enabled: true, mainBotId: 'main', targetId: 'main', text: 'hello there' })
    expect(out.kind).toBe('direct')
    if (out.kind === 'direct') expect(out.text).toBe('hello there')
  })

  it('routes delegation-shaped prompt to a worker session with worker- prefix', () => {
    const out = routeMainBotPrompt({ enabled: true, mainBotId: 'main', targetId: 'main', text: '@Design Atlas 去采集今天的设计情报' })
    expect(out.kind).toBe('delegate')
    if (out.kind === 'delegate') {
      expect(out.workerSessionId.startsWith('worker-')).toBe(true)
      expect(out.targetBotId).toBe('Design Atlas')
      expect(out.text).toContain('设计情报')
    }
  })

  it('router off (default) keeps legacy direct path for everything', () => {
    const out = routeMainBotPrompt({ enabled: false, mainBotId: 'main', targetId: 'main', text: '@Design Atlas do it' })
    expect(out.kind).toBe('direct')
  })

  it('non-main bots never route through superagent even when enabled', () => {
    const out = routeMainBotPrompt({ enabled: true, mainBotId: 'main', targetId: 'other', text: '@Design Atlas go' })
    expect(out.kind).toBe('direct')
  })

  it('exposes a stable version tag for e2e anchors', () => {
    expect(typeof SUPERAGENT_ROUTER_VERSION).toBe('string')
    expect(SUPERAGENT_ROUTER_VERSION).toBe('b31-v1')
  })
})
