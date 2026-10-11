import type { AskReply } from './askTypes.ts'

// The streamed /api/ask reply (POST with stream: true): newline-delimited JSON
// events, so the tutor can start talking at the first sentence instead of
// waiting for the whole answer. Shared by the server (server/geminiProxy.ts)
// and the browser (src/lesson/askGemini.ts); keep it free of browser and node APIs.
//
//   {"type":"start","gesture":..,"focus":..,"highlight":..,"first":"One sentence."}
//   {"type":"done","reply":{...AskReply},"rest":"The rest of the answer."}
//   {"type":"error","error":"..."}
//
// `start` comes at most once; `done` may come without it (a one-sentence
// answer, or one with no sentence break). `rest` is the answer after `first`.

export type AskStart = Pick<AskReply, 'gesture' | 'focus' | 'highlight'> & { first: string }

export type AskStreamEvent =
  | ({ type: 'start' } & AskStart)
  | { type: 'done'; reply: AskReply; rest: string }
  | { type: 'error'; error: string }

const STREAM = {
  minFirst: 12, // characters before a sentence break counts (no "Hi." on its own)
} as const

// A string field's value from a JSON object still being written: the
// characters decoded so far and whether its closing quote has arrived. Null
// until the field's opening quote is in. A half-written escape is left out.
export function partialString(json: string, key: string): { value: string; closed: boolean } | null {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(json)
  if (!m) return null
  let value = ''
  for (let i = m.index + m[0].length; i < json.length; i++) {
    const c = json[i]
    if (c === '"') return { value, closed: true }
    if (c !== '\\') {
      value += c
      continue
    }
    const e = json[i + 1]
    if (e === undefined) break
    if (e === 'u') {
      const hex = json.slice(i + 2, i + 6)
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break
      value += String.fromCharCode(parseInt(hex, 16))
      i += 5
      continue
    }
    value += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' } as Record<string, string>)[e] ?? e
    i += 1
  }
  return { value, closed: false }
}

// The answer's first whole sentence: up to the first . ! or ? that a space
// follows, outside a **bold** run, at least STREAM.minFirst characters in.
// Null until one has fully arrived.
export function firstSentence(answer: string): string | null {
  const re = /[.!?]+(?=\s)/g
  for (let m = re.exec(answer); m; m = re.exec(answer)) {
    const end = m.index + m[0].length
    const head = answer.slice(0, end)
    if (head.trim().length < STREAM.minFirst) continue
    if ((head.match(/\*\*/g)?.length ?? 0) % 2) continue // inside **bold**
    return head.trim()
  }
  return null
}

// The answer after its first sentence ('' if `first` is not its start: never say a line twice).
export function restAfter(answer: string, first: string): string {
  return answer.startsWith(first) ? answer.slice(first.length).trim() : ''
}
