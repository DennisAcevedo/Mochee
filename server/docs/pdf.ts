import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { DOCS_CONFIG } from './config.ts'
import { normalizePageText } from './text.ts'

// PDF bytes -> normalised text per page, with pdfjs-dist's legacy build in
// Node (fake worker on the main thread). The PDF is parsed as data only: system
// fonts, font loading and XFA stay off, and nothing in it is executed.

export class PdfError extends Error {
  readonly code: 'not-pdf' | 'too-large'
  constructor(code: 'not-pdf' | 'too-large') {
    super(code)
    this.code = code
  }
}

const PDF_MAGIC = '%PDF-'

export const hasPdfMagic = (bytes: Uint8Array) => bytes.length >= PDF_MAGIC.length && Buffer.from(bytes.subarray(0, PDF_MAGIC.length)).toString('latin1') === PDF_MAGIC

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))

interface TextItemLike {
  str?: string
  hasEOL?: boolean
  height?: number
  transform?: number[]
}

// Joins one page's text items into lines, with a blank line where the vertical
// gap says a new paragraph starts.
function pageItemsToText(items: TextItemLike[]): string {
  let out = ''
  let lastY: number | null = null
  let lineHeight = 0
  for (const item of items) {
    if (typeof item.str !== 'string') continue
    const y = item.transform?.[5]
    if (typeof y === 'number' && lastY !== null && out && !out.endsWith('\n')) {
      // Text moved to another line without an explicit EOL.
      if (Math.abs(lastY - y) > (item.height || lineHeight || 1) * 0.5) out += '\n'
    }
    if (typeof y === 'number' && lastY !== null && out.endsWith('\n') && !out.endsWith('\n\n')) {
      const h = item.height || lineHeight
      if (h > 0 && lastY - y > h * DOCS_CONFIG.paragraphGapRatio) out += '\n'
    }
    out += item.str
    if (item.hasEOL) out += '\n'
    if (typeof y === 'number') lastY = y
    if (item.height) lineHeight = item.height
  }
  return out
}

// Extracts every page's text. Throws PdfError('not-pdf') for anything pdfjs
// cannot open and PdfError('too-large') past the page cap.
export async function extractPages(bytes: Uint8Array): Promise<string[]> {
  if (!hasPdfMagic(bytes)) throw new PdfError('not-pdf')
  const task = getDocument({
    data: new Uint8Array(bytes), // pdfjs takes ownership of the buffer
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    standardFontDataUrl: join(pdfjsRoot, 'standard_fonts') + '/',
    cMapUrl: join(pdfjsRoot, 'cmaps') + '/',
    cMapPacked: true,
    verbosity: 0,
  })
  try {
    let doc
    try {
      doc = await task.promise
    } catch {
      throw new PdfError('not-pdf')
    }
    if (doc.numPages > DOCS_CONFIG.limits.maxPages) throw new PdfError('too-large')
    const pages: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      pages.push(normalizePageText(pageItemsToText(content.items as TextItemLike[])))
      page.cleanup()
    }
    return pages
  } finally {
    await task.destroy()
  }
}
