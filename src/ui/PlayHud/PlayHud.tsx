import '@fontsource/figtree/800.css'
import '@fontsource/figtree/900.css'
import { useState, type CSSProperties } from 'react'
import { poke } from '../../play/actions'
import { PLAY } from '../../play/config'
import { usePlay } from '../../play/playStore'
import { PALETTE } from '../../scene/layout3d'
import { useProgress } from '../../state/progress'
import { ReopenChip } from '../Closeable/Closeable'
import { Shop } from '../Shop/Shop'
import { CoinIcon } from './CoinIcon'
import { useCoinToasts } from './hooks'
import { UnlockBanner } from './UnlockBanner'
import styles from './PlayHud.module.css'

// The play HUD: the Shop pill (the shop holds every play action and is where
// coins are spent), the tickle hint and the "Unlocked" banner. The balance
// lives in the header's CoinPill in both modes. Playing pays no coins,
// learning does.

const LIGHT_ACCENTS: readonly string[] = [PALETTE.sun, PALETTE.lime] // these take dark text

// The "+N coins" toasts, floating up or down from whatever holds them.
function CoinToasts({ direction }: { direction: 'up' | 'down' }) {
  const toasts = useCoinToasts()
  return (
    <div className={[styles.toasts, direction === 'up' ? styles.up : styles.down].join(' ')} aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[styles.toast, LIGHT_ACCENTS.includes(t.color) && styles.toastInk].filter(Boolean).join(' ')}
          style={{ '--c': t.color, animationDuration: `${PLAY.toastMs}ms` } as CSSProperties}
        >
          <b>+{t.coins} coins</b>
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  )
}

// The balance for the header, in Study and Play alike: a coin and the count
// in one small pill, with the "+N coins" toasts floating under it (learning
// earns them).
export function CoinPill({ className }: { className?: string }) {
  const coins = useProgress((s) => s.coins)
  return (
    <div className={[styles.pill, className].filter(Boolean).join(' ')} role="group" aria-label={`${coins} coins`}>
      <span key={coins} className={styles.coinBadge} aria-hidden="true">
        <CoinIcon />
      </span>
      <span className={styles.pillCoins} aria-hidden="true">
        <b>{coins}</b> coins
      </span>
      <CoinToasts direction="down" />
    </div>
  )
}

interface Props {
  banner?: boolean // render the "Unlocked" banner here (fixed, centred)
  className?: string
}

export function PlayHud({ banner = true, className }: Props) {
  const hintSeen = usePlay((s) => s.tickleHintSeen)
  const [shop, setShop] = useState(false)

  return (
    <div
      className={[styles.hud, className].filter(Boolean).join(' ')}
      role="region"
      aria-label="Play with Gemini Guy"
      // The first press of any button here (or a tickle, actions.ts) retires the tickle hint for good.
      onClickCapture={(e) => {
        if (e.target instanceof Element && e.target.closest('button')) usePlay.getState().seeTickleHint()
      }}
    >
      <ReopenChip label="Shop" icon="shop" onOpen={() => setShop(true)} />

      {!hintSeen && (
        <button type="button" className={styles.hint} onClick={() => poke()} aria-label="Tickle Gemini Guy">
          <span aria-hidden="true">👆</span> Tap <b>Gemini Guy</b> to tickle him
        </button>
      )}

      {shop && <Shop onClose={() => setShop(false)} />}

      {banner && <UnlockBanner />}
    </div>
  )
}
