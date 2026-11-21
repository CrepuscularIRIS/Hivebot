// U-22 [GU-1/2/3] E2E 注入桥（经 main/index.ts 的 PBOTS_SPIKE_BRIDGE 分支挂载）：
// 让 pbots:api 在 main 侧抛错（ipcMain.handle reject → renderer invoke reject），
// 验证 renderer 兜底与界面不卡死。行为由 env 控制（launchShell 的 env 进 main 进程）：
//   PBOTS_THROW_API=all                     —— 所有 pbots:api 全抛（封面循环场景）
//   PBOTS_THROW_API=create-after-first      —— session/create 首调透传（boot 建主 bot），之后抛（对话框场景）
//   PBOTS_THROW_API=session/prompt,cancel   —— 逗号列表：指定方法恒抛（GU-2/GU-3 场景）
//   PBOTS_THROW_DELAY_MS=800                —— 抛错前延迟（GU-2「等待期新输入」竞态窗口）
// 其余方法透传 ctx.dsh.rpc；bots-meta 用内存版（spike 分支无 m3 store）；
// mux-port 故意不挂（CarrierSocket 停在 connecting → offline bar，不影响 pbots:api 路径）。
// 观测面 globalThis.__throwingBridge.calls（start() 重试循环活着的证伪断言用）。
export function register(ctx) {
  const mode = (process.env.PBOTS_THROW_API ?? '').trim()
  const delayMs = Number(process.env.PBOTS_THROW_DELAY_MS ?? '') || 0
  const throwAll = mode === 'all'
  const thrownMethods = new Set(mode.split(',').map((m) => m.trim()).filter((m) => m !== '' && m !== 'all' && m !== 'create-after-first'))
  const createAfterFirst = mode.includes('create-after-first')
  let createCount = 0
  const calls = []
  globalThis.__throwingBridge = { calls }

  const inject = async (method) => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    if (throwAll || thrownMethods.has(method)) throw new Error('injected failure (throwing-bridge)')
    if (createAfterFirst && method === 'session/create') {
      createCount += 1
      if (createCount > 1) throw new Error('injected failure (throwing-bridge)')
    }
  }

  ctx.ipcMain.handle('pbots:api', (event, req) => {
    try { ctx.assertSender(event) } catch { return { ok: false, error: { code: 'pbots/forbidden', message: 'bad sender' } } }
    const method = typeof req?.method === 'string' ? req.method : ''
    calls.push(method)
    return (async () => { await inject(method); return ctx.dsh.rpc(method, req.args) })()
  })

  let meta = { mainBotId: null, recipes: {} }
  ctx.ipcMain.handle('pbots:bots-meta', (event, req) => {
    try { ctx.assertSender(event) } catch { return { ok: false, error: { code: 'pbots/forbidden', message: 'bad sender' } } }
    if (req?.op === 'patch' && typeof req.mainBotId === 'string') meta = { ...meta, mainBotId: req.mainBotId }
    return { ok: true, value: meta }
  })
}
