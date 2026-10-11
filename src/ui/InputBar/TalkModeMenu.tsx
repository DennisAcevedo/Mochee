import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './InputBar.module.css'

// The talk bar's mode picker: a pill showing the current mode that drops a
// menu (upward, as wide as the pill) to switch between Tap to talk and
// Hands-free. A listbox for screen readers; arrows, Enter and Esc work.

type TalkMode = 'manual' | 'hands-free'

const MENU = {
  sideGap: 22, // px from the pill to the side menu (clears the bar's edge); keep in step with .talkMenu[data-side]
  edge: 8, // px the side menu keeps from the window's left edge
} as const

const HAND = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L4.6 15.4a1.5 1.5 0 0 1 2.4-1.8L9 15.5" />
  </svg>
)

const WAVE = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
  </svg>
)

const MODES: { id: TalkMode; label: string; hint: string; icon: ReactNode; color: string }[] = [
  { id: 'manual', label: 'Tap to talk', hint: 'Tap the mic for each turn', icon: HAND, color: '#f7c623' },
  { id: 'hands-free', label: 'Hands-free', hint: 'Mochee listens until you stop', icon: WAVE, color: '#7fd88a' },
]

export function TalkModeMenu({ handsFree, onChoose }: { handsFree: boolean; onChoose: (handsFree: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const current = MODES[handsFree ? 1 : 0]

  // A press anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])

  // Out to the left of the talk bar, level with it, so it never covers the
  // caption above; upward only when the bar is too close to the window's edge.
  const [side, setSide] = useState(true)
  const show = () => {
    const left = trigger.current?.getBoundingClientRect().left ?? 0
    setSide(left >= (trigger.current?.offsetWidth ?? 0) + MENU.sideGap + MENU.edge)
    setActive(handsFree ? 1 : 0)
    setOpen(true)
  }
  const pick = (i: number) => {
    onChoose(MODES[i].id === 'hands-free')
    setOpen(false)
    trigger.current?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return show()
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : MODES.length - 1)) % MODES.length)
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault()
      pick(active)
    }
  }

  return (
    <div ref={root} className={styles.talkMode} onKeyDown={onKey}>
      {open && (
        <ul className={styles.talkMenu} data-side={side || undefined} role="listbox" aria-label="Talk mode" aria-activedescendant={`talk-mode-${MODES[active].id}`}>
          {MODES.map((m, i) => (
            <li
              key={m.id}
              id={`talk-mode-${m.id}`}
              role="option"
              aria-selected={m.id === current.id}
              aria-description={m.hint}
              title={m.hint}
              className={styles.talkOption}
              data-active={i === active || undefined}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span className={styles.talkIcon} style={{ background: m.color }}>{m.icon}</span>
              <span className={styles.talkLabel}>{m.label}</span>
              {m.id === current.id && (
                <svg className={styles.talkCheck} viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        ref={trigger}
        type="button"
        className={styles.talkTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Talk mode: ${current.label}`}
        title={current.hint}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <span className={styles.talkIcon} style={{ background: current.color }}>{current.icon}</span>
        <span className={styles.talkLabel}>{current.label}</span>
        <svg className={styles.talkChevron} data-open={open || undefined} viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
    </div>
  )
}
