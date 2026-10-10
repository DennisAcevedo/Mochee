import { useEffect, useRef } from 'react'
import { useTutorStore } from '../../state/store'
import styles from './Transcript.module.css'

export function Transcript() {
  const lines = useTutorStore((s) => s.lines)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Mirrors scroll() in the export: pin to the bottom on mount and every update.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div className={styles.liveDot} />
        <div className={styles.label}>Live transcript</div>
      </div>
      <div ref={scrollRef} className={styles.scroll}>
        {lines.map((l, i) =>
          l.who === 'tutor' ? (
            <div key={i} className={styles.tutorLine}>
              <div className={styles.meta}>Tutor · {l.time}</div>
              <div className={styles.tutorText} data-live={!!l.live}>
                {l.text}
                {l.live && <span className={styles.caret} />}
              </div>
            </div>
          ) : (
            <div key={i} className={styles.studentLine}>
              <div className={styles.meta}>You · {l.time}</div>
              <div className={styles.bubble}>{l.text}</div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
