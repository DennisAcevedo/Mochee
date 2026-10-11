import { useEffect, type CSSProperties } from 'react'
import { PLAY } from '../../play/config'
import { usePlay } from '../../play/playStore'
import { PALETTE } from '../../scene/layout3d'
import type { UnlockId } from '../../state/progress'
import styles from './LevelUpBanner.module.css'

// The big "LEVEL UP!" moment: new level, rank, and a card per unlock. Fixed and
// centred over the stage; LevelWatcher fills it and hides it after a while.
// Click or Escape dismisses it early.

const UNLOCK_LOOK: Record<UnlockId, { icon: string; color: string }> = {
  dance_spin: { icon: '🌀', color: PALETTE.teal },
  dance_robot: { icon: '🤖', color: PALETTE.indigo },
  dance_shuffle: { icon: '👟', color: PALETTE.coral },
  dance_wave: { icon: '🌊', color: PALETTE.sun },
  dance_floss: { icon: '💫', color: PALETTE.lime },
  dance_disco: { icon: '💃', color: PALETTE.violet },
  dance_twist: { icon: '🌪️', color: PALETTE.teal },
  rainbow_cap: { icon: '🎓', color: PALETTE.coral },
  party_lights: { icon: '🪩', color: PALETTE.violet },
}

const FADE_MS = 400 // matches the wrapOut fade in the CSS
const LETTERS = 'LEVEL UP!'.split('')
const LETTER_COLORS = [PALETTE.coral, PALETTE.sun, PALETTE.lime, PALETTE.teal, PALETTE.indigo, PALETTE.violet, PALETTE.pink]

export function LevelUpBanner() {
  const banner = usePlay((s) => s.banner)
  const hide = usePlay((s) => s.hideBanner)

  useEffect(() => {
    if (!banner) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [banner, hide])

  if (!banner) return null
  return (
    <div
      key={banner.id}
      className={styles.wrap}
      role="status"
      aria-live="assertive"
      style={{ '--out': `${PLAY.bannerMs - FADE_MS}ms` } as CSSProperties}
    >
      <div className={styles.rays} aria-hidden="true" />
      <div className={styles.card} onClick={hide}>
        <div className={styles.headline} aria-label="Level up!">
          {LETTERS.map((ch, i) => (
            <span
              key={i}
              className={styles.letter}
              style={{ '--c': LETTER_COLORS[i % LETTER_COLORS.length], '--i': i } as CSSProperties}
              aria-hidden="true"
            >
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </div>
        <div className={styles.level}>
          <span className={styles.levelNum}>Level {banner.level}</span>
          <span className={styles.rank}>{banner.title}</span>
        </div>
        {banner.unlocks.length > 0 && (
          <ul className={styles.unlocks}>
            {banner.unlocks.map((u, i) => {
              const look = UNLOCK_LOOK[u.id]
              return (
                <li key={u.id} className={styles.unlock} style={{ '--c': look.color, '--i': i } as CSSProperties}>
                  <span className={styles.unlockIcon} aria-hidden="true">
                    {look.icon}
                  </span>
                  <span className={styles.unlockText}>
                    <b>Unlocked: {u.label}</b>
                    <span>{u.blurb}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <span className={styles.dismiss}>Tap to continue</span>
      </div>
    </div>
  )
}
