import { z } from 'zod'
import { DOCS_CONFIG } from './config.ts'
import { decodeFilename, normalizePageText } from './text.ts'
import type { GeminiFn } from './tutor.ts'

// Recorded lectures: one Gemini call with the audio inline transcribes it into
// paragraphs; the transcript is split into ~lecturePageChars pages on
// paragraph, then sentence, boundaries so the PDF pipeline (chunks, FTS,
// topics, quiz) indexes it like any document.

const TRANSCRIPT_SCHEMA = {
  type: 'OBJECT',
  properties: { speech: { type: 'BOOLEAN' }, paragraphs: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['speech', 'paragraphs'],
}

const TranscriptOut = z.object({ speech: z.boolean(), paragraphs: z.array(z.string()) })

const SYSTEM = [
  'First decide whether a person is audibly speaking words in this recording. Set speech to false for silence, noise, tones, or music without words.',
  'When speech is false, return an empty paragraphs list. Never invent, guess, or fill in words that were not spoken.',
  'When speech is true, transcribe the recorded lecture word for word into plain text.',
  'Split it into paragraphs where the speaker changes subject or pauses. No headings, no summaries, no timestamps, no speaker labels.',
].join('\n')

// True when `bytes` is a 16-bit PCM WAV whose loudest sample is below the
// silence threshold. Any other format, or a header we cannot read, is false:
// Gemini's speech flag is the check for those.
export function isSilentPcmWav(bytes: Uint8Array, peakLimit: number = DOCS_CONFIG.lectureSilencePeak): boolean {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') return false
  let pcm16 = false
  for (let at = 12; at + 8 <= b.length; ) {
    const id = b.toString('latin1', at, at + 4)
    const size = b.readUInt32LE(at + 4)
    const body = at + 8
    if (id === 'fmt ' && body + 16 <= b.length) pcm16 = b.readUInt16LE(body) === 1 && b.readUInt16LE(body + 14) === 16
    if (id === 'data') {
      if (!pcm16) return false
      const end = Math.min(b.length, body + size) - 1
      const limit = peakLimit * 32768
      for (let i = body; i < end; i += 2) if (Math.abs(b.readInt16LE(i)) >= limit) return false
      return true
    }
    at = body + size + (size % 2)
  }
  return false
}

// 'audio/webm;codecs=opus' -> 'audio/webm'; null when not an accepted audio type.
export function audioType(contentType: string): string | null {
  const raw = contentType.split(';')[0].trim().toLowerCase()
  const type = DOCS_CONFIG.lectureAudioAliases[raw] ?? raw
  return (DOCS_CONFIG.lectureAudioTypes as readonly string[]).includes(type) ? type : null
}

export function lectureTitle(filename: string, now: Date = new Date()): string {
  const base = (decodeFilename(filename).split(/[\\/]/).pop() ?? '')
    .replace(/\.(webm|ogg|wav|mp4|m4a|mp3|aac|flac)$/i, '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ._()\-,&'+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DOCS_CONFIG.titleMaxChars)
    .trim()
  return base || `Lecture ${now.toISOString().slice(0, 10)}`
}

// Pieces no longer than max: sentences, and a hard cut for a run-on sentence.
function pieces(paragraph: string, max: number): string[] {
  if (paragraph.length <= max) return [paragraph]
  const out: string[] = []
  for (const s of paragraph.split(/(?<=[.!?])\s+/)) {
    for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max))
  }
  return out
}

// Paragraphs packed into pages of at most `max` chars, paragraph breaks kept.
export function paginate(paragraphs: string[], max: number = DOCS_CONFIG.lecturePageChars): string[] {
  const pages: string[] = []
  let page = ''
  for (const para of paragraphs.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
    for (const [j, piece] of pieces(para, max).entries()) {
      const sep = page ? (j === 0 ? '\n\n' : ' ') : ''
      if (page && page.length + sep.length + piece.length > max) {
        pages.push(page)
        page = piece
      } else page += sep + piece
    }
  }
  if (page) pages.push(page)
  return pages.map(normalizePageText).filter(Boolean).slice(0, DOCS_CONFIG.limits.maxPages)
}

export type TranscribeOutcome = { ok: true; pages: string[] } | { ok: false; status: number; error: string }

export async function transcribe(opts: { bytes: Uint8Array; mimeType: string; key: string; gemini: GeminiFn }): Promise<TranscribeOutcome> {
  const res = await opts.gemini({
    key: opts.key,
    system: SYSTEM,
    user: 'Transcribe the attached lecture audio.',
    schema: TRANSCRIPT_SCHEMA,
    temperature: 0,
    maxOutputTokens: DOCS_CONFIG.lectureMaxOutputTokens,
    inline: { mimeType: opts.mimeType, base64: Buffer.from(opts.bytes).toString('base64') },
    timeoutMs: DOCS_CONFIG.lectureTimeoutMs,
  })
  if (!res.ok) return { ok: false, status: res.error === 'timeout' ? 504 : 502, error: res.error === 'timeout' ? 'timeout' : 'upstream' }
  const parsed = TranscriptOut.safeParse(res.json)
  if (!parsed.success) return { ok: false, status: 502, error: 'upstream' }
  if (!parsed.data.speech) return { ok: false, status: 422, error: 'no-text' }
  const pages = paginate(parsed.data.paragraphs)
  if (!pages.length) return { ok: false, status: 422, error: 'no-text' }
  return { ok: true, pages }
}
