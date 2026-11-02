// M1 `pbots:api` 白名单透传（U-11 实现；U-00 交付空 register 占位）。
import type { DshConnection, ConnectionRpcResult } from '../dsh/connect'

export interface M1Request { method: string; args?: unknown }
export type M1Result = ConnectionRpcResult

export interface M1Deps { dsh?: DshConnection }

/** 空 register：一切方法拒绝（U-11 换成白名单 + §2.2 约束）。 */
export function registerM1Api(_deps: M1Deps): (req: M1Request) => Promise<M1Result> {
  return async () => ({
    ok: false,
    error: { code: 'pbots/forbidden', message: 'M1 api bridge not installed (U-11)', details: {} },
  })
}
