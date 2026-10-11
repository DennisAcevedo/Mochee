// One hands-free question. The caller starts a fresh turn only after the tutor
// finishes answering. Empty recognition sessions never become demo questions.
export interface HandsFreeRecognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}
export type HandsFreeConstructor = new () => HandsFreeRecognizer
export function handsFreeConstructor(): HandsFreeConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: HandsFreeConstructor; webkitSpeechRecognition?: HandsFreeConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function listenHandsFree(Ctor: HandsFreeConstructor, callbacks: {
  onText(text: string): void
  onQuestion(text: string): void
  onError(message: string): void
}, timing = { silence: 1800, restart: 700, stop: 1500 }) {
  let cancelled = false
  let rec: HandsFreeRecognizer | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let tail: ReturnType<typeof setTimeout> | undefined
  let text = ''
  const detach = () => {
    clearTimeout(timer); clearTimeout(tail)
    if (!rec) return
    rec.onresult = rec.onend = rec.onerror = null
    try { rec.abort() } catch { /* already closed */ }
    rec = null
  }
  const fail = (error: string) => {
    if (cancelled) return
    cancelled = true; detach()
    callbacks.onError(error === 'not-allowed' || error === 'service-not-allowed'
      ? 'Microphone access was denied. Allow it in your browser, then select Hands-free again.'
      : error === 'audio-capture'
        ? 'No microphone is available. Check your mic or type your question.'
        : 'Voice recognition stopped. Select Hands-free to retry, or type your question.')
  }
  const finish = () => {
    if (cancelled) return
    detach()
    if (text.trim()) {
      cancelled = true
      callbacks.onQuestion(text.trim())
    } else timer = setTimeout(start, timing.restart)
  }
  const start = () => {
    if (cancelled) return
    try {
      rec = new Ctor()
      const session = rec
      rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true
      rec.onresult = (event) => {
        if (cancelled || rec !== session) return
        // Each event contains the complete session, including corrected interim words.
        text = Array.from(event.results, (r) => r[0]?.transcript ?? '').join(' ').trim()
        callbacks.onText(text)
        clearTimeout(timer)
        if (text) timer = setTimeout(() => {
          // Capture the final result after stop, rather than submitting an interim twice.
          tail = setTimeout(finish, timing.stop)
          try { rec?.stop() } catch { finish() }
        }, timing.silence)
      }
      rec.onend = () => { if (rec === session) finish() }
      rec.onerror = ({ error }) => {
        if (rec !== session) return
        if (error === 'no-speech') finish()
        else fail(error)
      }
      rec.start()
    } catch { fail('start-failed') }
  }
  start()
  return () => { cancelled = true; detach() }
}
