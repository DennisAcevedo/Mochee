import { UPLOAD_EXTENSIONS } from '../../shared/docsTypes.ts'
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

// NFKC, control characters dropped, tabs/runs of spaces to one space, at most
// one blank line between paragraphs. pdfjs maps some math glyphs (LaTeX's minus
// sign) to U+0000, and node:sqlite stores a string only up to its first NUL, so
// a page with one would be saved cut short.
export function normalizePageText(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f]/g, '')
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

// Page text with [p.N] markers spread over pages from..to within about `budget`
// chars, so a prompt sees the whole document rather than its opening pages.
// Every page gets a fair share of its opening text (where headings sit; short
// pages hand their slack to long ones). When a share would fall under
// samplePageMinChars, evenly spaced pages are sampled instead of all of them.
export function sampleAcross(pages: string[], budget: number, from = 1, to = pages.length): string {
  const first = Math.max(1, from)
  const last = Math.min(pages.length, to)
  const n = last - first + 1
  if (n <= 0 || budget <= 0) return ''
  const count = Math.min(n, Math.max(1, Math.floor(budget / DOCS_CONFIG.samplePageMinChars)))
  const picked = [...new Set(Array.from({ length: count }, (_, k) => first + (count === 1 ? 0 : Math.round((k * (n - 1)) / (count - 1)))))]
  const marker = (p: number) => `[p.${p}]\n`.length + 2
  let left = budget - picked.reduce((sum, p) => sum + marker(p), 0)
  const share = new Map<number, number>()
  // Water-fill: shortest pages first, each takes min(its length, an even split of what is left).
  const byLength = [...picked].sort((a, b) => (pages[a - 1]?.length ?? 0) - (pages[b - 1]?.length ?? 0))
  byLength.forEach((p, i) => {
    const take = Math.max(0, Math.min(pages[p - 1]?.length ?? 0, Math.floor(left / (byLength.length - i))))
    share.set(p, take)
    left -= take
  })
  return picked.map((p) => `[p.${p}]\n${(pages[p - 1] ?? '').slice(0, share.get(p) ?? 0)}\n\n`).join('')
}

// Drops page references a model writes into a line ("(p. 9)", "(pp. 15, 17)",
// "[page 3]"): the line's page field carries the page, checked against the text.
export const stripPageRefs = (s: string) => s.replace(/\s*[([]\s*(?:pp?\.?|pages?)\s*\d+(?:\s*(?:[-–,]|and)\s*\d+)*\s*[)\]]/gi, '').trim()

// Content words of a text for page matching: words of 4+ letters that are not
// stopwords, and numbers of 2+ digits (results lines are full of them).
export function contentWords(text: string): Set<string> {
  return new Set(words(text).filter((w) => (/^\d+$/.test(w) ? w.length >= 2 : w.length >= 4 && !STOPWORDS.has(w))))
}

// The x-filename header travels percent-encoded (headers are ASCII); a bad
// encoding keeps the raw value. Used only for the title and the extension check.
export function decodeFilename(name: string): string {
  try {
    return decodeURIComponent(name).trim()
  } catch {
    return name.trim()
  }
}

const UPLOAD_EXT = new RegExp(`\\.(${Object.keys(UPLOAD_EXTENSIONS).join('|')})$`, 'i')

// Title from an untrusted client filename: basename, no extension, safe characters, capped.
export function titleFromFilename(name: string): string {
  const base = decodeFilename(name).split(/[\\/]/).pop() ?? ''
  const title = base
    .replace(UPLOAD_EXT, '')
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
