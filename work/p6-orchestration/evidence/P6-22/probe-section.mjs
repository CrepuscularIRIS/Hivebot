// API probe adapted from deepseek-harness@ce7073d512:packages/core/system-prompt/tests/scoped.spec.ts.
// Uses the installed dsh peer dependencies, never a model provider.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const require = createRequire(realpathSync(new URL('../../../../app/sdk/node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js', import.meta.url)))
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')))
const { default: SystemPrompt, renderPrompt } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-system-prompt')))
const { createScope, scopeOf } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-scope')))
const ctx = new Context()
try {
  await ctx.plugin(SystemPrompt, {})
  const scopes = []
  await ctx.plugin(Object.assign((inner) => {
    for (const name of ['main', 'worker', 'ordinary']) scopes.push(createScope(inner, { name }))
  }, { inject: ['systemPrompt'] }))
  let calls = 0
  const off = scopes[0].ctx.systemPrompt.section({ name: 'p622:probe', order: 50, text: (context) => {
    calls++
    assert.equal(context.scope, scopeOf(scopes[0].ctx))
    return 'p622 function text scoped to main'
  } })
  for (let i = 0; i < scopes.length; i++) {
    const prompt = renderPrompt(await ctx.systemPrompt.assemble({ scope: scopeOf(scopes[i].ctx) }))
    assert.equal(prompt.includes('p622 function text scoped to main'), i === 0)
  }
  assert.equal(renderPrompt(await ctx.systemPrompt.assemble()).includes('p622 function text scoped to main'), false)
  assert.equal(calls, 1)
  off()
  assert.equal(renderPrompt(await ctx.systemPrompt.assemble({ scope: scopeOf(scopes[0].ctx) })).includes('p622 function text scoped to main'), false)
  console.log('PASS installed dsh@0.2.2-alpha.2: per-agent scope + function text; main=present worker=absent ordinary=absent unscoped=absent disposed=absent; providerCalls=1')
} finally {
  await ctx.fiber.dispose()
}
