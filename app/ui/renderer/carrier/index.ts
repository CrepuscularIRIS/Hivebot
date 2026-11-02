// pbots carrier：dsh transport.createWebSocket 接缝（C §2.1——不改 streamBaseUrl、不设 ownsHost；
// 每次 createWebSocket 换一个 MessagePort）。产品接线由 U-15/U-21 的 installConnection 完成。
import { CarrierSocket, type CarrierEnv } from './mux-socket'

export function pageEnv(): CarrierEnv {
  return {
    windowRef: window,
    requestMuxPort(requestId: string): void {
      ;(window as { pbots?: { requestMuxPort(requestId: string): void } }).pbots?.requestMuxPort(requestId)
    },
    addMessageListener(listener) {
      const wrapped = listener as EventListener
      window.addEventListener('message', wrapped)
      return () => window.removeEventListener('message', wrapped)
    },
    randomId(): string { return crypto.randomUUID() },
  }
}

/** 上游 ConnectionWebSocketFactory 的 pbots 实现（vendor client/connection socket.ts 的接口形状）。 */
export function createPbotsWebSocket(_url: string): CarrierSocket {
  return new CarrierSocket(pageEnv())
}

export { CarrierSocket } from './mux-socket'
export type { CarrierEnv, CarrierWindowEvent, PortLike } from './mux-socket'
