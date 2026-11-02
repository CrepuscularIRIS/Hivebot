// M2 `pbots:mux-port` 端口转交 + streamId 归属（U-12 实现；U-00 交付空 register 占位）。
import type { IpcMainEvent } from 'electron'
import type { DshConnection } from '../dsh/connect'

export interface M2Request { requestId: string }

export interface M2Deps { dsh?: DshConnection }

/** 空 register：收到请求只记日志（U-12 换成端口转交）。 */
export function registerM2Mux(_deps: M2Deps): (event: IpcMainEvent, req: M2Request) => void {
  return (event, req) => {
    console.warn(`pbots: mux-port requested but M2 bridge not installed (U-12): ${String(req.requestId)}`)
    void event
  }
}
