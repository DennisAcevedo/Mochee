import { useEffect, useRef, useState } from 'react'
import type { DocumentInfo } from '../../shared/docsTypes'
import { errorText, fetchPage } from '../ui/Drawers/docsClient'
import { disposeImage, openPdf, renderPage, type PageImage, type PageRender } from '../scene/windows/pdfTexture'
import css from './Boss.module.css'

type Preview =
  | { kind: 'loading' }
  | { kind: 'pdf'; canvas: HTMLCanvasElement }
  | { kind: 'text'; text: string; note: string | null }
  | { kind: 'error'; message: string }

// The exact page cited by the question. A PDF keeps its tables and diagrams;
// other uploads use the page text already extracted by the documents backend.
export function SourcePage({ doc, page }: { doc: DocumentInfo; page: number }) {
  const [preview, setPreview] = useState<Preview>({ kind: 'loading' })
  const [zoom, setZoom] = useState(1)
  const [retry, setRetry] = useState(0)
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    let job: PageRender | null = null
    let image: PageImage | null = null
    let release: (() => void) | null = null
    setPreview({ kind: 'loading' })

    const showText = async (note: string | null) => {
      const result = await fetchPage(doc.id, page)
      if (!live) return
      if (result.ok) setPreview({ kind: 'text', text: result.data.text, note })
      else setPreview({ kind: 'error', message: errorText(result.error) })
    }

    if (doc.original === 'pdf') {
      const opened = openPdf(doc.id)
      release = opened.release
      void opened.doc.then(
        (pdf) => {
          if (!live) return
          if (page < 1 || page > pdf.numPages) {
            void showText(`This PDF has ${pdf.numPages} pages.`)
            return
          }
          const render = renderPage(pdf, page, 1600, 3072, 1)
          job = render
          void render.promise.then(
            (ready) => {
              if (job === render) job = null
              if (!live) {
                disposeImage(ready)
                return
              }
              image = ready
              setPreview({ kind: 'pdf', canvas: ready.texture.image as HTMLCanvasElement })
            },
            () => {
              if (job === render) job = null
              if (live && !render.cancelled) void showText('Could not draw the original page · showing extracted text.')
            },
          )
        },
        () => void showText('Could not open the original PDF · showing extracted text.'),
      )
    } else {
      void showText(doc.original === 'txt' ? null : `${doc.original.toUpperCase()} file · showing the text read from it.`)
    }

    return () => {
      live = false
      job?.cancel()
      if (image) disposeImage(image)
      release?.()
    }
  }, [doc.id, doc.original, page, retry])

  useEffect(() => {
    if (preview.kind !== 'pdf') return
    const host = sheet.current
    host?.appendChild(preview.canvas)
    return () => preview.canvas.remove()
  }, [preview])

  return (
    <aside className={css.sourcePage} aria-label={`Source page ${page}`} data-testid="boss-source-page">
      <div className={css.sourceHeader}>
        <span className={css.sourceTitle}>Your notes · page {page}</span>
        {preview.kind === 'pdf' && (
          <span className={css.sourceZoom}>
            <button type="button" aria-label="Zoom source out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.25))}>−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Zoom source in" disabled={zoom >= 2} onClick={() => setZoom((z) => Math.min(2, z + 0.25))}>+</button>
          </span>
        )}
      </div>
      <div className={css.sourceViewport}>
        {preview.kind === 'loading' && <p className={css.sourceMessage} role="status">Loading page {page}…</p>}
        {preview.kind === 'pdf' && <div ref={sheet} className={css.sourceSheet} style={{ width: `${zoom * 100}%` }} />}
        {preview.kind === 'text' && (
          <div className={css.sourceTextPage}>
            {preview.note && <p className={css.sourceNote}>{preview.note}</p>}
            <pre className={css.sourceText}>{preview.text}</pre>
          </div>
        )}
        {preview.kind === 'error' && (
          <div className={css.sourceMessage} role="alert">
            <p>Could not load page {page}. {preview.message}</p>
            <button type="button" className={css.secondary} onClick={() => setRetry((n) => n + 1)}>Try loading again</button>
          </div>
        )}
      </div>
    </aside>
  )
}
