import '@fontsource/fredoka/700.css'
import styles from './MocheeLogo.module.css'

// The mochi face on its own (a white dome with eyes, smile and blush), for
// the logo tile, the caption avatar and the transcript badge.
export function MocheeFace({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 48" aria-hidden="true">
      <ellipse cx="32" cy="43" rx="22" ry="3.5" fill="#1d1b24" opacity="0.12" />
      <path d="M8 40c0-17 10.5-30 24-30s24 13 24 30c0 2-1.4 3-3.4 3H11.4C9.4 43 8 42 8 40z" fill="#fffdf8" stroke="#1d1b24" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="18.5" cy="33" rx="4.2" ry="2.6" fill="#ff8fab" />
      <ellipse cx="45.5" cy="33" rx="4.2" ry="2.6" fill="#ff8fab" />
      <circle cx="23" cy="27" r="2.6" fill="#1d1b24" />
      <circle cx="41" cy="27" r="2.6" fill="#1d1b24" />
      <path d="M28.5 32.5q3.5 3 7 0" fill="none" stroke="#1d1b24" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

// The mochee logo: the face on a pink tile (ink outline, hard shadow), and
// the wordmark beside it. `size` is the tile's side in px.
export function MocheeLogo({ size = 40, wordmark = true, className }: { size?: number; wordmark?: boolean; className?: string }) {
  return (
    <span className={[styles.logo, className].filter(Boolean).join(' ')} style={{ ['--tile' as string]: `${size}px` }} aria-label="mochee">
      <span className={styles.tile} aria-hidden="true">
        <MocheeFace className={styles.face} />
      </span>
      {wordmark && (
        <span className={styles.word} aria-hidden="true">
          mochee
        </span>
      )}
    </span>
  )
}
