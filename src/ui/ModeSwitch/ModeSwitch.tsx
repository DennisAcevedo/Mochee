import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { useMode, type StageMode } from '../../state/mode'
import s from './ModeSwitch.module.css'

// Study / Play pill for the header. A radiogroup: arrow keys move and
// select, Home/End jump, one tab stop.

const OPTIONS: { id: StageMode; label: string; hint: string }[] = [
  { id: 'study', label: 'Study', hint: 'He walks you through the lesson' },
  { id: 'play', label: 'Play', hint: 'Drag, throw and bounce him' },
]

export function ModeSwitch() {
  const mode = useMode((m) => m.mode)
  const setMode = useMode((m) => m.setMode)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const options = OPTIONS
  const index = Math.max(0, options.findIndex((o) => o.id === mode))

  const onKeyDown = (e: KeyboardEvent) => {
    const n = options.length
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (index + 1) % n
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (index - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1
    if (to < 0) return
    e.preventDefault()
    // The arrows are the lesson's Next / Back everywhere else (WalkthroughBar's window listener).
    e.stopPropagation()
    setMode(options[to].id)
    refs.current[to]?.focus()
  }

  return (
    <div className={s.wrap}>
      <div
        className={s.pill}
        role="radiogroup"
        aria-label="Stage mode"
        data-mode={mode}
        onKeyDown={onKeyDown}
        style={{ '--i': index, '--n': options.length } as CSSProperties}
      >
        <span className={s.thumb} aria-hidden />
        {options.map((o, i) => (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={o.id === mode}
            tabIndex={o.id === mode ? 0 : -1}
            title={o.hint}
            className={s.option}
            data-id={o.id}
            onClick={() => setMode(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
