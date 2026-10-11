import type { ReactNode } from 'react'
import styles from './FocusRail.module.css'

// While the browser window is maximized the lesson's cards fold into this
// column of round buttons down the stage's left edge, out of the window's way.
// Each button peeks its card back out (and a second press folds it again).

export type RailItem = 'top' | 'caption' | 'transcript'

const ICONS: Record<'steps' | 'levels' | 'caption' | 'transcript', ReactNode> = {
  // Play triangle over a progress line: the lesson's step controls.
  steps: (
    <>
      <path d="M8 5.5v7l6-3.5z" fill="currentColor" stroke="none" />
      <path d="M5 16.5h12" />
    </>
  ),
  // Rising bars: the level and play HUD.
  levels: <path d="M6 16v-4M11 16V8M16 16V5" />,
  // Speech bubble: the caption.
  caption: <path d="M5 6.5h12a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 17 15.5H10l-3.5 3v-3H5A1.5 1.5 0 0 1 3.5 14V8A1.5 1.5 0 0 1 5 6.5z" />,
  // Lines of text: the transcript.
  transcript: <path d="M5 6h12M5 10h12M5 14h8" />,
}

export function FocusRail({ study, peek, onPeek }: { study: boolean; peek: RailItem | null; onPeek: (item: RailItem | null) => void }) {
  const items: { id: RailItem; icon: keyof typeof ICONS; label: string }[] = [
    { id: 'top', icon: study ? 'steps' : 'levels', label: study ? 'Lesson controls' : 'Levels' },
    { id: 'caption', icon: 'caption', label: 'Captions' },
    { id: 'transcript', icon: 'transcript', label: 'Transcript' },
  ]
  return (
    <nav className={styles.rail} aria-label="Lesson panels">
      {items.map((it) => {
        const open = peek === it.id
        return (
          <button
            key={it.id}
            type="button"
            className={styles.btn}
            data-open={open || undefined}
            aria-pressed={open}
            aria-label={`${open ? 'Fold' : 'Show'} ${it.label}`}
            title={it.label}
            onClick={() => onPeek(open ? null : it.id)}
          >
            <svg viewBox="0 0 22 22" aria-hidden="true">
              {ICONS[it.icon]}
            </svg>
          </button>
        )
      })}
    </nav>
  )
}
