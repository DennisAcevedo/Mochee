import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/nunito/600.css'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { TranscriptLine } from '../../data/mockLesson'
import { ACCENT_ORDER } from '../../lesson/accents'
import { parseMarks, stripMarks } from '../../lesson/markup'
import { PALETTE } from '../../scene/layout3d'
import { useTutorStore } from '../../state/store'
import { CloseButton } from '../Closeable/Closeable'
import styles from './SideTranscript.module.css'
import { MocheeFace } from '../Brand/MocheeLogo'

// Where the learner dragged the card, kept while the page is open so a
// closed-and-reopened transcript comes back where they left it.
let savedOffset = { x: 0, y: 0 }

// Dragging by the header moves the card (a translate on top of its CSS
// place), clamped so it stays inside the stage.
function useDrag() {
  const [offset, setOffset] = useState(savedOffset)
  const drag = useRef<{ x0: number; y0: number; from: { x: number; y: number }; min: { x: number; y: number }; max: { x: number; y: number } } | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    const panel = e.currentTarget.parentElement
    const bounds = (panel?.parentElement?.offsetParent ?? document.body).getBoundingClientRect()
    if (!panel) return
    const r = panel.getBoundingClientRect()
    // The room left on each side, measured from where the card sits now.
    drag.current = {
      x0: e.clientX,
      y0: e.clientY,
      from: offset,
      min: { x: offset.x - (r.left - bounds.left), y: offset.y - (r.top - bounds.top) },
      max: { x: offset.x + (bounds.right - r.right), y: offset.y + (bounds.bottom - r.bottom) },
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
    const next = { x: clamp(d.from.x + e.clientX - d.x0, d.min.x, d.max.x), y: clamp(d.from.y + e.clientY - d.y0, d.min.y, d.max.y) }
    savedOffset = next
    setOffset(next)
  }
  const onPointerUp = () => {
    drag.current = null
  }
  return { offset, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}

// The conversation so far, beside the stage: every line Mochee said and
// everything the learner asked, typed or spoken (the tutor store's `lines`).
// New lines scroll into view, unless the learner has scrolled up to reread.
interface Props {
  className?: string
  closeable?: boolean
  panelRef?: (el: HTMLElement | null) => void // the card element (the lesson page stacks it with the browser and the controls)
}

type Filter = 'all' | 'terms' | 'asked'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'terms', label: 'Key terms' },
  { id: 'asked', label: 'Asked' },
]

const keep = (l: TranscriptLine, filter: Filter, q: string) =>
  (filter === 'all' || (filter === 'terms' ? !!l.marked : l.who === 'student')) && (!q || stripMarks(l.text).toLowerCase().includes(q))

// A tutor line with its **key terms** as tinted pills, in the caption's colour order.
function Rich({ line }: { line: TranscriptLine }) {
  if (!line.marked) return <>{line.text}</>
  let accent = 0
  return (
    <>
      {parseMarks(line.marked).map((span, i) => {
        if (!span.bold) return <span key={i}>{span.text}</span>
        const color = PALETTE[ACCENT_ORDER[accent++ % ACCENT_ORDER.length]]
        return (
          <mark key={i} className={styles.term} style={{ '--accent': color } as CSSProperties}>
            {span.text}
          </mark>
        )
      })}
    </>
  )
}

export function SideTranscript({ className, closeable = false, panelRef }: Props) {
  const lines = useTutorStore((s) => s.lines)
  const scroll = useRef<HTMLDivElement>(null)
  const pinned = useRef(true) // following the newest line
  const { offset, handlers } = useDrag()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const el = scroll.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const onScroll = () => {
    const el = scroll.current
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const said = lines.filter((l) => l.text.trim())
  const q = query.trim().toLowerCase()
  const shown = said.filter((l) => keep(l, filter, q))
  return (
    <section
      ref={panelRef}
      className={[styles.panel, className].filter(Boolean).join(' ')}
      style={offset.x || offset.y ? { translate: `${offset.x}px ${offset.y}px` } : undefined}
      aria-label="Transcript"
    >
      {closeable && <CloseButton id="transcript" label="transcript" />}
      <div className={styles.top}>
        <header className={styles.head} title="Drag to move" {...handlers}>
          Transcript
          <span className={styles.count}>{said.length}</span>
        </header>
        <label className={styles.search}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this lecture" aria-label="Search this lecture" />
        </label>
        <div className={styles.filters} role="radiogroup" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={styles.filter} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={scroll} className={styles.scroll} onScroll={onScroll} aria-live="polite">
        {said.length === 0 ? (
          <p className={styles.empty}>What you and Mochee say shows up here.</p>
        ) : shown.length === 0 ? (
          <p className={styles.empty}>Nothing here matches.</p>
        ) : (
          shown.map((l, i) => (
            <div key={i} className={styles.line} data-who={l.who} data-live={l.live || undefined}>
              <span className={styles.badge} aria-hidden="true">
                {l.who === 'tutor' ? <MocheeFace className={styles.badgeFace} /> : 'ME'}
              </span>
              <div className={styles.body}>
                <div className={styles.time}>
                  <span className={styles.sr}>{l.who === 'tutor' ? 'Mochee' : 'You'}, </span>
                  {l.time}
                </div>
                <p className={styles.text}>
                  <Rich line={l} />
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
