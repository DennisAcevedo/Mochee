import { useEffect, useRef, useState } from 'react'
import { notesTabs } from '../../data/stageContent'
import type { DocumentInfo, PageText } from '../../lesson/docsTypes'
import { useDirector } from '../../state/director'
import { useDrawers } from '../../state/drawers'
import { errorText, fetchPage, type DocsErrorCode } from './docsClient'
import s from './Learning.module.css'

// The Learning drawer's reader. For an uploaded document: one page of stored
// text with page arrows, and the cited quote marked in violet highlighter and
// scrolled into view. For the built-in lesson: the notes tab on stage right
// now, with the line he is pointing at highlighted.

// Finds `quote` in `text` the way the server verifies it: whitespace-normalised,
// case-sensitive first, then case-insensitive. Returns [start, end) or null.
export function findQuote(text: string, quote: string): [number, number] | null {
  const words = quote.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  for (const flags of ['', 'i']) {
    const m = new RegExp(pattern, flags).exec(text)
    if (m) return [m.index, m.index + m[0].length]
  }
  return null
}

type PageLoad = { state: 'loading' } | { state: 'ok'; page: PageText } | { state: 'error'; error: DocsErrorCode }

export function DocumentPage({ doc }: { doc: DocumentInfo }) {
  const citation = useDrawers((d) => (d.citation?.documentId === doc.id ? d.citation : null))
  const [page, setPage] = useState(() => citation?.page ?? doc.topics[0]?.firstPage ?? 1)
  const [load, setLoad] = useState<PageLoad>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const markRef = useRef<HTMLElement>(null)

  // A new citation jumps to its page.
  useEffect(() => {
    if (citation) setPage(citation.page)
  }, [citation])

  useEffect(() => {
    let live = true
    setLoad({ state: 'loading' })
    void fetchPage(doc.id, page).then((res) => {
      if (live) setLoad(res.ok ? { state: 'ok', page: res.data } : { state: 'error', error: res.error })
    })
    return () => {
      live = false
    }
  }, [doc.id, page, attempt])

  const text = load.state === 'ok' ? load.page.text : ''
  const quote = citation && citation.page === page ? citation.quote : null
  const range = quote ? findQuote(text, quote) : null
  const rangeKey = range ? `${page}:${range[0]}-${range[1]}` : ''

  useEffect(() => {
    if (rangeKey) markRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [rangeKey])

  return (
    <div className={s.viewer}>
      <div className={s.viewerBar}>
        <span className={s.viewerTitle} title={doc.title}>
          {doc.title}
        </span>
        <div className={s.pager} role="group" aria-label="Page">
          <button type="button" className={s.pageBtn} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
            &#8249;
          </button>
          <span className={s.pageNo} aria-live="polite">
            p. {page}
            <span className={s.pageOf}> / {doc.pageCount}</span>
          </span>
          <button
            type="button"
            className={s.pageBtn}
            disabled={page >= doc.pageCount}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            &#8250;
          </button>
        </div>
      </div>

      {quote && (
        <p className={s.citeNote}>
          {range ? 'Cited passage highlighted below.' : 'The cited passage is on this page, but its wording did not match exactly.'}
        </p>
      )}

      <div className={s.paper} aria-busy={load.state === 'loading'}>
        {load.state === 'loading' && (
          <div className={s.skeleton} aria-label="Loading page">
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
        {load.state === 'error' && (
          <div className={s.notice} data-tone="warn">
            <p>{errorText(load.error)}</p>
            <button type="button" className={s.linkBtn} onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
        {load.state === 'ok' &&
          (range ? (
            <p className={s.pageText}>
              {text.slice(0, range[0])}
              <mark ref={markRef} className={s.mark}>
                {text.slice(range[0], range[1])}
              </mark>
              {text.slice(range[1])}
            </p>
          ) : (
            <p className={s.pageText}>{text || 'This page has no text (it may be a scanned image).'}</p>
          ))}
      </div>
    </div>
  )
}

// The built-in lesson's notes, live with the stage: same tab and highlight.
export function BuiltInPage() {
  const tabIndex = useDirector((d) => d.notesTab)
  const highlight = useDirector((d) => d.highlight)
  const setNotesTab = useDirector((d) => d.setNotesTab)
  const tab = notesTabs[tabIndex] ?? notesTabs[0]
  const markRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [highlight])

  return (
    <div className={s.viewer}>
      <div className={s.tabs} role="tablist" aria-label="Lesson notes">
        {notesTabs.map((t, i) => (
          <button
            key={t.title}
            type="button"
            role="tab"
            aria-selected={i === tabIndex}
            className={s.tab}
            onClick={() => setNotesTab(i)}
          >
            {t.title.replace(/\.pdf$/i, '').replace(/^CS111 /, '')}
          </button>
        ))}
      </div>
      <div className={s.paper}>
        <div className={s.paperMeta}>
          <span>{tab.title}</span>
          <span>{tab.page}</span>
        </div>
        <ul className={s.noteLines}>
          {tab.lines.map((line) => {
            const on = line.id === highlight
            return (
              <li key={line.id} ref={on ? markRef : undefined} data-kind={line.kind} data-on={on} className={s.noteLine}>
                {line.cells ? (
                  <span className={s.cells}>
                    {line.cells.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </span>
                ) : on ? (
                  <mark className={s.mark}>{line.text}</mark>
                ) : (
                  line.text
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
