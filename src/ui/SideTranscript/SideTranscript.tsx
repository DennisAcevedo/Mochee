import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTutorStore } from '../../state/store'
import { CloseButton } from '../Closeable/Closeable'
import styles from './SideTranscript.module.css'

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

// The conversation so far, beside the stage: every line Gemini Guy said and
// everything the learner asked, typed or spoken (the tutor store's `lines`).
// New lines scroll into view, unless the learner has scrolled up to reread.
export function SideTranscript({ className, closeable = false }: { className?: string; closeable?: boolean }) {
  const lines = useTutorStore((s) => s.lines)
  const scroll = useRef<HTMLDivElement>(null)
  const pinned = useRef(true) // following the newest line
  const { offset, handlers } = useDrag()

  useEffect(() => {
    const el = scroll.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const onScroll = () => {
    const el = scroll.current
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const shown = lines.filter((l) => l.text.trim())
  return (
    <section
      className={[styles.panel, className].filter(Boolean).join(' ')}
      style={offset.x || offset.y ? { translate: `${offset.x}px ${offset.y}px` } : undefined}
      aria-label="Transcript"
    >
      {closeable && <CloseButton id="transcript" label="transcript" />}
      <header className={styles.head} title="Drag to move" {...handlers}>
        <span className={styles.dot} aria-hidden="true" />
        Transcript
        {shown.length > 0 && <span className={styles.count}>{shown.length}</span>}
      </header>
      <div ref={scroll} className={styles.scroll} onScroll={onScroll} aria-live="polite">
        {shown.length === 0 ? (
          <p className={styles.empty}>What you and Gemini Guy say shows up here.</p>
        ) : (
          shown.map((l, i) =>
            l.who === 'tutor' ? (
              <div key={i} className={styles.tutor} data-live={l.live || undefined}>
                <div className={styles.meta}>
                  <b>Gemini Guy</b> · {l.time}
                </div>
                <p className={styles.tutorText}>{l.text}</p>
              </div>
            ) : (
              <div key={i} className={styles.student}>
                <div className={styles.meta}>
                  <b>You</b> · {l.time}
                </div>
                <p className={styles.bubble}>{l.text}</p>
              </div>
            ),
          )
        )}
      </div>
    </section>
  )
}
