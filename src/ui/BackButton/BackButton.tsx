import { Link } from 'react-router'
import styles from './BackButton.module.css'

// A visible way out of a tutor: back to the library on Home. Used on the
// start screen (top left) and at the front of the lesson's top bar.
export function BackButton({ className }: { className?: string }) {
  return (
    <Link to="/" className={`${styles.back} ${className ?? ''}`} aria-label="Back to all tutors" title="Back to all tutors">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M12 4.5L6.5 10l5.5 5.5" />
      </svg>
      <span>All tutors</span>
    </Link>
  )
}
