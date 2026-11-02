// sender 来源校验表驱动单测（⑦(e) 的 null senderFrame / 非 pbots-app url 分支）。
import { describe, expect, it } from 'vitest'
import { assertPbotsSender } from '../../../main/sender'

interface FakeFrame { url: string }
interface FakeEvent { senderFrame: FakeFrame | null; sender: unknown }

const mainFrame = { url: 'pbots-app://app/' }
const mainWebContents = { mainFrame } as unknown as Electron.WebContents
const mainWindow = { isDestroyed: () => false, webContents: mainWebContents } as unknown as Electron.BrowserWindow

function ev(senderFrame: FakeFrame | null, sender: unknown = mainWebContents): Parameters<typeof assertPbotsSender>[0] {
  return { senderFrame, sender } as unknown as Parameters<typeof assertPbotsSender>[0]
}

describe('assertPbotsSender', () => {
  it('主窗口 mainFrame + pbots-app://app/ 放行', () => {
    // senderFrame 必须就是主窗口的 mainFrame（同一对象，D main.ts:495 的判等口径）
    expect(() => assertPbotsSender(ev(mainFrame), mainWindow)).not.toThrow()
  })
  it('senderFrame 为 null → 拒', () => {
    expect(() => assertPbotsSender(ev(null), mainWindow)).toThrowError(/without a sender frame/u)
  })
  it('url 非 pbots-app: 协议 → 拒（http/file/data 均算 unowned）', () => {
    for (const url of ['https://evil.example/x', 'file:///tmp/x.html', 'data:text/html,x']) {
      expect(() => assertPbotsSender(ev({ url }), mainWindow)).toThrowError(/unowned renderer/u)
    }
  })
  it('pbots-app:// 但 hostname 非 app → 拒', () => {
    expect(() => assertPbotsSender(ev({ url: 'pbots-app://other/' }), mainWindow)).toThrowError(/unowned renderer/u)
  })
  it('sender 非主窗口 webContents → 拒（non-main window）', () => {
    const other = { mainFrame: { url: 'pbots-app://app/' } } as unknown as Electron.WebContents
    expect(() => assertPbotsSender(ev({ url: 'pbots-app://app/' }, other), mainWindow)).toThrowError(/non-main window/u)
  })
  it('sender 是主窗口但非 mainFrame（iframe）→ 拒', () => {
    const iframe = { url: 'pbots-app://app/frame' }
    const event = { senderFrame: iframe, sender: mainWebContents }
    // 主窗口 mainFrame 与 senderFrame 不同对象即拒
    expect(() => assertPbotsSender(event as unknown as Parameters<typeof assertPbotsSender>[0], mainWindow)).toThrowError(/non-main window/u)
  })
})
