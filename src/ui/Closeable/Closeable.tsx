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

// What a closed card leaves behind: a small chip that brings it back. A card
// in src/state/hidden.ts passes its `id`; anything else passes `onOpen`.
type ReopenProps = { label: string; icon?: string; className?: string } & ({ id: PanelId; onOpen?: never } | { id?: never; onOpen: () => void })

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
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
    </button>
  )
}
