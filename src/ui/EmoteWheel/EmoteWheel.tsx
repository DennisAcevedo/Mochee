import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/jetbrains-mono/500.css'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useProgress } from '../../state/progress'
import { SHOP_ITEMS } from '../Shop/items'
import styles from './EmoteWheel.module.css'

// The emote wheel (design: emote-wheel.html): every animation he already has
// (the free ones and the dances bought in the shop) on a ring that turns the
// short way to the pick. The pick's name sits beside the wheel; the centre
// button plays it on the stage and closes the wheel. Wheel, arrows or a click
// on a bubble turn it; Enter plays; Esc closes.

const WHEEL = {
  size: 460, // px
  radius: 196, // bubble centres, px from the middle
  bubble: 84, // px, shrunk to fit when there are many
  gap: 8, // px kept between neighbouring bubbles
  wheelMs: 260, // one turn per mouse-wheel burst
} as const

// Not animations: the cap recolours him, party lights only light up a dance.
const NOT_EMOTES = new Set(['cap', 'lights'])

const mod = (x: number, m: number) => ((x % m) + m) % m

export function EmoteWheel({ onClose }: { onClose: () => void }) {
  const owned = useProgress((s) => s.owned)
  const items = SHOP_ITEMS.filter((it) => !NOT_EMOTES.has(it.id) && (!it.unlock || owned.includes(it.unlock)))
  const n = items.length
  const deg = 360 / n
  const c = WHEEL.size / 2
  const bubble = Math.min(WHEEL.bubble, (2 * Math.PI * WHEEL.radius) / n - WHEEL.gap)
  const [pos, setPos] = useState(0) // unbounded, so the ring always turns the short way
  const [nope, setNope] = useState(false)
  const wheel = useRef<HTMLDivElement>(null)
  const last = useRef(0)
  const cur = mod(pos, n)
  const it = items[cur]

  const move = (d: number) => setPos((p) => p + d)
  const play = () => {
    if (it.run()) return onClose()
    setNope(true)
    window.setTimeout(() => setNope(false), 380)
  }
  const playRef = useRef(play)
  playRef.current = play

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(-1)
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(1)
      else if (e.key === 'Enter') playRef.current()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    const el = wheel.current
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const now = Date.now()
      if (now - last.current < WHEEL.wheelMs) return
      last.current = now
      move((Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) > 0 ? 1 : -1)
    }
    window.addEventListener('keydown', onKey, true)
    el?.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      el?.removeEventListener('wheel', onWheel)
    }
  }, [onClose])

  return createPortal(
    <div className={styles.overlay} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.card} role="dialog" aria-modal="true" aria-label="Emotes">
        <button type="button" className={styles.close} aria-label="Close emotes" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className={styles.wheel} ref={wheel} style={{ width: WHEEL.size, height: WHEEL.size }}>
          <div className={styles.pointer} />
          <div className={styles.guide} />
          <div className={styles.ring} style={{ transform: `rotate(${-pos * deg}deg)` }}>
            {items.map((item, i) => {
              const a = (i / n) * Math.PI * 2
              const sel = i === cur
              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.item}
                  data-sel={sel || undefined}
                  aria-label={item.name}
                  aria-pressed={sel}
                  onClick={() => {
                    const d = mod(i - cur + n / 2, n) - n / 2
                    if (d) move(Math.round(d))
                    else play()
                  }}
                  style={
                    {
                      left: c + WHEEL.radius * Math.sin(a),
                      top: c - WHEEL.radius * Math.cos(a),
                      width: bubble,
                      height: bubble,
                      margin: -bubble / 2,
                      fontSize: bubble < 70 ? 12 : 14,
                      background: item.color,
                      transform: `rotate(${pos * deg}deg) scale(${sel ? 1.18 : 1})`,
                    } as CSSProperties
                  }
                >
                  {item.name.replace(/ dance$/, '')}
                </button>
              )
            })}
          </div>
          <button type="button" className={styles.center} data-nope={nope || undefined} onClick={play} aria-label={`Play ${it.name}`}>
            <span className={styles.playDisc} style={{ background: it.color }} aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
              </svg>
            </span>
            <span className={styles.playLabel}>Play</span>
          </button>
        </div>
        <div className={styles.side}>
          <div className={styles.count}>
            EMOTE {cur + 1} / {n}
          </div>
          <div className={styles.name} data-testid="emote-current">
            {it.name}
          </div>
          <div className={styles.btns}>
            <button type="button" className={styles.btn} style={{ background: '#A78BFA' }} aria-label="Previous" onClick={() => move(-1)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12a8 8 0 1 0 2.5-5.8" />
                <path d="M4 4v5h5" />
              </svg>
            </button>
            <button type="button" className={styles.btn} style={{ background: '#FCC934' }} aria-label="Next" onClick={() => move(1)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'scaleX(-1)' }}>
                <path d="M4 12a8 8 0 1 0 2.5-5.8" />
                <path d="M4 4v5h5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
