import '@fontsource/fredoka/700.css'
import { skipIntro } from '../../intro/intro'
import { useTutorStore } from '../../state/store'
import styles from './StartScreen.module.css'

// Skip the intro while it plays (Esc does the same).
export function SkipButton() {
  const phase = useTutorStore((s) => s.phase)
  if (phase !== 'intro') return null
  return (
    <button type="button" className={styles.skip} onClick={skipIntro}>
      Skip
      <span className={styles.skipKey} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 6.2v11.6a.9.9 0 0 0 1.4.75l7.7-5.15a1.6 1.6 0 0 0 0-2.8L7.4 5.45A.9.9 0 0 0 6 6.2Z" />
          <rect x="16.2" y="5.5" width="2.8" height="13" rx="1.2" />
        </svg>
      </span>
    </button>
  )
}
