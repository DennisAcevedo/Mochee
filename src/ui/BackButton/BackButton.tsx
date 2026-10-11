import { Link } from 'react-router'
import chip from '../Closeable/Closeable.module.css'
import styles from './BackButton.module.css'

// A visible way out of a tutor: back to the library on Home. Used on the
// start screen (top left) and at the front of the lesson's top bar. It is the
// same chunky pill as every other chip (Closeable.module.css), as a link.
export function BackButton({ className }: { className?: string }) {
  return (
    <Link to="/" className={`${chip.chip} ${styles.back} ${className ?? ''}`} aria-label="Back to all tutors" title="Back to all tutors">
      <span className={chip.chipIcon} aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M12 4.5L6.5 10l5.5 5.5" />
        </svg>
      </span>
      All tutors
    </Link>
  )
}
