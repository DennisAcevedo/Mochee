import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { refuseCrossSite } from './requestGuard'

// Server-side ElevenLabs proxy for the tutor's voice: POST /api/tts {text} ->
// audio/mpeg on the dev and preview servers. The key is read per request (env
// first, then the repo-root key file), sent ONLY in the xi-api-key header, and
// never logged, echoed or returned. Every line is cached on disk by content
// hash, so a line is billed once and replays, prefetches and e2e reruns are
// free. A per-process character budget stops a runaway loop draining credits.

const CONFIG = {
  route: '/api/tts',
  keyFile: 'ElevenLabsAPI.txt',
  endpoint: 'https://api.elevenlabs.io/v1/text-to-speech',
  // Will ("Relaxed Optimist"): young, warm, smooth and upbeat; fits a small cheerful tutor.
  // Override with ELEVENLABS_VOICE_ID (e.g. Eric cjVigY5qzO86Huf0OWal for a smoother tenor).
  defaultVoice: 'bIHbv24MWmeRgasZH58o',
  // Turbo v2.5: natural and low latency; override with ELEVENLABS_MODEL.
  defaultModel: 'eleven_turbo_v2_5',
  outputFormat: 'mp3_44100_128',
  voiceSettings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true, speed: 1.04 },
  cacheDir: 'tmp/tts-cache',
  maxChars: 600, // one spoken line; longer text is refused so the client uses the browser voice
  budgetChars: 6_000, // billed characters per local day (the account has 10k)
  budgetFile: 'budget.json', // in cacheDir, so a dev-server restart does not reset the count
  timeoutMs: 12_000,
  maxBodyBytes: 8_192,
} as const

// The day's billed characters live on disk: Vite restarts this module whenever
// vite.config.ts or a server file changes, which would zero an in-memory count.
const today = () => new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD

function readBilled(dir: string): number {
  try {
    const saved = JSON.parse(readFileSync(join(dir, CONFIG.budgetFile), 'utf8')) as { date?: string; billed?: number }
    return saved.date === today() && Number.isFinite(saved.billed) ? Number(saved.billed) : 0
  } catch {
    return 0
  }
}

function writeBilled(dir: string, billed: number) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, CONFIG.budgetFile), JSON.stringify({ date: today(), billed }))
}
const inFlight = new Map<string, Promise<Buffer | number>>()

function readKey(root: string): string | null {
  let key = process.env.ELEVENLABS_API_KEY?.trim() ?? ''
  if (!key) {
    try {
      const lines = readFileSync(join(root, CONFIG.keyFile), 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      key = lines.find((l) => /^[A-Za-z0-9._-]{20,}$/.test(l)) ?? ''
    } catch {
      return null
    }
  }
  // A header-safe token only: anything else would make fetch throw with the value in the message.
  return /^[A-Za-z0-9._-]+$/.test(key) ? key : null
}

// Spoken text: no **bold** marks, collapsed whitespace.
const speakable = (v: unknown) => (typeof v === 'string' ? v.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim() : '')

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function sendAudio(res: ServerResponse, audio: Buffer, cache: 'hit' | 'miss') {
  res.statusCode = 200
  res.setHeader('content-type', 'audio/mpeg')
  res.setHeader('content-length', String(audio.length))
  res.setHeader('cache-control', 'private, max-age=86400')
  res.setHeader('x-tts-cache', cache)
  res.end(audio)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > CONFIG.maxBodyBytes) {
        reject(new Error('too-large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => reject(new Error('read')))
  })
}

// Calls ElevenLabs once; resolves to the audio or an HTTP status to report.
async function synthesize(key: string, voice: string, model: string, text: string): Promise<Buffer | number> {
  let upstream: Response
  try {
    upstream = await fetch(`${CONFIG.endpoint}/${encodeURIComponent(voice)}?output_format=${CONFIG.outputFormat}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'audio/mpeg', 'xi-api-key': key },
      body: JSON.stringify({ text, model_id: model, voice_settings: CONFIG.voiceSettings }),
      signal: AbortSignal.timeout(CONFIG.timeoutMs),
    })
  } catch {
    return 504
  }
  if (!upstream.ok) {
    void upstream.body?.cancel()
    return upstream.status
  }
  return Buffer.from(await upstream.arrayBuffer())
}

async function handleTts(root: string, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' })
  const refused = refuseCrossSite(req, 'application/json')
  if (refused) return sendJson(res, refused.status, { error: refused.error })

  let text = ''
  try {
    text = speakable((JSON.parse(await readBody(req)) as Record<string, unknown>)?.text)
  } catch {
    return sendJson(res, 400, { error: 'bad-request' })
  }
  if (!text) return sendJson(res, 400, { error: 'bad-request' })
  if (text.length > CONFIG.maxChars) return sendJson(res, 413, { error: 'too-long' })

  const voice = process.env.ELEVENLABS_VOICE_ID?.trim() || CONFIG.defaultVoice
  const model = process.env.ELEVENLABS_MODEL?.trim() || CONFIG.defaultModel
  const id = createHash('sha256').update(JSON.stringify([voice, model, CONFIG.voiceSettings, text])).digest('hex').slice(0, 32)
  const dir = join(root, CONFIG.cacheDir)
  const file = join(dir, `${id}.mp3`)

  try {
    return sendAudio(res, readFileSync(file), 'hit')
  } catch {
    // Not cached yet.
  }

  let pending = inFlight.get(id)
  if (!pending) {
    const key = readKey(root)
    if (!key) return sendJson(res, 503, { error: 'no-key' })
    // Read and write back to back with no await between, so concurrent requests cannot both pass on one count.
    const billed = readBilled(dir)
    if (billed + text.length > CONFIG.budgetChars) return sendJson(res, 429, { error: 'budget' })
    writeBilled(dir, billed + text.length)
    pending = synthesize(key, voice, model, text).finally(() => inFlight.delete(id))
    inFlight.set(id, pending)
  }
  const result = await pending
  if (typeof result === 'number') return sendJson(res, 502, { error: 'upstream', status: result })
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, result)
  } catch {
    // Serving still works without the disk cache.
  }
  return sendAudio(res, result, 'miss')
}

export function ttsMiddleware(getRoot: () => string): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.url?.split('?')[0] !== CONFIG.route) return next()
    handleTts(getRoot(), req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal' })
    })
  }
}

export function ttsProxy(): Plugin {
  let root = process.cwd()
  return {
    name: 'tts-proxy',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use(ttsMiddleware(() => root))
    },
    configurePreviewServer(server) {
      server.middlewares.use(ttsMiddleware(() => root))
    },
  }
}
