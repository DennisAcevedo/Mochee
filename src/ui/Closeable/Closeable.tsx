import type { ReactNode } from 'react'
import { useHidden, type PanelId } from '../../state/hidden'
import styles from './Closeable.module.css'

// The x that closes a lesson card for now (src/state/hidden.ts). `inset`
// sits inside the card's corner (for cards that clip their overflow);
// otherwise it perches on the corner.
export function CloseButton({ id, label, inset = false }: { id: PanelId; label: string; inset?: boolean }) {
  const hide = useHidden((s) => s.hide)
  return (
    <button
      type="button"
      className={styles.close}
      data-inset={inset || undefined}
      onClick={(e) => {
        e.stopPropagation()
        hide(id)
      }}
      aria-label={`Hide ${label}`}
      title={`Hide ${label}`}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
      </svg>
    </button>
  )
}

// What a closed card leaves behind: a chunky pill (teal icon disc, bold name)
// that brings it back. A card in src/state/hidden.ts passes its `id`; anything
// else passes `onOpen`.
export type ChipIcon = 'steps' | 'levels' | 'caption' | 'transcript' | 'browser' | 'animations' | 'coins' | 'shop'

const CHIP_ICONS: Record<ChipIcon, ReactNode> = {
  steps: <path d="M7 5.2v9.6l8-4.8z" fill="currentColor" stroke="none" />,
  levels: <path d="M5.5 15V11M10 15V7M14.5 15V4.5" />,
  caption: <path d="M4.5 5.5h11a1.3 1.3 0 0 1 1.3 1.3v5.4a1.3 1.3 0 0 1-1.3 1.3H9l-3 2.5v-2.5h-1.5A1.3 1.3 0 0 1 3.2 12.2V6.8a1.3 1.3 0 0 1 1.3-1.3z" />,
  transcript: <path d="M5 6h10M5 10h10M5 14h6.5" />,
  shop: (
    <>
      <path d="M4 8h12l-1.1 8.2a1.3 1.3 0 0 1-1.3 1.1H6.4a1.3 1.3 0 0 1-1.3-1.1z" />
      <path d="M7.4 8V6.4a2.6 2.6 0 0 1 5.2 0V8" />
    </>
  ),
  coins: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.8v6.4" />
    </>
  ),
  animations: <path d="M10 3.5l1.7 4.3 4.3 1.7-4.3 1.7L10 15.5l-1.7-4.3L4 9.5l4.3-1.7z" />,
  browser: (
    <>
      <rect x="3.5" y="4.5" width="13" height="11" rx="2" />
      <path d="M3.5 8h13" />
    </>
  ),
}

type ReopenProps = { label: string; icon: ChipIcon; className?: string } & ({ id: PanelId; onOpen?: never } | { id?: never; onOpen: () => void })

export function ReopenChip({ id, onOpen, label, icon, className }: ReopenProps) {
  const show = useHidden((s) => s.show)
  return (
    <button
      type="button"
      className={`${styles.chip} ${className ?? ''}`}
      onClick={() => (onOpen ? onOpen() : id && show(id))}
      aria-label={`Show ${label}`}
      title={`Show ${label}`}
    >
      <span className={styles.chipIcon} aria-hidden="true">
        <svg viewBox="0 0 20 20">{CHIP_ICONS[icon]}</svg>
      </span>
      {label}
    </button>
  )
}
