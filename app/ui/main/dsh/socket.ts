// 原帧 mux socket（U-00 交付，U-11/U-12 消费，不得重写为丢弃未知帧的版本）。
// 对比 app/sdk/examples/lib/mux.mjs:115-121：上游 _receive 会静默丢未知 streamId 帧，
// 本层把未知帧交给 tap(known:false)，供 M2 原帧桥接管；全部帧都过 tap。
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'

export type MuxFrame =
  | { type: 'open'; streamId: string; endpoint: string; payload?: { args?: unknown } }
  | { type: 'item'; streamId: string; value?: unknown }
  | { type: 'end'; streamId: string }
  | { type: 'error'; streamId: string; error?: unknown }
  | { type: 'cancel'; streamId: string }

export type FrameDir = 'up' | 'down'
/** known=false 表示下行帧指向未在本 socket 注册的 streamId（未丢弃，交 tap）。 */
export type DshTap = (frame: MuxFrame, dir: FrameDir, known: boolean) => void

export class DshMuxSocketError extends Error {}

interface StreamWaiter { (frame: MuxFrame): void }

/** 单条 WebSocket 上的多路复用原帧通道。 */
export class DshMuxSocket {
  private readonly ws: WebSocket
  private readonly streams = new Map<string, StreamWaiter>()
  private tap: DshTap | undefined
  private deadCbs: Array<(err: Error) => void> = []
  private dead = false
  readonly openPromise: Promise<void>

  constructor(url: string, cookie: string) {
    this.ws = new WebSocket(url, { headers: { cookie } })
    this.openPromise = new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve())
      this.ws.once('error', reject)
    })
    this.ws.on('message', (data) => this.receive(String(data)))
    this.ws.on('error', (err) => this.die(new DshMuxSocketError(`mux connection lost: ${err.message}`)))
    this.ws.on('close', () => this.die(new DshMuxSocketError('mux connection closed')))
  }

  setTap(tap: DshTap): void { this.tap = tap }

  /** socket 死亡（断开/出错）回调一次；连接层据此重连。 */
  onDead(cb: (err: Error) => void): void { this.deadCbs.push(cb) }

  private die(err: Error): void {
    if (this.dead) return
    this.dead = true
    for (const waiter of this.streams.values()) waiter({ type: 'error', streamId: '', error: { message: err.message } })
    this.streams.clear()
    for (const cb of this.deadCbs) cb(err)
  }

  private receive(text: string): void {
    let msg: MuxFrame
    try { msg = JSON.parse(text) as MuxFrame } catch { return }
    if (typeof msg !== 'object' || msg === null || typeof (msg as MuxFrame).streamId !== 'string') return
    const waiter = this.streams.get(msg.streamId)
    this.tap?.(msg, 'down', waiter !== undefined)
    if (waiter === undefined) return // 未知 streamId：已交 tap，不丢弃也不误派
    if (msg.type === 'end' || msg.type === 'error') this.streams.delete(msg.streamId)
    waiter(msg)
  }

  private send(frame: MuxFrame): void {
    if (this.ws.readyState !== WebSocket.OPEN) throw new DshMuxSocketError('mux socket is not open')
    this.tap?.(frame, 'up', true)
    this.ws.send(JSON.stringify(frame))
  }

  /** 原帧直通（M2 桥用）：以调用方持有的 streamId 原样上行一帧（open/item/end/cancel）。 */
  sendRaw(frame: MuxFrame): void { this.send(frame) }

  /** 在新 streamId 上 open 一个流；下行帧经 onFrame 回调（含开流后的全部 item/end/error）。 */
  open(endpoint: string, args?: unknown): { streamId: string; onFrame(waiter: StreamWaiter): void; send(frame: MuxFrame): void; cancel(): void } {
    const streamId = randomUUID()
    let waiter: StreamWaiter | undefined
    this.streams.set(streamId, (frame) => waiter?.(frame))
    const sendOnStream = (frame: MuxFrame): void => {
      if (frame.type !== 'item' && frame.type !== 'end' && frame.type !== 'cancel') {
        throw new DshMuxSocketError('stream send only accepts item/end/cancel')
      }
      if (frame.streamId !== streamId) throw new DshMuxSocketError('frame streamId mismatch')
      this.send(frame)
    }
    this.send({ type: 'open', streamId, endpoint, payload: { args } })
    return {
      streamId,
      onFrame(w: StreamWaiter): void { waiter = w },
      send: sendOnStream,
      cancel(): void { sendOnStream({ type: 'cancel', streamId }) },
    }
  }

  /** main 侧自用流（如 $events 旁听）的快捷订阅。 */
  openStream(endpoint: string, args: unknown, onFrame: StreamWaiter): { streamId: string; cancel(): void } {
    const stream = this.open(endpoint, args)
    stream.onFrame(onFrame)
    return { streamId: stream.streamId, cancel: stream.cancel }
  }

  close(): void {
    this.dead = true
    this.ws.close()
    this.streams.clear()
  }
}
