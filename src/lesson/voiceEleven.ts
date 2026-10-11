import { DEFAULT_TUTOR_VOICE, type TutorVoice } from '../../shared/voices'
import { stripMarks } from './markup'
import type { LatencyTrace } from './latency'

const VOICE = { route: '/api/tts', timeoutMs: 14_000, maxCached: 48 }
const cache = new Map<string, string>()
const warming = new Map<string, Promise<string | null>>()
let disabled = false
const clean = (text: string) => stripMarks(text).replace(/\s+/g, ' ').trim()

// The voice the lesson page's tutor speaks with (LessonPage sets it per tutor).
let current: TutorVoice = DEFAULT_TUTOR_VOICE
export function setTutorVoice(voice: TutorVoice) {
  current = voice
}
// Cache key: the same line in another voice is another clip.
const keyOf = (text: string, voice: TutorVoice = current) => `${voice}|${clean(text)}`

function remember(key: string, blob: Blob): string {
  const existing = cache.get(key)
  if (existing) return existing
  const url = URL.createObjectURL(blob)
  cache.set(key, url)
  while (cache.size > VOICE.maxCached) {
    const [oldest, value] = cache.entries().next().value!
    cache.delete(oldest)
    URL.revokeObjectURL(value)
  }
  return url
}

async function request(text: string, voice: TutorVoice, signal: AbortSignal) {
  const res = await fetch(VOICE.route, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, voice }), signal,
  })
  if (!res.ok) {
    if (res.status === 503 || res.status === 429) disabled = true
    await res.body?.cancel()
    throw new Error('voice-unavailable')
  }
  return res
}

// Prefetch uses the same endpoint/cache, but never creates a player or MediaSource.
export function voiceUrl(text: string, voice: TutorVoice = current): Promise<string | null> {
  const line = clean(text)
  const key = keyOf(line, voice)
  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached)
  if (disabled || !line) return Promise.resolve(null)
  let pending = warming.get(key)
  if (!pending) {
    pending = request(line, voice, AbortSignal.timeout(VOICE.timeoutMs))
      .then(async (res) => remember(key, await res.blob()))
      .catch(() => null)
      .finally(() => warming.delete(key))
    warming.set(key, pending)
  }
  return pending
}

export interface VoiceClip {
  url: string
  completed: Promise<void>
  dispose: () => void
}

// Event waits are abortable, including sourceopen if cancelled before attaching.
function event(target: EventTarget, name: string, signal: AbortSignal, action?: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const clean = () => {
      target.removeEventListener(name, ok)
      target.removeEventListener('error', fail)
      signal.removeEventListener('abort', fail)
    }
    const ok = () => { clean(); resolve() }
    const fail = () => { clean(); reject(new Error('audio-interrupted')) }
    if (signal.aborted) return fail()
    target.addEventListener(name, ok, { once: true })
    target.addEventListener('error', fail, { once: true })
    signal.addEventListener('abort', fail, { once: true })
    try { action?.() } catch { fail() }
  })
}

export async function prepareVoice(text: string, signal: AbortSignal, trace: LatencyTrace): Promise<VoiceClip | null> {
  const voice = current
  const line = clean(text)
  const key = keyOf(line, voice)
  trace.mark('ttsRequested')
  const cached = cache.get(key)
  if (cached) {
    trace.mark('audioCached')
    return { url: cached, completed: Promise.resolve(), dispose() {} }
  }
  if (disabled || !line || signal.aborted) return null
  const cancel = new AbortController()
  const combined = AbortSignal.any([signal, cancel.signal, AbortSignal.timeout(VOICE.timeoutMs)])
  try {
    // Join server prefetches immediately, without waiting for their complete blob.
    const res = await request(line, voice, combined)
    trace.mark('audioHeaders')
    if (!res.body) throw new Error('empty-audio')
    if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported('audio/mpeg')) {
      const blob = await res.blob()
      trace.mark('audioDownloaded')
      return { url: remember(key, blob), completed: Promise.resolve(), dispose() { cancel.abort() } }
    }
    const media = new MediaSource()
    const url = URL.createObjectURL(media)
    const opened = event(media, 'sourceopen', combined)
    const completed = (async () => {
      const reader = res.body!.getReader()
      try {
        await opened
        const buffer = media.addSourceBuffer('audio/mpeg')
        const chunks: Uint8Array<ArrayBuffer>[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          trace.mark('audioFirstChunk')
          const bytes = new Uint8Array(value)
          chunks.push(bytes)
          await event(buffer, 'updateend', combined, () => buffer.appendBuffer(bytes))
        }
        if (!chunks.length) throw new Error('empty-audio')
        combined.throwIfAborted()
        media.endOfStream()
        remember(key, new Blob(chunks, { type: 'audio/mpeg' }))
        trace.mark('audioDownloaded')
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    })()
    // Playback handles errors too; cancellation can occur before that handler attaches.
    void completed.catch(() => {})
    return { url, completed, dispose() { cancel.abort(); URL.revokeObjectURL(url) } }
  } catch {
    cancel.abort()
    return null
  }
}

export function prefetchVoice(text: string) { void voiceUrl(text) }
export const elevenVoiceDisabled = () => disabled
