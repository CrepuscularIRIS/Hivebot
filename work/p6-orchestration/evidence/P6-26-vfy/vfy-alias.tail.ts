
// verifier P6-26: session cwd spelled through a symlink alias of the real workspace.
// Base (P6-25.f1) reads in-zone files fine; check that the fd-bound read path does too.
it('vfy P6-26 alias cwd：别名工作区内 read / present 不误伤', { timeout: 240_000 }, async () => {
  const alias = join(TEST_ROOT, 'ws-alias')
  symlinkSync(WS, alias)
  const file = join(WS, `alias-${R}.txt`)
  writeFileSync(file, 'ALIAS-INSIDE-OK')
  const rt = await launchWo()
  const out: Record<string, unknown> = {}
  for (const [label, cwd, args, tool] of [
    ['cwd=alias read alias-path', alias, { file_path: join(alias, `alias-${R}.txt`) }, 'read'],
    ['cwd=alias read real-path', alias, { file_path: file }, 'read'],
    ['cwd=alias present', alias, { files: [{ path: join(alias, `alias-${R}.txt`) }] }, 'present'],
    ['cwd=real read', WS, { file_path: file }, 'read'],
  ] as const) {
    const sess = await scriptedSession(rt, cwd, [toolTurnCall(tool, args)])
    const r = toolResults(await sess.next('none'))[0]
    out[label] = { isError: r?.isError, text: r?.text?.slice(0, 160), asks: askedCount(rt, sess.sessionId) }
  }
  console.log('VFY-ALIAS ' + JSON.stringify(out))
  for (const v of Object.values(out) as Array<{ isError: boolean }>) expect(v.isError).toBe(false)
})
