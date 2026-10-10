import { skipIntro } from '../../intro/intro'
import { useTutorStore } from '../../state/store'
import styles from './StartScreen.module.css'

// Muted escape hatch while the intro plays (Esc does the same).
export function SkipButton() {
  const phase = useTutorStore((s) => s.phase)
  if (phase !== 'intro') return null
  return (
    <button type="button" className={styles.skip} onClick={skipIntro}>
      Skip<span className={styles.skipChevron}>›</span>
    </button>
  )
}
