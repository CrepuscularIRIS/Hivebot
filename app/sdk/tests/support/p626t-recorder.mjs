// P6-26t: observe model-visible tool schemas without replacing the executor.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
export const name = 'p626t-recorder'
export function apply(ctx) {
  ctx.on('llm/stream', (options, next) => {
    appendFileSync(join(process.env.DSH_HOME, 'inventory.jsonl'), JSON.stringify({
      sessionId: options.sessionId,
      tools: (options.tools ?? []).map((tool) => tool.name),
      system: options.messages.filter((m) => m.role === 'system'),
    }) + '\n')
    return next()
  })
}
