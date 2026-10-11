import type { AskStart, AskStreamEvent } from '../../shared/askStream'
import { sanitizeReply, type AskReply, type AskRequest } from '../../shared/askTypes'

// Browser side of the ask box: POSTs to the dev server's Gemini proxy
// (server/geminiProxy.ts). Never sees the key. Returns null on any failure so
// the caller can fall back to the scripted reply.

const ASK = {
  url: '/api/ask',
  timeoutMs: 15_000,
} as const

export type AskSource = 'gemini' | 'mock'

export async function askGemini(request: AskRequest, signal?: AbortSignal): Promise<AskReply | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ASK.timeoutMs)
  const onAbort = () => ctrl.abort()
  if (signal?.aborted) { clearTimeout(timer); return null }
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(ASK.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return sanitizeReply(await res.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

// The streamed ask (shared/askStream.ts): `onStart` fires once, as soon as he
// can start talking (his moves and the answer's first sentence). Resolves with
// the whole reply and the part of it after that sentence, or null on any failure.
export async function askGeminiStream(
  request: AskRequest,
  onStart: (start: AskStart) => void,
  signal?: AbortSignal,
): Promise<{ reply: AskReply; rest: string } | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ASK.timeoutMs)
  const onAbort = () => ctrl.abort()
  if (signal?.aborted) { clearTimeout(timer); return null }
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(ASK.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, stream: true }),
      signal: ctrl.signal,
    })
    if (!res.ok || !res.body) return null
    // A server without streaming answers in one piece.
    if (!res.headers.get('content-type')?.includes('ndjson')) {
      const reply = sanitizeReply(await res.json())
      return reply && { reply, rest: reply.answer }
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return null // ended without a done event
      buffer += value
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as AskStreamEvent
        if (event.type === 'error') return null
        if (event.type === 'start') onStart(event)
        if (event.type === 'done') {
          const reply = sanitizeReply(event.reply)
          return reply && { reply, rest: typeof event.rest === 'string' ? event.rest : reply.answer }
        }
      }
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

// The scripted stand-in, shaped like a Gemini reply.
export const mockReply = (answer: string): AskReply => ({ answer, gesture: 'talk', focus: 'none', highlight: null })
