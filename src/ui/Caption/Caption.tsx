import '@fontsource/figtree/700.css'
import '@fontsource/figtree/800.css'
import type { CSSProperties } from 'react'
import { ACCENT_ORDER, paletteVars } from '../../lesson/accents'
import { parseMarks } from '../../lesson/markup'
import { PALETTE } from '../../scene/layout3d'
import { useDirector } from '../../state/director'
import { useTutorStore } from '../../state/store'
import styles from './Caption.module.css'

interface Props {
  className?: string // placement override; by default it floats bottom-centre of its positioned parent
}

// What he's saying right now, big and readable. **Bold** terms come out in
// bold with a colour-cycling marker, so the key words pop.
export function Caption({ className }: Props) {
  const caption = useDirector((s) => s.caption)
  const speaking = useTutorStore((s) => s.mic === 'speaking')
  if (!caption) return null

  let accent = 0
  const spans = parseMarks(caption).map((span, i) => {
    if (!span.bold) return <span key={i}>{span.text}</span>
    const color = PALETTE[ACCENT_ORDER[accent++ % ACCENT_ORDER.length]]
    return (
      <strong key={i} className={styles.key} style={{ '--accent': color } as CSSProperties}>
        {span.text}
      </strong>
    )
  })

  return (
    <div className={`${styles.wrap} ${className ?? ''}`} style={paletteVars()} aria-live="polite">
      {/* Keyed by the text so each new line pops in. */}
      <div key={caption} className={styles.bubble}>
        <div className={styles.who}>
          <span className={styles.name}>Gemini Guy</span>
          <span className={styles.dots} data-speaking={speaking} aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </div>
        <p className={styles.text}>{spans}</p>
      </div>
    </div>
  )
}
