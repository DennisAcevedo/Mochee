import { DOCS_CONFIG, STOPWORDS } from './config.ts'

// Pure text helpers: page normalisation, chunking, sentence splitting, query
// tokens and the quote verifier. No I/O, so the tests drive them directly.

export interface Chunk {
  id: string // `${documentId}:${page}:${start}-${end}`
  documentId: string
  page: number
  startOffset: number
  endOffset: number
  text: string
}

// NFKC, tabs/runs of spaces to one space, at most one blank line between paragraphs.
export function normalizePageText(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Folds case, typographic quotes/dashes and whitespace so a quote matches the
// stored text however the model spaced or capitalised it.
export function foldForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
}

// Strips wrapping quote marks and leading/trailing ellipses the model adds around a quote.
export function cleanQuote(q: string): string {
  return q
    .trim()
    .replace(/^["'‘’“”]+|["'‘’“”]+$/g, '')
    .replace(/^(\.\.\.|…)\s*|\s*(\.\.\.|…)$/g, '')
    .trim()
}

// True when the quote (after cleaning) is long enough and appears verbatim,
// modulo whitespace and case, in the chunk's stored text.
export function quoteInText(quote: string, text: string): boolean {
  const q = foldForMatch(cleanQuote(quote))
  if (q.length < DOCS_CONFIG.minQuoteChars || q.length > DOCS_CONFIG.maxQuoteChars) return false
  return foldForMatch(text).includes(q)
}

// Best place to end a chunk inside [lo, hi]: a paragraph break, then a sentence
// end, then any whitespace; hi when the text has none.
function breakPoint(text: string, lo: number, hi: number): number {
  const window = text.slice(lo, hi)
  const para = window.lastIndexOf('\n\n')
  if (para > 0) return lo + para
  let sentence = -1
  for (const m of window.matchAll(/[.!?](?=\s)/g)) sentence = (m.index ?? 0) + 1
  if (sentence > 0) return lo + sentence
  const space = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'))
  return space > 0 ? lo + space : hi
}

// Splits one page into overlapping chunks of chunkMin..chunkMax characters.
// Offsets index into the normalised page text; chunk text never starts or ends
// with whitespace.
export function chunkPage(documentId: string, page: number, text: string): Chunk[] {
  const { chunkMinChars: min, chunkMaxChars: max, chunkOverlapChars: overlap } = DOCS_CONFIG.limits
  const chunks: Chunk[] = []
  let start = 0
  while (start < text.length) {
    while (start < text.length && /\s/.test(text[start])) start++
    if (start >= text.length) break
    let end = text.length - start <= max ? text.length : breakPoint(text, start + min, start + max)
    while (end > start && /\s/.test(text[end - 1])) end--
    chunks.push({ id: `${documentId}:${page}:${start}-${end}`, documentId, page, startOffset: start, endOffset: end, text: text.slice(start, end) })
    if (end >= text.length) break
    // Step back by the overlap, then forward to the next word start so no chunk begins mid-word.
    let next = Math.max(end - overlap, start + 1)
    while (next < end && !/\s/.test(text[next - 1])) next++
    start = next
  }
  return chunks
}

// Sentences (and stand-alone lines such as headings) in order of appearance.
export function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/))
    .map((s) => s.trim())
    .filter(Boolean)
}

// Lower-case content tokens of a question: letters/digits only, no stopwords, unique.
export function queryTokens(question: string): string[] {
  const raw = question.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const out: string[] = []
  for (const t of raw) {
    if (t.length < DOCS_CONFIG.minTokenChars || STOPWORDS.has(t) || out.includes(t)) continue
    out.push(t)
    if (out.length >= DOCS_CONFIG.maxQueryTokens) break
  }
  return out
}

// An FTS5 MATCH expression that cannot carry FTS syntax: each token is a
// quoted string of letters and digits only, OR-joined. Null when nothing is left.
export function ftsQuery(question: string): string | null {
  const tokens = queryTokens(question)
  return tokens.length ? tokens.map((t) => `"${t}"`).join(' OR ') : null
}

// Lower-case words of a text, for overlap scoring (demo answers, topic keywords).
export const words = (text: string) => text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

// The x-filename header travels percent-encoded (headers are ASCII); a bad
// encoding keeps the raw value. Used only for the title and the extension check.
export function decodeFilename(name: string): string {
  try {
    return decodeURIComponent(name).trim()
  } catch {
    return name.trim()
  }
}

// Title from an untrusted client filename: basename, no extension, safe characters, capped.
export function titleFromFilename(name: string): string {
  const base = decodeFilename(name).split(/[\\/]/).pop() ?? ''
  const title = base
    .replace(/\.pdf$/i, '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ._()\-,&'+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DOCS_CONFIG.titleMaxChars)
    .trim()
  return title || 'Untitled document'
}

// Small deterministic PRNG (mulberry32) seeded from a string, for reproducible quizzes.
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
