import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { DOCS_ROUTES } from '../../../shared/docsTypes'

// Real PDF pages for the windows' PDF tabs. pdfjs-dist (loaded on first use, so
// the stage bundle stays lean) parses the stored original from the documents
// API and draws one page into a canvas that becomes a three.js texture.
// Parsed documents are cached per docId and reference counted, so the two
// windows can share one. A page is drawn at the pixel width the window shows it
// at; PdfPage asks for a sharper copy when the window grows (maximize). The
// file is parsed as data only: no XFA, no scripts.
// The legacy build, worker included: the modern one calls Math.sumPrecise while
// it converts embedded fonts, and where the browser lacks it (Chromium 145) the
// fonts fail and accented names come out as the wrong glyphs.

export const PDF_TEXTURE = {
  keepDocs: 3, // parsed documents kept once nobody shows them (each window shows one page)
  minPx: 512, // narrowest render
  maxPx: 3072, // widest render; the GPU's max texture size can cap it lower
  stepPx: 128, // render widths round up to this, so small size changes reuse the texture
} as const

export type PdfFailure = 'not-found' | 'not-pdf' | 'locked' | 'network' | 'render'

export class PdfError extends Error {
  readonly code: PdfFailure
  constructor(code: PdfFailure) {
    super(code)
    this.code = code
  }
}

// ---- pdfjs itself, imported once

type PdfJs = typeof import('pdfjs-dist')
let lib: Promise<{ pdf: PdfJs; worker: InstanceType<PdfJs['PDFWorker']> }> | null = null

// One worker thread for every document: starting one (a 1.3 MB script to
// parse) costs seconds on a busy machine, and documents are opened often.
function pdfjs() {
  lib ??= import('pdfjs-dist/legacy/build/pdf.mjs').then(
    (m) => {
      m.GlobalWorkerOptions.workerSrc = workerUrl
      return { pdf: m, worker: new m.PDFWorker({ verbosity: m.VerbosityLevel.ERRORS }) }
    },
    (err: unknown) => {
      lib = null // a failed chunk load is retried next time
      throw err
    },
  )
  return lib
}

// ---- Parsed documents, shared and reference counted

interface Entry {
  doc: Promise<PDFDocumentProxy>
  refs: number
  destroy: () => void
}

const docs = new Map<string, Entry>() // insertion order = least recently opened first

async function load(docId: string, task: { current: PDFDocumentLoadingTask | null; dead: boolean }): Promise<PDFDocumentProxy> {
  let res: Response
  try {
    res = await fetch(DOCS_ROUTES.file(docId))
  } catch {
    throw new PdfError('network')
  }
  if (res.status === 404) throw new PdfError('not-found')
  if (!res.ok) throw new PdfError('network')
  // A transcript or an office file is served as what it is; only a PDF is drawn.
  if (!/^application\/pdf\b/i.test(res.headers.get('content-type') ?? '')) throw new PdfError('not-pdf')
  const data = new Uint8Array(await res.arrayBuffer())
  const { pdf, worker } = await pdfjs()
  if (task.dead) throw new PdfError('render')
  // destroy() on this task frees the document only; the shared worker stays.
  task.current = pdf.getDocument({ data, worker, enableXfa: false, verbosity: pdf.VerbosityLevel.ERRORS })
  try {
    return await task.current.promise
  } catch (err) {
    throw new PdfError(err instanceof pdf.PasswordException ? 'locked' : 'not-pdf')
  }
}

// Drops the oldest documents nobody shows any more.
function trim() {
  for (const [id, e] of docs) {
    if (docs.size <= PDF_TEXTURE.keepDocs) return
    if (e.refs > 0) continue
    docs.delete(id)
    e.destroy()
  }
}

// The parsed PDF behind a document; call release() when the page unmounts.
export function openPdf(docId: string): { doc: Promise<PDFDocumentProxy>; release: () => void } {
  let e = docs.get(docId)
  if (e) docs.delete(docId) // re-inserted below as the most recent
  else {
    const task: { current: PDFDocumentLoadingTask | null; dead: boolean } = { current: null, dead: false }
    const entry: Entry = {
      doc: load(docId, task),
      refs: 0,
      destroy: () => {
        task.dead = true
        void task.current?.destroy()
      },
    }
    // A failed load is forgotten, so a reload of the tab tries again.
    entry.doc.catch(() => {
      if (docs.get(docId) === entry) docs.delete(docId)
    })
    e = entry
  }
  docs.set(docId, e)
  e.refs++
  const held = e
  let done = false
  trim()
  return {
    doc: held.doc,
    release: () => {
      if (done) return
      done = true
      held.refs--
      trim()
    },
  }
}

// ---- One page as a texture

export interface PageImage {
  texture: CanvasTexture
  aspect: number // height / width
  px: number // canvas width in pixels
}

export interface PageRender {
  promise: Promise<PageImage> // rejects on failure, and after cancel()
  readonly cancelled: boolean // true = the rejection was a cancel, not a failure
  cancel: () => void
}

// Render width for a page shown `screenPx` device pixels wide: rounded up to a
// step, inside the min / max and the GPU's texture limit.
export function renderWidth(screenPx: number, maxTexture: number): number {
  const stepped = Math.ceil(screenPx / PDF_TEXTURE.stepPx) * PDF_TEXTURE.stepPx
  return Math.min(Math.max(stepped, PDF_TEXTURE.minPx), PDF_TEXTURE.maxPx, maxTexture)
}

// Draws page `n` `px` pixels wide (white paper; narrower if a tall page would
// pass `maxTexture`) and wraps it as an sRGB texture.
export function renderPage(doc: PDFDocumentProxy, n: number, px: number, maxTexture: number, anisotropy: number): PageRender {
  let task: RenderTask | null = null
  const state = { cancelled: false }
  const canvas = document.createElement('canvas')
  const promise = (async () => {
    const page = await doc.getPage(n)
    try {
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(px / base.width, maxTexture / base.height) })
      if (state.cancelled) throw new PdfError('render')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      task = page.render({ canvas, viewport, background: '#ffffff' })
      await task.promise
      const texture = new CanvasTexture(canvas)
      texture.colorSpace = SRGBColorSpace
      texture.anisotropy = anisotropy // the windows turn toward the stage centre
      return { texture, aspect: canvas.height / canvas.width, px: canvas.width }
    } catch (err) {
      canvas.width = canvas.height = 0
      throw err
    } finally {
      page.cleanup() // a no-op while the other window still renders this page
    }
  })()
  return {
    promise,
    get cancelled() {
      return state.cancelled
    },
    cancel: () => {
      state.cancelled = true
      task?.cancel()
    },
  }
}

// Frees the GPU copy and the canvas pixels.
export function disposeImage(img: PageImage) {
  img.texture.dispose()
  const c = img.texture.image as HTMLCanvasElement
  c.width = c.height = 0
}
