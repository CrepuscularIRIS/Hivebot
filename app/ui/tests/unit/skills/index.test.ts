// T7a（L4-c）：pbots:skills list/enable/disable 的信任边界与复制快照语义。
// 格名与工单验收 1 一一对应（① list ② 复制 ③ 快照 ④ 撞名 ⑤ 上限 ⑥ 拒绝 ⑦ disable ⑧ 不半截）。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { registerSkills, type SkillsResult } from '../../../main/skills/index'
import { tmkdir } from '../../support/tmp-sweep'

const BOT_ID = /^[A-Za-z0-9_-]{1,128}$/

function value<T>(r: SkillsResult): T {
  if (!r.ok) throw new Error(`unexpected error: ${r.error.code} ${r.error.message}`)
  return r.value as T
}
function errCode(r: SkillsResult): string {
  if (r.ok) throw new Error('expected error')
  return r.error.code
}

/** 造一个 dataDir：bots['a']='bot-a-id' 等；skills 按 bot 分配。 */
function makeData(spec: Record<string, Array<[name: string, body?: string] | [name: string, body: string, extra: string]>>): string {
  const dataDir = tmkdir('bot-T7a-data-')
  for (const [botId, skills] of Object.entries(spec)) {
    const ws = join(dataDir, 'workspaces', botId)
    mkdirSync(ws, { recursive: true })
    for (const item of skills) {
      const [name, body = `body of ${name}`] = item
      const dir = join(ws, '.dsh', 'skills', name)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: skill ${name}\n---\n${body}\n`)
      if (item[2] !== undefined) {
        mkdirSync(join(dir, 'files'), { recursive: true })
        writeFileSync(join(dir, 'files', 'extra.txt'), item[2])
      }
    }
  }
  return dataDir
}

const skill = (dataDir: string, botId: string, name: string): string => join(dataDir, 'workspaces', botId, '.dsh', 'skills', name)
const skillCount = (dataDir: string, botId: string): number => {
  try { return readdirSync(join(dataDir, 'workspaces', botId, '.dsh', 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).length } catch { return 0 }
}
const stagingEmpty = (dataDir: string, botId: string): boolean => {
  const p = join(dataDir, 'workspaces', botId, '.dsh', '.skills-staging')
  return !existsSync(p) || readdirSync(p).length === 0
}

describe('T7a pbots:skills', () => {
  it('① list：onBot/candidates 正确；同名同字节候选剔除、同名不同字节保留', async () => {
    const dataDir = makeData({
      a: [['alpha', 'A1'], ['shared', 'SAME']],
      b: [['beta', 'B1'], ['shared', 'SAME'], ['gamma', 'B-GAMMA']],
      t: [['shared', 'SAME'], ['gamma', 'T-GAMMA'], ['mine', 'T1']],
    })
    const h = registerSkills({ dataDir }).handler
    const v = value<{ onBot: Array<{ name: string }>; candidates: Array<{ fromBotId: string; name: string }> }>(
      await h({ op: 'list', botId: 't' }))
    expect(v.onBot.map((s) => s.name).sort()).toEqual(['gamma', 'mine', 'shared'])
    const names = v.candidates.map((c) => `${c.fromBotId}/${c.name}`).sort()
    // a/shared、b/shared 与 t 同名同字节 → 剔除；b/gamma 同名不同字节 → 保留
    expect(names).toEqual(['a/alpha', 'b/beta', 'b/gamma'])
    const v2 = value<{ onBot: unknown[]; candidates: unknown[] }>(await h({ op: 'list', botId: 'a' }))
    expect(v2.onBot).toHaveLength(2)
  })

  it('② enable 复制：SKILL.md 与源字节相同（含子目录附带文件）', async () => {
    const dataDir = makeData({ a: [['flow', 'BODY', 'extra-content']] , t: [] })
    const h = registerSkills({ dataDir }).handler
    const v = value<{ name: string }>(await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'flow' }))
    expect(v.name).toBe('flow')
    expect(readFileSync(skill(dataDir, 't', 'flow', ) + '/SKILL.md', 'utf8')).toBe(readFileSync(skill(dataDir, 'a', 'flow') + '/SKILL.md', 'utf8'))
    expect(readFileSync(skill(dataDir, 't', 'flow') + '/files/extra.txt', 'utf8')).toBe('extra-content')
  })

  it('③ 快照：enable 后改源，目标不变', async () => {
    const dataDir = makeData({ a: [['flow', 'OLD']] , t: [] })
    const h = registerSkills({ dataDir }).handler
    await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'flow' })
    writeFileSync(skill(dataDir, 'a', 'flow') + '/SKILL.md', '---\nname: flow\ndescription: x\n---\nNEW\n')
    expect(readFileSync(skill(dataDir, 't', 'flow') + '/SKILL.md', 'utf8')).toContain('OLD')
  })

  it('④ 撞名：-2/-3 递增，frontmatter 改最终名，原有那份不动', async () => {
    const dataDir = makeData({ a: [['flow', 'FROM-A']] , t: [['flow', 'T-OWN']] })
    const h = registerSkills({ dataDir }).handler
    const v2 = value<{ name: string }>(await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'flow' }))
    expect(v2.name).toBe('flow-2')
    expect(readFileSync(skill(dataDir, 't', 'flow-2') + '/SKILL.md', 'utf8')).toContain('name: flow-2')
    expect(readFileSync(skill(dataDir, 't', 'flow-2') + '/SKILL.md', 'utf8')).toContain('FROM-A')
    expect(readFileSync(skill(dataDir, 't', 'flow') + '/SKILL.md', 'utf8')).toContain('T-OWN')
    const v3 = value<{ name: string }>(await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'flow' }))
    expect(v3.name).toBe('flow-3')
  })

  it('⑤ 上限：256,000 个「中」通过；256,001 字符 too-large；250 条 limit', async () => {
    const dataDir = makeData({ a: [['big', 'x'], ['small', 's']] , t: [] })
    // 源 a/big 改成两种尺寸各试一次
    const h = registerSkills({ dataDir }).handler
    const fmSmall = '---\nname: small\ndescription: d\n---\n'
    writeFileSync(skill(dataDir, 'a', 'small') + '/SKILL.md', fmSmall + '中'.repeat(256_000 - fmSmall.length))
    expect(value(await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'small' })).name).toBe('small')
    writeFileSync(skill(dataDir, 'a', 'big') + '/SKILL.md', `---\nname: big\ndescription: d\n---\n${'中'.repeat(256_001)}\n`)
    expect(errCode(await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'big' }))).toBe('pbots/too-large')
    // 250 上限：t 现有 1 个（small-2），再灌 248 个凑到 249，第 250 个成功后第 251 次应 limit
    for (let i = 0; i < 248; i++) {
      const ws = join(dataDir, 'workspaces', 't', '.dsh', 'skills', `pad-${i}`)
      mkdirSync(ws, { recursive: true })
      writeFileSync(join(ws, 'SKILL.md'), `---\nname: pad-${i}\ndescription: p\n---\npad\n`)
    }
    writeFileSync(skill(dataDir, 'a', 'big') + '/SKILL.md', `---\nname: big\ndescription: d\n---\n${'中'.repeat(10)}\n`)
    expect(skillCount(dataDir, 't')).toBe(249) // small(1)+248 pads；enable big 后才是 250
    expect(value(await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'big' })).name).toBe('big')
    expect(skillCount(dataDir, 't')).toBe(250)
    writeFileSync(skill(dataDir, 'a', 'small') + '/SKILL.md', `---\nname: small2\ndescription: d\n---\ns2\n`)
    // 同名冲突走 -2 也算新条目，同样触上限
    expect(errCode(await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'small' }))).toBe('pbots/limit')
  })

  it('⑥ 拒绝：穿越/非法名/自启用/符号链接 → invalid-args 且目标无新增；源缺 → not-found', async () => {
    const dataDir = makeData({ a: [['flow', 'A']] , t: [] })
    // 源树内放一个符号链接
    symlinkSync('/etc/hostname', skill(dataDir, 'a', 'flow') + '/evil')
    const h = registerSkills({ dataDir }).handler
    for (const req of [
      { op: 'enable', botId: '../x', fromBotId: 'a', name: 'flow' },
      { op: 'enable', botId: 't', fromBotId: 'a', name: '../x' },
      { op: 'enable', botId: 't', fromBotId: 'a', name: 'A_B' },
      { op: 'enable', botId: 't', fromBotId: 't', name: 'flow' },
      { op: 'enable', botId: 't', fromBotId: 'a', name: 'flow' }, // 源树含 evil 符号链接
    ]) {
      expect(errCode(await h(req)), JSON.stringify(req)).toBe('pbots/invalid-args')
    }
    expect(skillCount(dataDir, 't')).toBe(0)
    expect(errCode(await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'nope' }))).toBe('pbots/not-found')
    // SKILL.md 本身是符号链接
    rmSync(skill(dataDir, 'a', 'flow') + '/evil')
    rmSync(skill(dataDir, 'a', 'flow') + '/SKILL.md')
    symlinkSync('/etc/hostname', skill(dataDir, 'a', 'flow') + '/SKILL.md')
    expect(errCode(await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'flow' }))).toBe('pbots/invalid-args')
  })

  it('⑦ disable：删目标副本、源不动；非法名拒；不存在 not-found', async () => {
    const dataDir = makeData({ a: [['flow', 'A']] , t: [] })
    const h = registerSkills({ dataDir }).handler
    await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'flow' })
    expect(value(await h({ op: 'disable', botId: 't', name: 'flow' }))).toEqual({})
    expect(existsSync(skill(dataDir, 't', 'flow'))).toBe(false)
    expect(existsSync(skill(dataDir, 'a', 'flow'))).toBe(true)
    expect(errCode(await h({ op: 'disable', botId: 't', name: '../x' }))).toBe('pbots/invalid-args')
    expect(errCode(await h({ op: 'disable', botId: 't', name: 'flow' }))).toBe('pbots/not-found')
  })

  it('⑧ 不半截：成功与失败后 staging 为空或不存在', async () => {
    const dataDir = makeData({ a: [['ok1', 'A'], ['bad', 'B']] , t: [] })
    const h = registerSkills({ dataDir }).handler
    await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'ok1' })
    rmSync(skill(dataDir, 'a', 'bad') + '/SKILL.md')
    symlinkSync('/etc/hostname', skill(dataDir, 'a', 'bad') + '/SKILL.md')
    await h({ op: 'enable', botId: 't', fromBotId: 'a', name: 'bad' })
    expect(stagingEmpty(dataDir, 't')).toBe(true)
  })
})
