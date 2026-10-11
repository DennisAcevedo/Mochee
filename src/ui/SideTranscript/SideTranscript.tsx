import { useEffect, useRef } from 'react'
import { useTutorStore } from '../../state/store'
import { CloseButton } from '../Closeable/Closeable'
import styles from './SideTranscript.module.css'

// The conversation so far, beside the stage: every line Gemini Guy said and
// everything the learner asked, typed or spoken (the tutor store's `lines`).
// New lines scroll into view, unless the learner has scrolled up to reread.
export function SideTranscript({ className, closeable = false }: { className?: string; closeable?: boolean }) {
  const lines = useTutorStore((s) => s.lines)
  const scroll = useRef<HTMLDivElement>(null)
  const pinned = useRef(true) // following the newest line

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
    <section className={[styles.panel, className].filter(Boolean).join(' ')} aria-label="Transcript">
      {closeable && <CloseButton id="transcript" label="transcript" />}
      <header className={styles.head}>
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
