import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { ASK_FOCUS, ASK_GESTURES, ASK_LIMITS, ASK_LINES, sanitizeReply, type AskTurn, type AskLesson } from '../shared/askTypes.ts'
import { refuseCrossSite } from './requestGuard.ts'

// Server-side Gemini proxy for the ask box: POST /api/ask on the dev and
// preview servers. The key is read per request (env first, then the repo-root
// key file), sent ONLY in the x-goog-api-key header, and never logged,
// echoed or returned. Upstream failures return a status code, never a body.

const CONFIG = {
  route: '/api/ask',
  keyFile: 'gemini_API.txt',
  defaultModel: 'gemini-3.8-flash', // newest flash on the key's model list (2026-10-10); override with GEMINI_MODEL
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  timeoutMs: 14_000, // under the client's 15 s budget
  maxBodyBytes: 16_384,
  temperature: 0.7,
  maxOutputTokens: 512,
  thinkingLevel: 'low', // Gemini 3.x: keeps answers fast (3.8 Flash rejects 'minimal'); 2.5 models get thinkingBudget 0 instead
} as const

// Exported for tests/server/askPrompt.test.ts.
export const SYSTEM_INSTRUCTION = [
  'You are Mochee, a cheerful, encouraging computer-science tutor who stands beside one browser window on the student\'s left. Its tabs hold:',
  'the NOTES (lecture PDFs), the BOARD (a worked FCFS example: P1 = 24 ms, P2 = P3 = 3 ms, all arrive at 0, Gantt chart, average wait (0+24+27)/3 = 17 ms) and a quick-check quiz.',
  'Answer the student in 1 to 3 short, spoken-friendly sentences (no lists, no markdown except **bold** for at most two key terms).',
  'Be correct: FCFS is non-preemptive and runs jobs in arrival order; SJF on the same jobs averages 3 ms; Round Robin with q = 4 averages 5.67 ms.',
  'If the student asks something off-topic, answer briefly and kindly steer back to CPU scheduling.',
  'Also choose: gesture (talk for most answers, point_left when the answer is in the notes or on the board (both are tabs of the browser window on the student\'s left; when speaking to the student, refer to it as "on your left"), hop for a fun fact, think for a tricky idea, shrug for "it depends" or a common mistake, celebrate ONLY when praising something the student got right);',
  'focus (notes, board or none) for the tab your answer refers to; highlight = the single notes line id that best supports the answer, or "none".',
  'Notes lines you can highlight:',
  ...ASK_LINES.map((l) => `- ${l.id} (${l.tab}): ${l.text}`),
].join('\n')

// Study on a notebook (a lesson built from an uploaded document): the same
// tutor and window, but about that document. Its notes and board are not the
// built-in ones, so nothing is highlighted. Exported for tests/server/askPrompt.test.ts.
export function notebookInstruction(title: string, topics: string[]): string {
  const list = topics.length ? topics.join('; ') : 'not listed'
  return [
    `You are Mochee, a cheerful, encouraging tutor teaching the student from their own document, "${title}". Its topics, in order: ${list}.`,
    'You stand beside one browser window on the student\'s left. Its tabs hold the NOTES (key lines from the document for the current topic), the BOARD (the rule, formula or worked example for that topic) and a quick-check quiz.',
    'Answer the student in 1 to 3 short, spoken-friendly sentences (no lists, no markdown except **bold** for at most two key terms).',
    'Ground your answer in the notes and board shown and the document\'s topics. If the document does not cover the question, say so briefly and give a short general answer.',
    `If the student asks something off-topic, answer briefly and kindly steer back to "${title}".`,
    'Also choose: gesture (talk for most answers, point_left when the answer is in the notes or on the board (both are tabs of the browser window on the student\'s left; when speaking to the student, refer to it as "on your left"), hop for a fun fact, think for a tricky idea, shrug for "it depends" or a common mistake, celebrate ONLY when praising something the student got right);',
    'focus (notes, board or none) for the tab your answer refers to; highlight = "none" always.',
  ].join('\n')
}

// Play mode: the hangout room. No lesson, no browser: he is a chill, chatty
// buddy who hangs out, jokes around and points the student at the fun stuff.
// Exported for tests/server/askPrompt.test.ts.
export const PLAY_INSTRUCTION = [
  'You are Mochee, a small, cheerful 3D buddy hanging out with the student in the PLAY ROOM: a chill space with a basketball hoop, no lessons and no browser window.',
  'Here you are relaxed and conversational, like a friend: chat about anything, joke around, be playful and curious about the student, and keep the vibe easy. Do not quiz, lecture or steer back to the lesson unless the student asks about it.',
  'If the student asks a real question (homework, CPU scheduling, anything), answer it casually and briefly, then keep hanging out.',
  'When it fits naturally (not every reply), remind them what the room is for: the Emotes button makes you dance, wave, shoot hoops, high five and more; the Shop is where they spend the coins they earn in Study on new dances and things to customize the room.',
  'Answer in 1 to 3 short, spoken-friendly sentences (no lists, no markdown except **bold** for at most one word).',
  'Also choose: gesture (talk for most replies, hop when excited or joking, celebrate when hyping the student up, shrug for "who knows", think for a tricky question; never point_left or point_right, there is no window here);',
  'focus = none and highlight = "none" always.',
].join('\n')

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    gesture: { type: 'STRING', enum: [...ASK_GESTURES] },
    focus: { type: 'STRING', enum: [...ASK_FOCUS] },
    highlight: { type: 'STRING', enum: [...ASK_LINES.map((l) => l.id), 'none'] },
  },
  required: ['answer', 'gesture', 'focus', 'highlight'],
  propertyOrdering: ['answer', 'gesture', 'focus', 'highlight'],
}

// The key file may hold just the key, or labelled lines ("API Key" then the key).
function parseKeyFile(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 1) return lines[0]
  const label = lines.findIndex((l) => /^api[\s_-]*key\b/i.test(l))
  if (label >= 0 && lines[label + 1]) return lines[label + 1]
  return lines.find((l) => /^[A-Za-z0-9._-]{30,}$/.test(l)) ?? ''
}

function readKey(root: string): string | null {
  let key = process.env.GEMINI_API_KEY?.trim() ?? ''
  if (!key) {
    try {
      key = parseKeyFile(readFileSync(join(root, CONFIG.keyFile), 'utf8'))
    } catch {
      return null
    }
  }
  // A header-safe token only: anything else would make fetch throw with the value in the message.
  return /^[A-Za-z0-9._-]+$/.test(key) ? key : null
}

function thinkingConfig(model: string) {
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: CONFIG.thinkingLevel }
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 }
  return undefined
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
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

// The notebook a question is about, trimmed to the limits; null for the built-in lesson or a malformed one.
function readLesson(raw: unknown): AskLesson | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = clip(r.title, ASK_LIMITS.lessonTitle)
  if (!title) return null
  const topics = (Array.isArray(r.topics) ? r.topics : [])
    .map((t) => clip(t, ASK_LIMITS.topic))
    .filter(Boolean)
    .slice(0, ASK_LIMITS.topics)
  return { title, topics }
}

function buildContents(question: string, context: Record<string, unknown>, history: unknown, play = false) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((t): t is AskTurn => !!t && typeof t === 'object' && (t.who === 'student' || t.who === 'tutor'))
    .slice(-ASK_LIMITS.history)
    .map((t) => ({ role: t.who === 'student' ? 'user' : 'model', parts: [{ text: clip(t.text, ASK_LIMITS.historyText) || '...' }] }))
  // The API wants the conversation to start with a user turn.
  while (turns.length && turns[0].role !== 'user') turns.shift()
  // In the play room there is no lesson on screen to describe.
  if (play) return [...turns, { role: 'user', parts: [{ text: `In the play room. Student says: ${question}` }] }]
  const situation = [
    `Current lesson step: ${clip(context.step, ASK_LIMITS.context) || 'none'}`,
    `Notes window shows: ${clip(context.notes, ASK_LIMITS.context) || 'nothing'}`,
    `Board window shows: ${clip(context.board, ASK_LIMITS.context) || 'nothing'}`,
  ].join('\n')
  return [...turns, { role: 'user', parts: [{ text: `${situation}\n\nStudent asks: ${question}` }] }]
}

async function handleAsk(root: string, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' })
  const refused = refuseCrossSite(req, 'application/json')
  if (refused) return send(res, refused.status, { error: refused.error })

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(await readBody(req)) as Record<string, unknown>
  } catch {
    return send(res, 400, { error: 'bad-request' })
  }
  const question = clip(payload?.question, ASK_LIMITS.question)
  if (!question) return send(res, 400, { error: 'bad-request' })
  const context = payload.context && typeof payload.context === 'object' ? (payload.context as Record<string, unknown>) : {}
  const play = payload.mode === 'play'
  const notebook = readLesson(payload.lesson)
  const instruction = play ? PLAY_INSTRUCTION : notebook ? notebookInstruction(notebook.title, notebook.topics) : SYSTEM_INSTRUCTION

  const key = readKey(root)
  if (!key) return send(res, 503, { error: 'no-key' })
  const model = process.env.GEMINI_MODEL?.trim() || CONFIG.defaultModel
  const thinking = thinkingConfig(model)
  const started = performance.now()
  const disconnected = new AbortController()
  const onClose = () => { if (!res.writableFinished) disconnected.abort() }
  res.once('close', onClose)
  res.once('finish', () => res.off('close', onClose))
  if (res.destroyed) return

  let upstream: Response
  try {
    upstream = await fetch(`${CONFIG.endpoint}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: buildContents(question, context, payload.history, play),
        generationConfig: {
          temperature: CONFIG.temperature,
          maxOutputTokens: CONFIG.maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      }),
      signal: AbortSignal.any([disconnected.signal, AbortSignal.timeout(CONFIG.timeoutMs)]),
    })
  } catch (e) {
    if (disconnected.signal.aborted) return
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return send(res, 504, { error: timedOut ? 'timeout' : 'network' })
  }
  if (!upstream.ok) {
    void upstream.body?.cancel()
    return send(res, 502, { error: 'upstream', status: upstream.status })
  }

  try {
    const data = (await upstream.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
    const parsed = JSON.parse(text) as Record<string, unknown>
    const reply = sanitizeReply({ ...parsed, highlight: parsed.highlight === 'none' ? null : parsed.highlight, model })
    if (!reply) return send(res, 502, { error: 'empty' })
    res.setHeader('server-timing', `gemini;dur=${(performance.now() - started).toFixed(1)}`)
    return send(res, 200, reply)
  } catch {
    return send(res, 502, { error: 'parse' })
  }
}

function middleware(getRoot: () => string): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.url?.split('?')[0] !== CONFIG.route) return next()
    handleAsk(getRoot(), req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: 'internal' })
    })
  }
}

export function geminiProxy(): Plugin {
  let root = process.cwd()
  return {
    name: 'gemini-proxy',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use(middleware(() => root))
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(() => root))
    },
  }
}
