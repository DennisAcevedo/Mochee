import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { dribbleBall, dunkBall, juggleBall, kickBall, shootHoops } from '../../scene/hoops/actions'
import type { MoveKind } from '../../scene/hoops/config'
import { useHoops } from '../../scene/hoops/hoopsStore'
import { PALETTE } from '../../scene/layout3d'
import { useMode } from '../../state/mode'
import { XP_REWARD } from '../../state/progress'
import styles from './PlayHud.module.css'

// The Play tab's basketball buttons: "Shoot hoops" up front, the other ball
// tricks behind its chevron, and the SHOTS makes / attempts chip. Play and
// celebrate mode only; each button asks src/scene/hoops for the move and
// wiggles when it can't start (a move is running, he is in the air, the ball is held).

const ORANGE = '#F08A24'
const NOPE_MS = 380

const TRICKS: { kind: Exclude<MoveKind, 'shoot'>; label: string; icon: string; color: string; run: () => boolean }[] = [
  { kind: 'dribble', label: 'Dribble', icon: '⛹️', color: ORANGE, run: dribbleBall },
  { kind: 'kick', label: 'Kick', icon: '⚽', color: PALETTE.teal, run: kickBall },
  { kind: 'juggle', label: 'Juggle', icon: '🦶', color: PALETTE.violet, run: juggleBall },
  { kind: 'dunk', label: 'Dunk', icon: '💥', color: PALETTE.coral, run: dunkBall },
]

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

function ShotsChip() {
  const makes = useHoops((s) => s.makes)
  const attempts = useHoops((s) => s.attempts)
  const shotId = useHoops((s) => s.lastShotId)
  const made = useHoops((s) => s.lastOutcome !== null && s.lastOutcome !== 'rimOut')
  return (
    <div
      key={shotId}
      className={[styles.score, shotId > 0 && (made ? styles.scoreMade : styles.scoreMiss)].filter(Boolean).join(' ')}
      role="status"
      aria-label={`Shots: ${makes} made of ${attempts}`}
      data-testid="hoops-score"
    >
      <span className={styles.scoreLabel}>SHOTS</span>
      <span className={styles.scoreNum}>
        <b>{makes}</b> / {attempts}
      </span>
    </div>
  )
}

export function HoopsControls() {
  const playing = useMode((s) => s.mode !== 'study')
  const busy = useHoops((s) => s.move !== null || s.request !== null)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const [nope, wiggle] = useNope()

  // Close the trick menu on an outside click or Escape.
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

  if (!playing) return null
  return (
    <div className={styles.hoops}>
      <div ref={root} className={styles.danceWrap}>
        <button
          type="button"
          className={[styles.action, styles.hoopsMain, busy && styles.cooling, nope && styles.nope].filter(Boolean).join(' ')}
          style={{ '--c': ORANGE } as CSSProperties}
          aria-label={`Shoot hoops, plus ${XP_REWARD.hoops} XP${busy ? ' (busy)' : ''}`}
          aria-disabled={busy}
          data-testid="hoops-shoot"
          onClick={() => {
            if (!shootHoops()) wiggle()
          }}
        >
          <span className={styles.icon} aria-hidden="true">
            🏀
          </span>
          <span className={styles.label}>Shoot hoops</span>
          <span className={styles.xpTag} aria-hidden="true">
            +{XP_REWARD.hoops}
          </span>
        </button>
        <button
          type="button"
          className={[styles.more, styles.moreHoops].join(' ')}
          aria-label="More ball tricks"
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="hoops-more"
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <div className={styles.menu} role="menu" aria-label="Ball tricks">
            {TRICKS.map((t) => (
              <button
                key={t.kind}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                style={{ '--c': t.color } as CSSProperties}
                aria-label={`${t.label}, plus ${XP_REWARD.trick} XP`}
                data-testid={`hoops-${t.kind}`}
                onClick={() => {
                  if (t.run()) setOpen(false)
                  else wiggle()
                }}
              >
                <span className={styles.menuIcon} aria-hidden="true">
                  {t.icon}
                </span>
                <span className={styles.menuLabel}>{t.label}</span>
                <span className={styles.menuXp}>+{XP_REWARD.trick}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <ShotsChip />
    </div>
  )
}
