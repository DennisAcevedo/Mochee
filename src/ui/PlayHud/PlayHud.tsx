import '@fontsource/figtree/800.css'
import '@fontsource/figtree/900.css'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { capColor, cycleCap, danceParty, feedSnack, highFive, playCatch, poke } from '../../play/actions'
import { CAP_COLORS, PLAY, type PlayAction } from '../../play/config'
import { usePlay } from '../../play/playStore'
import { PALETTE } from '../../scene/layout3d'
import { useMode } from '../../state/mode'
import { DANCES, SHOP, ownedDances, shopItem, useProgress, type Dance, type UnlockId } from '../../state/progress'
import { CloseButton } from '../Closeable/Closeable'
import { HoopsControls } from './HoopsControls'
import { useCoinToasts, useCooldown } from './hooks'
import { UnlockBanner } from './UnlockBanner'
import styles from './PlayHud.module.css'

// The play HUD: the coin balance, the play buttons (high five, catch, snack,
// dance with a dance picker, cap colour), the tickle hint, floating "+N coins"
// toasts and the "Unlocked" banner. A compact strip; the page decides where it
// sits. Playing pays no coins, learning does; the dance menu and the cap
// button are where coins are spent (src/state/progress.ts SHOP). Study mode
// keeps the balance and the toasts; the buttons, hoops included, and the hint
// are Play's.

interface ActionSpec {
  action: PlayAction
  label: string
  icon: string
  color: string
  ink?: boolean // dark label, for light accents (sun)
  run: () => boolean
}

const ACTIONS: ActionSpec[] = [
  { action: 'highfive', label: 'High five', icon: '🙌', color: PALETTE.sun, ink: true, run: highFive },
  { action: 'catch', label: 'Catch', icon: '🏐', color: PALETTE.teal, run: playCatch },
  { action: 'snack', label: 'Snack', icon: '🍩', color: PALETTE.coral, run: feedSnack },
]

// The dance picker, in shop order (DANCES).
const DANCE_LOOK: Record<Dance, { label: string; icon: string; color: string }> = {
  dance_bounce: { label: 'Bounce', icon: '🕺', color: PALETTE.pink },
  dance_spin: { label: 'Spin', icon: '🌀', color: PALETTE.teal },
  dance_shuffle: { label: 'Shuffle', icon: '👟', color: PALETTE.coral },
  dance_robot: { label: 'Robot', icon: '🤖', color: PALETTE.indigo },
  dance_wave: { label: 'Wave', icon: '🌊', color: PALETTE.sun },
  dance_floss: { label: 'Floss', icon: '💫', color: PALETTE.lime },
  dance_disco: { label: 'Disco', icon: '💃', color: PALETTE.violet },
  dance_twist: { label: 'Twist', icon: '🌪️', color: PALETTE.teal },
}

const NOPE_MS = 380 // the "not yet" wiggle on a cooling button or a buy he cannot afford
const LIGHT_ACCENTS: readonly string[] = [PALETTE.sun, PALETTE.lime] // these take dark text

function LockIcon() {
  return (
    <svg className={styles.lock} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="7" width="11" height="8" rx="2.2" fill="currentColor" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// A gold coin, for the balance and the prices.
function CoinIcon({ className }: { className?: string }) {
  return (
    <svg className={[styles.coinIcon, className].filter(Boolean).join(' ')} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" fill="#E9A21A" />
      <circle cx="8" cy="7.6" r="6.3" fill="#FFC83D" />
      <circle cx="8" cy="7.6" r="4.3" fill="none" stroke="#E9A21A" strokeWidth="1.2" />
      <path d="M5.6 5.4a3.4 3.4 0 0 1 2.2-1.1" fill="none" stroke="#FFF1C2" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

// What a locked shop item shows: its price, or how far short he is.
function Price({ price, short }: { price: number; short: number }) {
  return (
    <span className={styles.price} data-short={short > 0 || undefined}>
      <CoinIcon />
      {short > 0 ? `Need ${short} more` : price}
    </span>
  )
}

const buyLabel = (label: string, price: number, short: number) =>
  short > 0 ? `${label}, ${price} coins, need ${short} more` : `Buy ${label} for ${price} coins`

// Adds a short wiggle class when an action is refused (cooling down, or a buy he cannot afford).
function useNope(): [boolean, () => void] {
  const [nope, setNope] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return [
    nope,
    () => {
      setNope(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setNope(false), NOPE_MS)
    },
  ]
}

interface PlayButtonProps {
  action: PlayAction
  label: string
  icon: ReactNode
  color: string
  onPress: () => boolean
  className?: string
  extra?: ReactNode
}

function PlayButton({ action, label, icon, color, onPress, className, extra }: PlayButtonProps) {
  const { cooling, until, ms } = useCooldown(action)
  const [nope, wiggle] = useNope()
  return (
    <button
      type="button"
      className={[styles.action, cooling && styles.cooling, nope && styles.nope, className].filter(Boolean).join(' ')}
      style={{ '--c': color } as CSSProperties}
      aria-label={`${label}${cooling ? ' (getting ready)' : ''}`}
      aria-disabled={cooling}
      onClick={() => {
        if (!onPress()) wiggle()
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.label}>{label}</span>
      {cooling && <span key={until} className={styles.cooldown} style={{ animationDuration: `${ms}ms` }} aria-hidden="true" />}
      {extra}
    </button>
  )
}

function DanceButton() {
  const owned = useProgress((s) => s.owned)
  const coins = useProgress((s) => s.coins)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const [nope, wiggle] = useNope()
  const mine = ownedDances(owned)
  const lights = shopItem('party_lights')
  const lightsShort = Math.max(0, lights.price - coins)

  // A locked item buys on click if he can afford it (the "Unlocked" banner follows), else wiggles.
  const buy = (id: UnlockId) => {
    if (!useProgress.getState().spend(id)) wiggle()
  }

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className={styles.danceWrap}>
      <PlayButton action="dance" label="Dance" icon="🪩" color={PALETTE.violet} onPress={() => danceParty()} />
      <button
        type="button"
        className={[styles.more, nope && styles.nope].filter(Boolean).join(' ')}
        aria-label="Pick a dance"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Dances">
          {DANCES.map((d) => {
            const spec = DANCE_LOOK[d]
            const locked = !mine.includes(d)
            const price = locked ? shopItem(d as UnlockId).price : 0
            const short = Math.max(0, price - coins)
            return (
              <button
                key={d}
                type="button"
                role="menuitem"
                className={[styles.menuItem, locked && styles.locked].filter(Boolean).join(' ')}
                style={{ '--c': spec.color } as CSSProperties}
                aria-disabled={locked && short > 0}
                aria-label={locked ? buyLabel(`the ${spec.label} dance`, price, short) : `${spec.label} dance`}
                onClick={() => {
                  if (locked) return buy(d as UnlockId)
                  if (danceParty(d)) setOpen(false)
                  else wiggle()
                }}
              >
                <span className={styles.menuIcon} aria-hidden="true">
                  {locked ? <LockIcon /> : spec.icon}
                </span>
                <span className={styles.menuLabel}>{spec.label}</span>
                {locked && <Price price={price} short={short} />}
              </button>
            )
          })}
          {!owned.includes('party_lights') && (
            <button
              type="button"
              role="menuitem"
              className={styles.buyChip}
              aria-disabled={lightsShort > 0}
              aria-label={buyLabel('party lights', lights.price, lightsShort)}
              title={lights.blurb}
              onClick={() => buy('party_lights')}
            >
              <span aria-hidden="true">💡</span>
              <span className={styles.buyChipLabel}>Party lights</span>
              <Price price={lights.price} short={lightsShort} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CapButton() {
  const capIndex = usePlay((s) => s.capIndex)
  const owned = useProgress((s) => s.owned.includes('rainbow_cap'))
  const coins = useProgress((s) => s.coins)
  const [nope, wiggle] = useNope()
  const { price } = shopItem('rainbow_cap')
  const short = Math.max(0, price - coins)
  const swatch = capColor(owned, capIndex) ?? PALETTE.indigo
  const nextSwatch = CAP_COLORS[(capIndex + 1) % CAP_COLORS.length] ?? PALETTE.indigo
  return (
    <button
      type="button"
      className={[styles.action, styles.cap, !owned && styles.locked, nope && styles.nope].filter(Boolean).join(' ')}
      style={{ '--c': owned ? swatch : PALETTE.ink, '--next': nextSwatch } as CSSProperties}
      aria-label={owned ? 'Change cap colour' : buyLabel('the rainbow cap', price, short)}
      aria-disabled={!owned && short > 0}
      onClick={() => {
        const ok = owned ? cycleCap() : useProgress.getState().spend('rainbow_cap')
        if (!ok) wiggle()
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        {owned ? '🎓' : <LockIcon />}
      </span>
      <span className={styles.label}>Cap</span>
      {!owned && (
        <span className={styles.lockTag} aria-hidden="true">
          <Price price={price} short={short} />
        </span>
      )}
    </button>
  )
}

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
            <div className={styles.actions}>
              <HoopsControls />
              {ACTIONS.map((a) => (
                <PlayButton
                  key={a.action}
                  action={a.action}
                  label={a.label}
                  icon={a.icon}
                  color={a.color}
                  onPress={a.run}
                  className={a.ink ? styles.ink : undefined}
                />
              ))}
              <DanceButton />
              <CapButton />
            </div>
          </>
        )}
      </div>

      {playing && !hintSeen && (
        <button type="button" className={styles.hint} onClick={() => poke()} aria-label="Tickle Gemini Guy">
          <span aria-hidden="true">👆</span> Tap <b>Gemini Guy</b> to tickle him
        </button>
      )}

      <CoinToasts direction={toastDirection} />

      {banner && <UnlockBanner />}
    </div>
  )
}
