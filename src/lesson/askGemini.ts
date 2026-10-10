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

// The scripted stand-in, shaped like a Gemini reply.
export const mockReply = (answer: string): AskReply => ({ answer, gesture: 'talk', focus: 'none', highlight: null })
