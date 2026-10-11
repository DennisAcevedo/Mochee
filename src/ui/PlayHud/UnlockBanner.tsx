import { useEffect, type CSSProperties } from 'react'
import { PLAY } from '../../play/config'
import { usePlay } from '../../play/playStore'
import { PALETTE } from '../../scene/layout3d'
import type { UnlockId } from '../../state/progress'
import styles from './UnlockBanner.module.css'

// A short "Unlocked: Disco dance!" card after a purchase. Fixed and centred
// over the stage; UnlockWatcher fills it and hides it after a while. Click or
// Escape dismisses it early.

const UNLOCK_LOOK: Record<UnlockId, { icon: string; color: string }> = {
  dance_spin: { icon: '🌀', color: PALETTE.teal },
  dance_robot: { icon: '🤖', color: PALETTE.indigo },
  dance_shuffle: { icon: '👟', color: PALETTE.coral },
  dance_wave: { icon: '🌊', color: PALETTE.sun },
  dance_floss: { icon: '💫', color: PALETTE.lime },
  dance_disco: { icon: '💃', color: PALETTE.violet },
  dance_twist: { icon: '🌪️', color: PALETTE.teal },
  rainbow_cap: { icon: '🎓', color: PALETTE.coral },
  party_lights: { icon: '💡', color: PALETTE.violet },
}

const FADE_MS = 400 // matches the wrapOut fade in the CSS

export function UnlockBanner() {
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
  const { item } = banner
  const look = UNLOCK_LOOK[item.id]
  return (
    <div
      key={banner.id}
      className={styles.wrap}
      role="status"
      aria-live="assertive"
      style={{ '--out': `${PLAY.bannerMs - FADE_MS}ms` } as CSSProperties}
    >
      <div className={styles.card} onClick={hide}>
        <div className={styles.unlock} style={{ '--c': look.color } as CSSProperties}>
          <span className={styles.unlockIcon} aria-hidden="true">
            {look.icon}
          </span>
          <span className={styles.unlockText}>
            <b>Unlocked: {item.label}!</b>
            <span>{item.blurb}</span>
          </span>
        </div>
        <span className={styles.dismiss}>Tap to continue</span>
      </div>
    </div>
  )
}
