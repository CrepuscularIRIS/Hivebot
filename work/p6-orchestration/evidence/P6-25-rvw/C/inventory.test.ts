// Q2 前置：本仓 profile 下各 preset 实际给模型的工具表（fake LLM 记录 options.tools）。
import { writeFileSync } from 'node:fs'
import { afterAll, expect, it } from 'vitest'
import { launch, text, turn, type H } from './h.ts'

let h: H | undefined
afterAll(async () => { h?.closeFeed(); await h?.stop() })

it('tool inventory per preset', async () => {
  h = await launch()
  const out: Record<string, string[]> = {}
  for (const preset of [undefined, 'standard', 'cordis', 'ptc']) {
    const { sessionId } = await turn(h, { preset, calls: [] })
    const req = h.requests().find((r) => r.sessionId === sessionId)
    out[preset ?? '(default)'] = req?.toolNames ?? []
  }
  writeFileSync('/tmp/vfy-r-p625-c/inventory.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out))
  expect(Object.keys(out).length).toBe(4)
  void text
})
