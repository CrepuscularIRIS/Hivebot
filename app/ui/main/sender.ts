// 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:apps/desktop/src/ipc.ts:108-115
//     + apps/desktop/src/main.ts:492-497（assertDesktopSender + assertProductSender 合并）
// 改动：SCHEME 换 pbots-app；主窗口判定由闭包变量改为显式传入。
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron'

/** 本应用特权协议（生产页面的唯一可信 origin，PLAN 决策 7）。 */
export const SCHEME = 'pbots-app'

/** IPC 调用方必须来自主窗口的主 frame 且 origin 为 pbots-app://app/。 */
export function assertPbotsSender(event: IpcMainInvokeEvent | IpcMainEvent, mainWindow: BrowserWindow, extraWindows: readonly BrowserWindow[] = []): void {
  const senderFrame = event.senderFrame
  if (senderFrame === null) throw new Error('pbots: rejected IPC without a sender frame')
  const url = new URL(senderFrame.url)
  if (url.protocol !== `${SCHEME}:` || url.hostname !== 'app') {
    throw new Error('pbots: rejected IPC from an unowned renderer')
  }
  // B6：spotlight 窗与主窗同 preload 同协议（pbots-app://app/ 主 frame）——trust 等价，一并放行。
  const trusted = [mainWindow, ...extraWindows].filter((w) => !w.isDestroyed())
  const hit = trusted.some((w) => event.sender === w.webContents && senderFrame === w.webContents.mainFrame)
  if (!hit) {
    throw new Error('pbots: rejected IPC from a non-main window')
  }
}
