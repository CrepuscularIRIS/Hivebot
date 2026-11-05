
// 独立补齐旧 verifier 真 Loader 探针：alias/real cwd × read/read_image/present/listDir。
it('vfy f1 alias/real cwd all read entrypoints and missing-file bad path', { timeout: 240_000 }, async () => {
  const alias = join(TEST_ROOT, 'matrix-alias')
  symlinkSync(WS, alias)
  const leaf = `matrix-${R}.txt`
  const png = `matrix-${R}.png`
  writeFileSync(join(WS, leaf), 'VFY-F1-CONTENT')
  writeFileSync(join(WS, png), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'))
  const rt = await launchWo()
  for (const [label, cwd] of [['alias', alias], ['real', WS]] as const) {
    for (const [tool, args, marker] of [
      ['read', { file_path: join(cwd, leaf) }, 'VFY-F1-CONTENT'],
      ['read', { file_path: join(WS, leaf) }, 'VFY-F1-CONTENT'],
      ['read_image', { file_path: join(cwd, png) }, ''],
      ['present', { files: [{ path: join(cwd, leaf) }] }, ''],
      ['read', { file_path: cwd }, leaf],
    ] as const) {
      const sess = await scriptedSession(rt, cwd, [toolTurnCall(tool, args)])
      const result = toolResults(await sess.next('none'))[0]
      const asks = askedCount(rt, sess.sessionId)
      console.log('VFY-F1-MATRIX ' + JSON.stringify({ label, tool, args, result, asks }))
      expect(result).toBeDefined()
      expect(result?.isError).toBe(false)
      if (marker) expect(result?.text).toContain(marker)
      expect(result?.text).not.toContain('/proc/self/fd')
      expect(asks).toBe(0)
    }
    const sess = await scriptedSession(rt, cwd, [toolTurnCall('read', { file_path: join(cwd, 'missing-vfy-file') })])
    const result = toolResults(await sess.next('none'))[0]
    console.log('VFY-F1-MISSING ' + JSON.stringify({ label, result }))
    expect(result?.isError).toBe(true)
    expect(result?.text).toContain('not found')
    expect(askedCount(rt, sess.sessionId)).toBe(0)
  }
})
