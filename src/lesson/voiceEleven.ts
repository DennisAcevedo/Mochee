import { stripMarks } from './markup'

// The tutor's ElevenLabs voice, fetched through the server proxy (/api/tts,
// key stays server-side). Each line's audio is kept as an object URL, so a
// prefetch, a replay or a back-step never fetches twice. When the proxy has no
// key or runs out of budget, the voice switches off for the visit and
// speech.ts falls back to the browser voice.

const VOICE = {
  route: '/api/tts',
  timeoutMs: 9_000,
  maxCached: 48, // object URLs kept; the oldest is revoked past this
  disableOn: [503, 429] as readonly number[], // no key, budget spent: stop asking this visit
} as const

const cache = new Map<string, Promise<string | null>>()
let disabled = false

const keyOf = (text: string) => stripMarks(text).replace(/\s+/g, ' ').trim()

async function load(text: string): Promise<string | null> {
  try {
    const res = await fetch(VOICE.route, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(VOICE.timeoutMs),
    })
    if (!res.ok) {
      if (VOICE.disableOn.includes(res.status)) disabled = true
      return null
    }
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}

function trim() {
  while (cache.size > VOICE.maxCached) {
    const [oldest, url] = cache.entries().next().value as [string, Promise<string | null>]
    cache.delete(oldest)
    void url.then((u) => u && URL.revokeObjectURL(u))
  }
}

// Audio URL for a line, or null when the ElevenLabs voice is unavailable.
export function voiceUrl(text: string): Promise<string | null> {
  const key = keyOf(text)
  if (disabled || !key) return Promise.resolve(null)
  let hit = cache.get(key)
  if (!hit) {
    hit = load(key).then((url) => {
      if (!url) cache.delete(key) // let a later call retry a transient failure
      return url
    })
    cache.set(key, hit)
    trim()
  }
  return hit
}

// Warm the next line while the current one plays.
export function prefetchVoice(text: string) {
  void voiceUrl(text)
}

export const elevenVoiceDisabled = () => disabled
