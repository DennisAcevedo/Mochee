import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useDrawers } from '../../state/drawers'
import s from './Panel.module.css'

// The drawer shell. Wide screens: a fixed glass panel on the left with a handle
// tab on its outer edge that collapses and reopens it. Narrow screens (sheetMode):
// a bottom sheet with a drag handle and three snap heights (CSS, data-snap),
// a focus trap, and Esc to close. Esc also closes a side panel that has focus.

export const PANEL = {
  sheetQuery: '(max-width: 759px)', // keep in sync with the @media rules in Panel.module.css
  dragCloseFraction: 0.45, // dragged below this share of the low snap: close
  dragClickPx: 6, // less movement than this is a tap: cycle the snap height
} as const

export type Snap = 'low' | 'mid' | 'high'
const SNAPS: Snap[] = ['low', 'mid', 'high']
// Mirrors the sheet heights in Panel.module.css (share of the viewport height).
const SNAP_VH: Record<Snap, number> = { low: 0.42, mid: 0.66, high: 0.92 }

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select, [tabindex]:not([tabindex="-1"])'

// Tracks the sheet breakpoint into the drawers store. Mount once (Drawers does).
export function useSheetModeSync() {
  const setSheetMode = useDrawers((d) => d.setSheetMode)
  useEffect(() => {
    const mq = window.matchMedia(PANEL.sheetQuery)
    const sync = () => setSheetMode(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [setSheetMode])
}

interface PanelProps {
  id: string // DOM ids: drawer-handle-<id>, drawer-body-<id>, and the dock's drawer-dock-<id>
  title: string
  accent: string // CSS colour for the header mark and handle
  icon: ReactNode
  headerExtra?: ReactNode
  children: ReactNode
}

export function Panel({ id, title, accent, icon, headerExtra, children }: PanelProps) {
  const open = useDrawers((d) => d.learningOpen)
  const sheet = useDrawers((d) => d.sheetMode)
  const toggle = useDrawers((d) => d.toggle)
  const close = useDrawers((d) => d.close)
  const [snap, setSnap] = useState<Snap>('mid')
  const [dragPx, setDragPx] = useState<number | null>(null)
  const ref = useRef<HTMLElement>(null)
  const drag = useRef<{ y0: number; moved: boolean } | null>(null)
  const titleId = `drawer-${id}-title`

  // Esc closes: from inside the panel, or anywhere while it is the open sheet.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const inside = ref.current?.contains(document.activeElement)
      if (!inside && !sheet) return
      e.preventDefault()
      close()
      if (sheet) document.getElementById(`drawer-dock-${id}`)?.focus()
      else document.getElementById(`drawer-handle-${id}`)?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, sheet, close, id])

  // Sheets trap focus; side panels never do. Focus that starts outside the
  // sheet (the page body, the dock) is pulled in on the next Tab.
  useEffect(() => {
    const el = ref.current
    if (!open || !sheet || !el) return
    const visible = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
    if (!el.contains(document.activeElement)) visible()[0]?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = visible()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!el.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, sheet])

  // Drag handle: follow the finger, then settle on the nearest snap (or close).
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!sheet) return
    drag.current = { y0: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y0
    if (Math.abs(dy) > PANEL.dragClickPx) d.moved = true
    if (d.moved) setDragPx(dy)
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    drag.current = null
    setDragPx(null)
    if (!d) return
    if (!d.moved) {
      setSnap((cur) => SNAPS[(SNAPS.indexOf(cur) + 1) % SNAPS.length])
      return
    }
    const vh = window.innerHeight
    const height = SNAP_VH[snap] * vh - (e.clientY - d.y0)
    if (height < SNAP_VH.low * vh * PANEL.dragCloseFraction) {
      close()
      setSnap('mid')
      return
    }
    const nearest = SNAPS.reduce((a, b) => (Math.abs(SNAP_VH[b] * vh - height) < Math.abs(SNAP_VH[a] * vh - height) ? b : a))
    setSnap(nearest)
  }

  const style = { '--accent': accent, ...(dragPx !== null ? { '--drag': `${dragPx}px` } : {}) } as CSSProperties

  return (
    <aside
      ref={ref}
      className={s.panel}
      data-open={open}
      data-snap={snap}
      data-dragging={dragPx !== null}
      style={style}
      aria-labelledby={titleId}
      role={sheet ? 'dialog' : 'complementary'}
      aria-modal={sheet && open ? true : undefined}
    >
      <button
        id={`drawer-handle-${id}`}
        type="button"
        className={s.handle}
        aria-expanded={open}
        aria-controls={`drawer-body-${id}`}
        aria-label={open ? `Collapse ${title}` : `Open ${title}`}
        onClick={toggle}
      >
        <span className={s.handleIcon} aria-hidden>
          {icon}
        </span>
        <span className={s.handleLabel}>{title}</span>
      </button>

      <div className={s.inner} inert={!open}>
        <button
          type="button"
          className={s.grabber}
          aria-label={`Resize ${title} (tap to change height, drag down to close)`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null
            setDragPx(null)
          }}
        >
          <span />
        </button>
        <header className={s.header}>
          <span className={s.mark} aria-hidden>
            {icon}
          </span>
          <h2 id={titleId} className={s.title}>
            {title}
          </h2>
          {headerExtra}
          <button type="button" className={s.close} aria-label={`Close ${title}`} onClick={close}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div id={`drawer-body-${id}`} className={s.body}>
          {children}
        </div>
      </div>
    </aside>
  )
}
