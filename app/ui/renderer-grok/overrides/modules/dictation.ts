// B12（输入面余量）：composer 听写——Web Speech 活流（webkitSpeechRecognition，Chromium 内建零后端）。
// 1.1.0 原版走 xAI 云语音流（pushAudio/dictation-text RPC，HiveBot 无该后端）：UI 语义对齐
// （provisional 临时段 / final 定稿两态，1.1.0 dictationProvisional 同位），通道换本地 Web Speech。
export interface DictationHandle {
  readonly active: () => boolean
  start: () => void
  stop: () => void
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function ctor(): SpeechRecognitionCtor | undefined {
  const w = globalThis as typeof globalThis & { webkitSpeechRecognition?: SpeechRecognitionCtor; SpeechRecognition?: SpeechRecognitionCtor }
  return w.webkitSpeechRecognition ?? w.SpeechRecognition
}

/** 开一段听写。onInterim 流式临时文本；onFinal 定稿追加；onState 录音态变化（含错误收尾）。 */
export function startDictation(handlers: {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onState: (recording: boolean) => void
}): DictationHandle {
  const C = ctor()
  if (C === undefined) {
    handlers.onState(false)
    return { active: () => false, start: () => {}, stop: () => {} } // 降级：无能力即 no-op（Review Focus 5）
  }
  const rec = new C()
  rec.lang = typeof navigator !== 'undefined' && navigator.language !== '' ? navigator.language : 'en-US'
  rec.continuous = true
  rec.interimResults = true
  rec.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const r = event.results[i]
      const text = r[0]?.transcript ?? ''
      if (r.isFinal) handlers.onFinal(text) // Review Focus 3：final 到来即追加，interim 每帧全量重建
      else interim += text
    }
    handlers.onInterim(interim)
  }
  let alive = true
  rec.onerror = () => { alive = false; handlers.onState(false) } // Review Focus 2：错误后复位态
  rec.onend = () => { alive = false; handlers.onInterim(''); handlers.onState(false) }
  rec.start()
  handlers.onState(true)
  return {
    active: () => alive,
    start: () => {},
    stop: () => { try { rec.stop() } catch { /* 已收 */ } },
  }
}
