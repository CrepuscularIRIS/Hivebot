// Test-only deterministic seam: after pre-execute approval, before the fs zone wrapper.
import { appendFileSync, renameSync, symlinkSync } from 'node:fs'
import { ZoneCheckedFileSystem } from '../../src/policy/fs-zone.mjs'
import { zoneVerdictOf } from '../../src/policy/resolve.mjs'

export const inject = ['fs']
export function apply(ctx, config) {
  ctx.on('tools/execute', async (exec, next) => {
    const swap = config.swaps.find((s) => s.filePath === exec.arguments?.file_path)
    if (!swap) return next()
    appendFileSync(config.evidence, JSON.stringify({
      tool: exec.name,
      backend: ctx.get('fs') instanceof ZoneCheckedFileSystem,
      verdict: zoneVerdictOf(exec) ?? null,
    }) + '\n')
    renameSync(swap.directory, `${swap.directory}.original`)
    symlinkSync(swap.destination, swap.directory)
    return next()
  }, true)
}
