import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useWalkthrough } from '../../lesson/runner'
import { useMode } from '../../state/mode'
import { useShop } from '../../state/shop'
import { Shop } from './Shop'
import styles from './Shop.module.css'

export function ShopVisit() {
  const phase = useShop((s) => s.phase)
  const active = phase !== 'closed'
  const wasActive = useRef(false)
  const resumeLesson = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const travelButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (active && !wasActive.current) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      resumeLesson.current = useWalkthrough.getState().playing
      if (resumeLesson.current) useWalkthrough.getState().pause()
    } else if (!active && wasActive.current) {
      if (resumeLesson.current && useMode.getState().mode === 'study') useWalkthrough.getState().resume()
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
    }
    wasActive.current = active
  }, [active])

  useEffect(() => {
    if (!active) return
    const bodyOverflow = document.body.style.overflow
    const rootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = bodyOverflow
      document.documentElement.style.overflow = rootOverflow
    }
  }, [active])

  useEffect(() => {
    if (phase !== 'approaching' && phase !== 'returning') return
    travelButton.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => {
      e.stopImmediatePropagation()
      if (e.key === 'Escape') { e.preventDefault(); useShop.getState().leave() }
      if (e.key === 'Tab') { e.preventDefault(); travelButton.current?.focus() }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [phase])

  return <>
    {!active && <button className={styles.keyboardEntry} onClick={() => useShop.getState().enter()}>Visit the wooden shop</button>}
    {active && createPortal(
      <div className={styles.travel} data-testid="shop-visit" data-phase={phase}>
        {phase !== 'open' && <button ref={travelButton} className={styles.travelBack} onClick={() => useShop.getState().leave()} aria-disabled={phase === 'returning'}>
          <span aria-hidden="true">←</span> {phase === 'returning' ? 'Back to your room' : 'Back to room'}
        </button>}
        <span className={styles.srOnly} role="status">{phase === 'approaching' ? 'Moving to the wooden shop' : phase === 'returning' ? 'Returning to your room' : 'Shop is open'}</span>
      </div>, document.body,
    )}
    {phase === 'open' && <Shop onClose={() => useShop.getState().leave()} onPlay={(run) => useShop.getState().leave(run)} />}
  </>
}
