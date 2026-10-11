import { inflateRawSync } from 'node:zlib'
import type { UploadFormat } from '../../shared/docsTypes.ts'
import { DOCS_CONFIG } from './config.ts'
import { hasPdfMagic } from './pdf.ts'
import { normalizePageText } from './text.ts'

// Every upload format that is not a PDF, read into page text locally: DOCX and
// PPTX (zip + XML, inflated with node:zlib, no Office parser), plain text,
// Markdown and HTML. Images and scanned PDFs need Gemini (vision.ts). Each
// format has a magic-byte check so a renamed file is refused before parsing.

export class FormatError extends Error {
  readonly code: 'bad-file' | 'too-large'
  constructor(code: 'bad-file' | 'too-large') {
    super(code)
    this.code = code
  }
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x)
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

// True when the bytes look like the format they claim to be. Text formats are
// checked by decoding (textOf) instead: any UTF-8/UTF-16 text without NULs passes.
export function hasMagic(format: UploadFormat, b: Uint8Array): boolean {
  switch (format) {
    case 'pdf':
      return hasPdfMagic(b)
    case 'docx':
    case 'pptx':
      return startsWith(b, ZIP_MAGIC)
    case 'png':
      return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'jpg':
      return startsWith(b, [0xff, 0xd8, 0xff])
    case 'webp':
      return startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8)
    default:
      return textOf(b) !== null
  }
}

// Bytes -> text: BOM-marked UTF-8/UTF-16, else strict UTF-8, else Windows-1252.
// Null for binary (a NUL byte outside UTF-16).
export function textOf(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (startsWith(b, [0xff, 0xfe])) return new TextDecoder('utf-16le').decode(b.subarray(2))
  if (startsWith(b, [0xfe, 0xff])) return new TextDecoder('utf-16be').decode(b.subarray(2))
  if (b.includes(0)) return null
  const body = startsWith(b, [0xef, 0xbb, 0xbf]) ? b.subarray(3) : b
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    return new TextDecoder('windows-1252').decode(body)
  }
}

// ---- Pages

// Text -> pages of at most `max` chars. Paragraphs (blank-line separated) stay
// whole when they fit; a longer one splits on lines and sentences, then hard.
// A form feed (a DOCX page break) always starts a new page.
export function pagesFromText(text: string, max: number = DOCS_CONFIG.textPageChars): string[] {
  const pages: string[] = []
  for (const part of text.replace(/\r\n?/g, '\n').split('\f')) {
    let page = ''
    for (const para of part.split(/\n[^\S\n]*\n/)) {
      for (const piece of splitLong(para.trim(), max)) {
        if (page && page.length + 2 + piece.length > max) {
          pages.push(page)
          page = ''
        }
        page = page ? `${page}\n\n${piece}` : piece
      }
    }
    if (page) pages.push(page)
  }
  const out = pages.map(normalizePageText).filter(Boolean)
  if (out.length > DOCS_CONFIG.limits.maxPages) throw new FormatError('too-large')
  return out
}

function splitLong(para: string, max: number): string[] {
  if (!para) return []
  if (para.length <= max) return [para]
  const out: string[] = []
  let cur = ''
  // Tokens keep their own terminator (a newline or sentence end), so joining them restores the text.
  for (const tok of para.match(/[^\n.!?]*(?:[.!?]+|\n|$)/g) ?? []) {
    for (let i = 0; i < tok.length; i += max) {
      const t = tok.slice(i, i + max)
      if (cur.length + t.length > max) {
        out.push(cur)
        cur = ''
      }
      cur += t
    }
  }
  if (cur) out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

// ---- XML and HTML text

// Uploads are parsed on the dev server's only thread, so no pattern here may
// rescan: a tag pattern stops at the next '<' ([^<>]*, never [^>]*), and an
// open/close pair (a:p, a comment, a script) is found by one forward scan
// (cutSpans, drawingText). With [^>]* or a lazy [\s\S]*? per opener, a 1 KB
// DOCX of unclosed '<w:t a' blocked every route for seconds.

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', times: '×', divide: '÷',
  deg: '°', plusmn: '±', le: '≤', ge: '≥', ne: '≠', copy: '©', reg: '®', trade: '™', euro: '€',
  pound: '£', sect: '§', para: '¶', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', lambda: 'λ',
  mu: 'μ', pi: 'π', sigma: 'σ', theta: 'θ', rarr: '→', larr: '←', harr: '↔', infin: '∞', sum: '∑',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
    if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? m
    const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : ''
  })
}

const HTML_BLOCK = 'p|div|section|article|header|footer|main|nav|aside|h[1-6]|li|ul|ol|dl|dt|dd|tr|table|thead|tbody|blockquote|pre|figure|figcaption|hr|title'

// Replaces every span from an `open` match to the first `closeOf(match)` match
// after it with a space, in one forward pass. An opener that is never closed
// drops the rest of the text, as a browser reads an unclosed comment or
// script to the end. `open` must be global.
function cutSpans(s: string, open: RegExp, closeOf: (m: RegExpExecArray) => RegExp): string {
  let out = ''
  let at = 0
  for (let m = open.exec(s); m; m = open.exec(s)) {
    const close = closeOf(m)
    close.lastIndex = m.index + m[0].length
    const end = close.exec(s)
    out += `${s.slice(at, m.index)} `
    if (!end) return out
    at = open.lastIndex = end.index + end[0].length
  }
  return out + s.slice(at)
}

// Visible text of an HTML page: no scripts, styles or comments; block tags
// become paragraph breaks, every other tag disappears.
export function htmlToText(html: string): string {
  const closes = new Map<string, RegExp>()
  const closeTag = (m: RegExpExecArray) => {
    const name = m[1].toLowerCase()
    const re = closes.get(name) ?? new RegExp(`</${name}\\s*>`, 'gi')
    closes.set(name, re)
    return re
  }
  const bare = cutSpans(cutSpans(html, /<!--/g, () => /-->/g), /<(script|style|noscript|template|svg|math|head)\b/gi, closeTag)
  return decodeEntities(
    bare
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(new RegExp(`</?(?:${HTML_BLOCK})\\b[^<>]*>`, 'gi'), '\n\n')
      .replace(/<\/t[dh]\s*>/gi, ' \t ')
      .replace(/<[^<>]*>/g, ''),
  )
}

// ---- Zip (Office files)

interface ZipEntry {
  method: number
  compressedSize: number
  offset: number
}

// Central directory of a zip: name -> entry. Classic zip only (Office files
// never need zip64); encrypted entries are skipped.
function zipEntries(b: Buffer): Map<string, ZipEntry> {
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new FormatError('bad-file')
  const count = b.readUInt16LE(eocd + 10)
  const cdSize = b.readUInt32LE(eocd + 12)
  let at = b.readUInt32LE(eocd + 16)
  if (count > DOCS_CONFIG.zipMaxEntries || at + cdSize > b.length) throw new FormatError('bad-file')
  const entries = new Map<string, ZipEntry>()
  for (let k = 0; k < count; k++) {
    if (at + 46 > b.length || b.readUInt32LE(at) !== 0x02014b50) throw new FormatError('bad-file')
    const nameLen = b.readUInt16LE(at + 28)
    const name = b.toString('utf8', at + 46, at + 46 + nameLen)
    if (!(b.readUInt16LE(at + 8) & 1)) entries.set(name, { method: b.readUInt16LE(at + 10), compressedSize: b.readUInt32LE(at + 20), offset: b.readUInt32LE(at + 42) })
    at += 46 + nameLen + b.readUInt16LE(at + 30) + b.readUInt16LE(at + 32)
  }
  return entries
}

// Reads Office XML parts, sharing one inflated-bytes budget across a file.
function zipReader(bytes: Uint8Array) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries = zipEntries(b)
  let left = DOCS_CONFIG.zipMaxInflatedBytes
  return {
    has: (name: string) => entries.has(name),
    names: () => [...entries.keys()],
    text(name: string): string | null {
      const e = entries.get(name)
      if (!e) return null
      const lh = e.offset
      if (lh + 30 > b.length || b.readUInt32LE(lh) !== 0x04034b50) throw new FormatError('bad-file')
      const start = lh + 30 + b.readUInt16LE(lh + 26) + b.readUInt16LE(lh + 28)
      const raw = b.subarray(start, start + e.compressedSize)
      if (raw.length < e.compressedSize) throw new FormatError('bad-file')
      if (left <= 0) throw new FormatError('too-large')
      let out: Buffer
      if (e.method === 0) out = raw
      else if (e.method === 8) {
        try {
          out = inflateRawSync(raw, { maxOutputLength: left })
        } catch (err) {
          throw new FormatError(err instanceof RangeError || (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE' ? 'too-large' : 'bad-file')
        }
      } else throw new FormatError('bad-file')
      left -= out.length
      if (left < 0) throw new FormatError('too-large')
      return out.toString('utf8')
    },
  }
}

// The lookbehind starts a name only at the start of a word: without it a
// 200k-char name with no '=' after it was rescanned from every one of its characters.
const attrs = (tag: string): Record<string, string> => Object.fromEntries([...tag.matchAll(/(?<![\w:])([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))

// ---- DOCX

// word/document.xml -> paragraphs, '\f' at explicit page breaks. Only w:t runs
// count (not deleted text or field codes); tabs and line breaks are kept.
export function docxText(bytes: Uint8Array): string {
  const zip = zipReader(bytes)
  const xml = zip.text('word/document.xml')
  if (xml === null) throw new FormatError('bad-file')
  const paras: string[] = []
  let cur = ''
  const TOKENS = /<w:p\/>|<w:p[\s>]|<\/w:p>|<w:t(?:\s[^<>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:(?:br|cr)(\s[^<>]*)?\/>|<w:pageBreakBefore(\s[^<>]*)?\/>/g
  for (const m of xml.matchAll(TOKENS)) {
    const tok = m[0]
    if (tok === '<w:p/>') paras.push('')
    else if (tok.startsWith('<w:p')) {
      // A paragraph inside a paragraph (a text box): the outer text so far stands on its own.
      if (cur) paras.push(cur)
      cur = ''
    } else if (tok === '</w:p>') {
      paras.push(cur)
      cur = ''
    } else if (tok === '<w:tab/>') cur += '\t'
    else if (tok.startsWith('<w:t')) cur += decodeEntities(m[1] ?? '')
    else if (tok.startsWith('<w:pageBreakBefore')) {
      if (!/w:val="(?:0|false|off)"/.test(tok)) cur = `\f${cur}`
    } else cur += /w:type="page"/.test(m[2] ?? '') ? '\f' : '\n'
  }
  return paras.join('\n\n')
}

// ---- PPTX

// Resolves a relationship target against the part that holds it.
function resolvePart(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

// Relationship id -> target part, for one .rels file.
function relsOf(zip: ReturnType<typeof zipReader>, part: string): Map<string, { type: string; target: string }> {
  const dir = part.split('/').slice(0, -1).join('/')
  const name = part.split('/').pop() ?? ''
  const xml = zip.text(`${dir ? `${dir}/` : ''}_rels/${name}.rels`) ?? ''
  const out = new Map<string, { type: string; target: string }>()
  for (const m of xml.matchAll(/<Relationship\s[^<>]*>/g)) {
    const a = attrs(m[0])
    if (a.Id && a.Target && a.TargetMode !== 'External') out.set(a.Id, { type: a.Type ?? '', target: resolvePart(part, a.Target) })
  }
  return out
}

// DrawingML text: one line per a:p, a:br as a line break. Each a:p start tag
// is matched, then its </a:p> found with one indexOf; an a:p never closed ends the part.
function drawingText(xml: string): string[] {
  const lines: string[] = []
  const open = /<a:p(?:\s[^<>]*)?>/g
  for (let p = open.exec(xml); p; p = open.exec(xml)) {
    if (p[0].endsWith('/>')) continue // <a:p /> holds no text
    const from = p.index + p[0].length
    const to = xml.indexOf('</a:p>', from)
    if (to < 0) break
    open.lastIndex = to + '</a:p>'.length
    let line = ''
    // a:br is often <a:br><a:rPr/></a:br>, so any a:br start tag is a line break.
    for (const m of xml.slice(from, to).matchAll(/<a:t(?:\s[^<>]*)?>([^<]*)<\/a:t>|<a:br\b[^<>]*>/g)) line += m[0].startsWith('<a:br') ? '\n' : decodeEntities(m[1] ?? '')
    if (line.trim()) lines.push(line.trim())
  }
  return lines
}

// One page per slide, in presentation order, with its speaker notes. An empty
// slide stays an empty page so page N is always slide N.
export function pptxPages(bytes: Uint8Array): string[] {
  const zip = zipReader(bytes)
  const pres = zip.text('ppt/presentation.xml')
  if (pres === null) throw new FormatError('bad-file')
  const rels = relsOf(zip, 'ppt/presentation.xml')
  let slides = [...pres.matchAll(/<p:sldId\s[^<>]*>/g)].map((m) => rels.get(attrs(m[0])['r:id'] ?? '')?.target).filter((t): t is string => !!t && zip.has(t))
  if (!slides.length) {
    const num = (n: string) => Number(/(\d+)\.xml$/.exec(n)?.[1] ?? 0)
    slides = zip.names().filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b))
  }
  if (slides.length > DOCS_CONFIG.limits.maxPages) throw new FormatError('too-large')
  return slides.map((slide) => {
    const lines = drawingText(zip.text(slide) ?? '')
    const notesPart = [...relsOf(zip, slide).values()].find((r) => r.type.endsWith('/notesSlide'))?.target
    // Notes slides also carry the slide-number field: a digits-only line is dropped.
    const notes = notesPart ? drawingText(zip.text(notesPart) ?? '').filter((l) => !/^\d+$/.test(l)) : []
    return normalizePageText([lines.join('\n'), notes.length ? `Speaker notes:\n${notes.join('\n')}` : ''].filter(Boolean).join('\n\n'))
  })
}

// ---- Dispatch

// Local formats -> page text. Throws FormatError for a damaged or oversized file.
export function readLocal(format: Exclude<UploadFormat, 'pdf' | 'png' | 'jpg' | 'webp'>, bytes: Uint8Array): string[] {
  if (format === 'pptx') return pptxPages(bytes)
  if (format === 'docx') return pagesFromText(docxText(bytes))
  const text = textOf(bytes)
  if (text === null) throw new FormatError('bad-file')
  return pagesFromText(format === 'html' ? htmlToText(text) : text)
}
