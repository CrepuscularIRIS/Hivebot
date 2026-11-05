// verifier 探针插件（仅测试）：真 Loader 里记录 ctx.fs 的真实类型，并在 tools/execute
// 「追加」位置（区域包装之后、tool.execute 之前 = inner 接缝）按配置换链。
import { appendFileSync, renameSync, symlinkSync } from 'node:fs'
import { ZoneCheckedFileSystem } from '/tmp/bot-wt/P6-25f1/app/sdk/src/policy/fs-zone.mjs'
import { zoneVerdictOf } from '/tmp/bot-wt/P6-25f1/app/sdk/src/policy/resolve.mjs'

export const name = 'vfy-seam'
export const inject = ['fs']
export function apply(ctx, config) {
  const fs = ctx.get('fs')
  appendFileSync(config.evidence, JSON.stringify({ boot: true, ctor: fs?.constructor?.name, zone: fs instanceof ZoneCheckedFileSystem }) + '\n')
  ctx.on('tools/execute', async (exec, next) => {
    const swap = (config.swaps ?? []).find((s) => s.filePath === exec.arguments?.file_path)
    appendFileSync(config.evidence, JSON.stringify({ tool: exec.name, file: exec.arguments?.file_path, zone: ctx.get('fs') instanceof ZoneCheckedFileSystem, verdict: zoneVerdictOf(exec) ?? null, swapped: Boolean(swap) }) + '\n')
    if (swap) { renameSync(swap.directory, `${swap.directory}.orig`); symlinkSync(swap.destination, swap.directory) }
    return next()
  })
}
