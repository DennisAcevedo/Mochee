import '@fontsource/figtree/800.css'
import '@fontsource/figtree/900.css'
import { useState, type CSSProperties } from 'react'
import { poke } from '../../play/actions'
import { PLAY } from '../../play/config'
import { usePlay } from '../../play/playStore'
import { PALETTE } from '../../scene/layout3d'
import { useMode } from '../../state/mode'
import { SHOP, useProgress } from '../../state/progress'
import { AnimationShop } from '../AnimationShop/AnimationShop'
import { CloseButton, ReopenChip } from '../Closeable/Closeable'
import { CoinIcon } from './CoinIcon'
import { useCoinToasts } from './hooks'
import { UnlockBanner } from './UnlockBanner'
import styles from './PlayHud.module.css'

// The play HUD: the coin balance, the Animations pill (it opens the animation
// shop, where every play action lives and coins are spent), the tickle hint,
// floating "+N coins" toasts and the "Unlocked" banner. A compact strip; the
// page decides where it sits. Playing pays no coins, learning does. Study mode
// keeps the balance and the toasts; the pill and the hint are Play's.

const LIGHT_ACCENTS: readonly string[] = [PALETTE.sun, PALETTE.lime] // these take dark text

// The balance: a coin badge, his name and the coins, and the cheapest thing still to buy.
function CoinMeter() {
  const coins = useProgress((s) => s.coins)
  const owned = useProgress((s) => s.owned)
  const next = SHOP.find((i) => !owned.includes(i.id)) ?? null // SHOP is cheapest first

  return (
    <div className={styles.meter}>
      <span key={coins} className={styles.coinBadge} aria-hidden="true">
        <CoinIcon />
      </span>
      <div className={styles.meterBody}>
        <span className={styles.name}>Gemini Guy</span>
        <span className={styles.balance} aria-label={`${coins} coins`}>
          <b>{coins}</b> coins
        </span>
        <span className={styles.goal}>
          {next ? (
            <>
              Next: <b>{next.label}</b> for {next.price}
            </>
          ) : (
            <b>Everything bought!</b>
          )}
        </span>
      </div>
    </div>
  )
}

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

// Study mode's balance for the header: a coin and the count in one small
// pill, with the "+N coins" toasts floating under it (learning earns them).
// Play mode shows the full HUD on the stage instead.
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
  toastDirection?: 'up' | 'down' // which way the "+N coins" toasts float
  banner?: boolean // render the "Unlocked" banner here (fixed, centred)
  className?: string
  closeable?: boolean // an x on the strip hides the HUD for now (src/state/hidden.ts)
}

export function PlayHud({ toastDirection = 'down', banner = true, className, closeable = false }: Props) {
  const playing = useMode((m) => m.mode !== 'study')
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
      <div className={styles.strip}>
        {closeable && <CloseButton id="hud" label="play bar" />}
        <CoinMeter />
        {playing && (
          <>
            <div className={styles.divider} aria-hidden="true" />
            <ReopenChip label="Animations" icon="animations" onOpen={() => setShop(true)} />
          </>
        )}
      </div>

      {playing && !hintSeen && (
        <button type="button" className={styles.hint} onClick={() => poke()} aria-label="Tickle Gemini Guy">
          <span aria-hidden="true">👆</span> Tap <b>Gemini Guy</b> to tickle him
        </button>
      )}

      <CoinToasts direction={toastDirection} />

      {shop && <AnimationShop onClose={() => setShop(false)} />}

      {banner && <UnlockBanner />}
    </div>
  )
}
