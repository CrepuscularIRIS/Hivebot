// T7d review 高1 夹具：未经预建的旧工作区（两 skill 根不存在——模拟 T7d 预建前创建的既有 bot）。
import { expect } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { DshClient } from '../../examples/lib/client.mjs'

export async function createLegacySession(rt: { client: DshClient; home: string }): Promise<string> {
  const cwd = join(rt.home, 'legacy-ws')
  mkdirSync(cwd, { recursive: true }) // 只建 cwd，不建两 skill 根——旧工作区形态
  const { sessionId } = (await rt.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  expect(sessionId).toBeTypeOf('string')
  return sessionId
}
