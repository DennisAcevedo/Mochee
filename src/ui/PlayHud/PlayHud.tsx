import '@fontsource/figtree/800.css'
import '@fontsource/figtree/900.css'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { capColor, cycleCap, danceParty, feedSnack, highFive, playCatch, poke } from '../../play/actions'
import { CAP_COLORS, PLAY, type PlayAction } from '../../play/config'
import { usePlay } from '../../play/playStore'
import { PALETTE } from '../../scene/layout3d'
import {
  DANCE_UNLOCKS,
  XP_REWARD,
  isUnlocked,
  levelTitle,
  nextUnlock,
  useProgress,
  xpForLevel,
  type Dance,
} from '../../state/progress'
import { useCooldown, useXpToasts } from './hooks'
import { LevelUpBanner } from './LevelUpBanner'
import styles from './PlayHud.module.css'

// The play HUD: level badge, XP bar, the play buttons (high five, catch,
// snack, dance with a dance picker, cap colour), the tickle hint, floating
// "+N XP" toasts and the level-up banner. A compact strip; the page decides
// where it sits.

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

const DANCES: Record<Dance, { label: string; icon: string; color: string }> = {
  dance_bounce: { label: 'Bounce', icon: '🕺', color: PALETTE.pink },
  dance_spin: { label: 'Spin', icon: '🌀', color: PALETTE.teal },
  dance_robot: { label: 'Robot', icon: '🤖', color: PALETTE.indigo },
}

const NOPE_MS = 380 // the "not yet" wiggle on a cooling button
const LIGHT_ACCENTS: readonly string[] = [PALETTE.sun, PALETTE.lime] // these take dark text

function LockIcon() {
  return (
    <svg className={styles.lock} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="7" width="11" height="8" rx="2.2" fill="currentColor" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// Adds a short wiggle class when an action is refused (cooling down).
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
  xp: number
  onPress: () => boolean
  className?: string
  extra?: ReactNode
}

function PlayButton({ action, label, icon, color, xp, onPress, className, extra }: PlayButtonProps) {
  const { cooling, until, ms } = useCooldown(action)
  const [nope, wiggle] = useNope()
  return (
    <button
      type="button"
      className={[styles.action, cooling && styles.cooling, nope && styles.nope, className].filter(Boolean).join(' ')}
      style={{ '--c': color } as CSSProperties}
      aria-label={`${label}, plus ${xp} XP${cooling ? ' (getting ready)' : ''}`}
      aria-disabled={cooling}
      onClick={() => {
        if (!onPress()) wiggle()
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.label}>{label}</span>
      <span className={styles.xpTag} aria-hidden="true">
        +{xp}
      </span>
      {cooling && <span key={until} className={styles.cooldown} style={{ animationDuration: `${ms}ms` }} aria-hidden="true" />}
      {extra}
    </button>
  )
}

function DanceButton({ level }: { level: number }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const [nope, wiggle] = useNope()

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
      <PlayButton
        action="dance"
        label="Dance"
        icon="🪩"
        color={PALETTE.violet}
        xp={XP_REWARD.dance}
        onPress={() => danceParty()}
      />
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
          {(Object.keys(DANCES) as Dance[]).map((d) => {
            const spec = DANCES[d]
            const need = DANCE_UNLOCKS[d]
            const locked = need > level
            return (
              <button
                key={d}
                type="button"
                role="menuitem"
                className={[styles.menuItem, locked && styles.locked].filter(Boolean).join(' ')}
                style={{ '--c': spec.color } as CSSProperties}
                aria-disabled={locked}
                aria-label={locked ? `${spec.label} dance, unlocks at level ${need}` : `${spec.label} dance`}
                onClick={() => {
                  if (locked) return wiggle()
                  if (danceParty(d)) setOpen(false)
                  else wiggle()
                }}
              >
                <span className={styles.menuIcon} aria-hidden="true">
                  {locked ? <LockIcon /> : spec.icon}
                </span>
                <span className={styles.menuLabel}>{spec.label}</span>
                {locked && <span className={styles.need}>Level {need}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CapButton({ level }: { level: number }) {
  const capIndex = usePlay((s) => s.capIndex)
  const [nope, wiggle] = useNope()
  const unlocked = isUnlocked('rainbow_cap', level)
  const swatch = capColor(level, capIndex) ?? PALETTE.indigo
  const nextSwatch = CAP_COLORS[(capIndex + 1) % CAP_COLORS.length] ?? PALETTE.indigo
  return (
    <button
      type="button"
      className={[styles.action, styles.cap, !unlocked && styles.locked, nope && styles.nope].filter(Boolean).join(' ')}
      style={{ '--c': unlocked ? swatch : PALETTE.ink, '--next': nextSwatch } as CSSProperties}
      aria-label={unlocked ? 'Change cap colour' : 'Cap colours, unlocks at level 4'}
      aria-disabled={!unlocked}
      onClick={() => {
        if (!cycleCap()) wiggle()
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        {unlocked ? '🎓' : <LockIcon />}
      </span>
      <span className={styles.label}>Cap</span>
      {!unlocked && <span className={styles.lockTag}>Lv 4</span>}
    </button>
  )
}

function XpMeter() {
  const xp = useProgress((s) => s.xp)
  const level = useProgress((s) => s.level)
  const floor = xpForLevel(level)
  const next = xpForLevel(level + 1)
  const pct = Math.min(100, Math.max(0, ((xp - floor) / (next - floor)) * 100))
  const goal = nextUnlock(level)

  return (
    <div className={styles.meter}>
      <div key={level} className={styles.badge} aria-label={`Level ${level}`}>
        <span className={styles.badgeLv}>LV</span>
        <span className={styles.badgeNum}>{level}</span>
      </div>
      <div className={styles.meterBody}>
        <div className={styles.meterTop}>
          <span className={styles.name}>Gemini Guy</span>
          <span className={styles.title}>{levelTitle(level)}</span>
        </div>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label="XP to next level"
          aria-valuemin={floor}
          aria-valuemax={next}
          aria-valuenow={xp}
        >
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
        <div className={styles.meterFoot}>
          <span className={styles.goal}>
            {goal ? (
              <>
                Next: <b>{goal.label}</b> at Lv {goal.level}
              </>
            ) : (
              <b>Everything unlocked!</b>
            )}
          </span>
          <span className={styles.xpText}>
            <b>{xp}</b> / {next} XP
          </span>
        </div>
      </div>
    </div>
  )
}

interface Props {
  toastDirection?: 'up' | 'down' // which way the "+N XP" toasts float
  banner?: boolean // render the level-up banner here (fixed, centred)
  className?: string
}

export function PlayHud({ toastDirection = 'down', banner = true, className }: Props) {
  const level = useProgress((s) => s.level)
  const toasts = useXpToasts()
  const [nope, wiggle] = useNope()

  return (
    <div className={[styles.hud, className].filter(Boolean).join(' ')} role="region" aria-label="Play with Gemini Guy">
      <div className={styles.strip}>
        <XpMeter />
        <div className={styles.divider} aria-hidden="true" />
        <div className={styles.actions}>
          {ACTIONS.map((a) => (
            <PlayButton
              key={a.action}
              action={a.action}
              label={a.label}
              icon={a.icon}
              color={a.color}
              xp={XP_REWARD[a.action]}
              onPress={a.run}
              className={a.ink ? styles.ink : undefined}
            />
          ))}
          <DanceButton level={level} />
          <CapButton level={level} />
        </div>
      </div>

      <button
        type="button"
        className={[styles.hint, nope && styles.nope].filter(Boolean).join(' ')}
        onClick={() => {
          if (!poke()) wiggle()
        }}
        aria-label={`Tickle Gemini Guy, plus ${XP_REWARD.poke} XP`}
      >
        <span aria-hidden="true">👆</span> Tap <b>Gemini Guy</b> to tickle him <span className={styles.hintXp}>+{XP_REWARD.poke}</span>
      </button>

      <div className={[styles.toasts, toastDirection === 'up' ? styles.up : styles.down].join(' ')} aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[styles.toast, LIGHT_ACCENTS.includes(t.color) && styles.toastInk].filter(Boolean).join(' ')}
            style={{ '--c': t.color, animationDuration: `${PLAY.toastMs}ms` } as CSSProperties}
          >
            <b>+{t.xp} XP</b>
            <span>{t.label}</span>
          </div>
        ))}
      </div>

      {banner && <LevelUpBanner />}
    </div>
  )
}
