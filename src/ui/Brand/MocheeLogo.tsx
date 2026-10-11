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

// The mochi standing in for the "o" of the wordmark: just the dome, eyes and
// blush, sitting on the baseline.
function MocheeO() {
  return (
    <svg className={styles.o} viewBox="0 0 64 44" aria-hidden="true">
      <path d="M5 38c0-18 12-32 27-32s27 14 27 32c0 2.2-1.6 3.5-3.8 3.5H8.8C6.6 41.5 5 40.2 5 38z" fill="#fffdf8" stroke="#1d1b24" strokeWidth="4.5" strokeLinejoin="round" />
      <ellipse cx="18" cy="31" rx="5" ry="3" fill="#ff8fab" />
      <ellipse cx="46" cy="31" rx="5" ry="3" fill="#ff8fab" />
      <circle cx="24.5" cy="24" r="3.4" fill="#1d1b24" />
      <circle cx="39.5" cy="24" r="3.4" fill="#1d1b24" />
    </svg>
  )
}

// Which logo the app shows while we pick one for the hackathon:
// 'inline' = the wordmark with the mochi as its "o"; 'tile' = the pink tile + wordmark.
export const LOGO_STYLE: 'inline' | 'tile' = 'inline'

// The mochee logo. `size` is the tile's side in px (the inline wordmark is
// sized to match the tile version's overall height).
export function MocheeLogo({ size = 40, wordmark = true, className }: { size?: number; wordmark?: boolean; className?: string }) {
  if (LOGO_STYLE === 'inline' && wordmark)
    return (
      <span className={[styles.logo, styles.inline, className].filter(Boolean).join(' ')} style={{ ['--tile' as string]: `${size}px` }} aria-label="mochee">
        <span className={styles.word} aria-hidden="true">
          m<MocheeO />
          chee
        </span>
      </span>
    )
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
