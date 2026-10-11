import { useEffect, useRef, useState } from 'react'
import { notesTabs } from '../../../shared/lessonNotes'
import { DOCS_ROUTES, type DocumentInfo, type PageText } from '../../../shared/docsTypes'
import { useDirector } from '../../state/director'
import { useDrawers } from '../../state/drawers'
import { useWindows } from '../../state/windows'
import { WIN, type WinId } from '../../scene/windows/tabModel'
import { errorText, fetchPage, type DocsErrorCode } from './docsClient'
import s from './Learning.module.css'

// The Learning drawer's reader. For an uploaded document: one page of stored
// text with page arrows, and the cited quote marked in violet highlighter and
// scrolled into view, plus "Open in the window" (the real page, in the stage
// window's tab) and a small link to the browser's own viewer. For the built-in
// lesson: the notes tab on stage right now, with the line he is pointing at
// highlighted.

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

const WINDOW_TITLE_MAX = 64 // characters of the title a window tab keeps (as the New tab page's PDF rows)

// The tab to show `docId` in: the one already showing it (the active tab
// first), else an empty New tab, else a fresh tab. Null when the window's
// tab strip is full.
function tabFor(docId: string): [WinId, string] | null {
  const win = WIN
  const wt = useWindows.getState().tabs[win]
  const t = [wt.tabs.find((x) => x.id === wt.active), ...wt.tabs].find((x) => x?.kind === 'pdf' && x.docId === docId)
  if (t) return [win, t.id]
  const blank = wt.tabs.find((x) => x.kind === 'newtab')
  if (blank) return [win, blank.id]
  useWindows.getState().openTab(win)
  const after = useWindows.getState().tabs[win]
  return after !== wt ? [win, after.active] : null
}

// The primary action: the page pops out into the stage's browser window, in
// its own tab, maximized so it reads at full size; this drawer folds away so
// nothing covers it. No room for another tab: the browser's viewer instead.
function openInWindow(doc: DocumentInfo, page: number) {
  const target = tabFor(doc.id)
  if (!target) {
    window.open(`${DOCS_ROUTES.file(doc.id)}${doc.original === 'pdf' ? `#page=${page}` : ''}`, '_blank', 'noopener')
    return
  }
  const [win, id] = target
  const w = useWindows.getState()
  w.turnInto(win, id, { kind: 'pdf', docId: doc.id, page, title: doc.title.slice(0, WINDOW_TITLE_MAX) })
  w.setMaximized(win) // also brings a minimized window out of its chip
  useDrawers.getState().close()
}

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

      <div className={s.openRow}>
        <button type="button" className={s.openFull} onClick={() => openInWindow(doc, page)} data-testid="open-in-window">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
            <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
            <path d="M2.5 7.5h15" />
          </svg>
          {doc.original === 'pdf' ? 'Open PDF in the window' : 'Open in the window'}
        </button>
        <a
          className={s.openRaw}
          href={`${DOCS_ROUTES.file(doc.id)}${doc.original === 'pdf' ? `#page=${page}` : ''}`}
          target="_blank"
          rel="noopener"
          data-testid="open-full-doc"
          title="The original file in your browser's own viewer"
        >
          Browser tab<span aria-hidden="true"> &#8599;</span>
          <span className={s.srOnly}> (opens the original in a new browser tab)</span>
        </a>
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
