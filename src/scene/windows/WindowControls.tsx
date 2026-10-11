import { useEffect, type CSSProperties, type MouseEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { useDirector } from '../../state/director'
import { useWindows } from '../../state/windows'
import { tabInfo } from './tabInfo'
import { WIN } from './tabModel'
import { WINDOW_UI } from './windowConfig'
import { WINDOW_STYLE } from './windowStyle'
import s from './WindowControls.module.css'

// The window's DOM controls, laid over the canvas: the traffic lights as real
// buttons (red closes the window, yellow minimizes it into its chip, green
// toggles maximized) and the restore chip that brings a minimized window
// back. The 3D window draws the dots; these buttons sit exactly on them
// (minimizeRig.ts maps them onto the tab strip every frame) and show the
// glyphs on hover or keyboard focus. They render into a small React root
// inside the canvas's wrapper (useWindowControls), so they stack under the
// page's chrome (caption, bars, drawers) like the canvas does.

const LIGHTS = WINDOW_STYLE.tabStrip.lights
const PX = WINDOW_UI.minimize.lightsPxPerUnit

// The lights' box in window-local units: one button per dot, `gap` wide and
// hitH tall, centred on the dots (x from the window's left edge).
export const LIGHTS_BOX = { x0: LIGHTS.x - LIGHTS.gap / 2, x1: LIGHTS.x + LIGHTS.gap * 2.5, h: LIGHTS.hitH, dy: LIGHTS.dy }
export const LIGHTS_PX = { w: Math.round((LIGHTS_BOX.x1 - LIGHTS_BOX.x0) * PX), h: Math.round(LIGHTS.hitH * PX) }

export const WIN_NAME = 'Browser' // the chip's heading; the lights' labels say 'browser window'

// The DOM parts the frame loop drives directly (no React state per frame).
export interface ControlParts {
  host: HTMLDivElement | null
  lights: HTMLDivElement | null
  chip: HTMLButtonElement | null
  focus: 'chip' | 'lights' | null // a keyboard press moves focus here once it shows
}

export const controlParts = (): ControlParts => ({ host: null, lights: null, chip: null, focus: null })

type Light = 'close' | 'minimize' | 'maximize'
const ORDER: Light[] = ['close', 'minimize', 'maximize']

function Glyph({ kind }: { kind: Light }) {
  return (
    <svg className={s.glyph} viewBox="0 0 12 12" aria-hidden="true">
      {kind === 'close' && <path d="M3.6 3.6 8.4 8.4M8.4 3.6 3.6 8.4" />}
      {kind === 'minimize' && <path d="M2.8 6h6.4" />}
      {kind === 'maximize' && <path d="M6 2.8v6.4M2.8 6h6.4" />}
    </svg>
  )
}

// Both let go of the tutor's focus on the window (the camera pans back).
function letGo() {
  const d = useDirector.getState()
  if (d.focus !== 'none') d.setFocus('none')
}

// Yellow: fold into the restore chip; the tabs stay as they are.
function fold(parts: ControlParts, e: MouseEvent) {
  useWindows.getState().minimize(WIN)
  letGo()
  if (e.detail === 0) parts.focus = 'chip' // keyboard: follow the window into its chip
}

// Red: the window goes, no chip. Its own tabs (scratch, new tab, PDF pages)
// go with it; the lesson builds its tabs fresh when it next needs the window.
// A keyboard press can't leave focus on the hidden button: it moves to the
// stage (the canvas's wrapper), and back to the lights when the window opens
// again, if nothing else took it meanwhile (minimizeRig.glue).
function shut(parts: ControlParts, e: MouseEvent) {
  useWindows.getState().close(WIN)
  letGo()
  if (e.detail !== 0) return
  parts.focus = 'lights'
  const stage = parts.host?.parentElement
  if (!stage) return
  if (!stage.hasAttribute('tabindex')) {
    stage.tabIndex = -1 // focusable from script only, never a tab stop
    stage.style.outline = 'none'
  }
  stage.focus({ preventScroll: true })
}

function unfold(parts: ControlParts, e: MouseEvent) {
  useWindows.getState().restore(WIN)
  if (e.detail === 0) parts.focus = 'lights'
}

export function WindowControls({ parts }: { parts: ControlParts }) {
  const isMax = useWindows((st) => st.maximized !== null)
  const wt = useWindows((st) => st.tabs[WIN])
  const tab = wt.tabs.find((t) => t.id === wt.active) ?? wt.tabs[0]
  const info = tab ? tabInfo(tab) : { title: 'New tab', color: WINDOW_STYLE.kinds.newtab }
  const step = LIGHTS.gap * PX
  const label: Record<Light, string> = { close: 'Close browser window', minimize: 'Minimize browser window', maximize: 'Maximize browser window' }
  const act: Record<Light, (e: MouseEvent) => void> = {
    close: (e) => shut(parts, e),
    minimize: (e) => fold(parts, e),
    maximize: () => useWindows.getState().toggleMaximize(WIN),
  }

  return (
    <>
      <div
        ref={(el) => {
          parts.lights = el
          return () => void (parts.lights === el && (parts.lights = null))
        }}
        className={s.lights}
        role="group"
        aria-label="Browser window"
        data-win={WIN}
        style={{ width: LIGHTS_PX.w, height: LIGHTS_PX.h }}
      >
        {ORDER.map((kind, i) => (
          <button
            key={kind}
            type="button"
            className={s.light}
            data-light={kind}
            aria-label={label[kind]}
            aria-pressed={kind === 'maximize' ? isMax : undefined}
            onClick={act[kind]}
            style={{ left: i * step, width: step, '--d': `${LIGHTS.size * 2 * PX}px`, '--c': LIGHTS.colors[i] } as CSSProperties}
          >
            <span className={s.dot}>
              <Glyph kind={kind} />
            </span>
          </button>
        ))}
      </div>

      <button
        ref={(el) => {
          parts.chip = el
          return () => void (parts.chip === el && (parts.chip = null))
        }}
        type="button"
        className={s.chip}
        data-win={WIN}
        aria-label={`Restore browser window: ${info.title}`}
        onClick={(e) => unfold(parts, e)}
        style={{ '--accent': WINDOW_STYLE.chipAccent, '--favicon': info.color } as CSSProperties}
      >
        <span className={s.stripe} />
        <span className={s.text}>
          <span className={s.kind}>
            <span className={s.minis}>
              {LIGHTS.colors.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            {WIN_NAME}
          </span>
          <span className={s.title}>
            <span className={s.favicon} />
            <span className={s.titleText}>{info.title}</span>
          </span>
        </span>
        <span className={s.icon}>
          {/* Restore: a window with an arrow coming out of it. */}
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9 2.5h4.5V7M13.5 2.5 8 8M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
          </svg>
        </span>
      </button>
    </>
  )
}

// Clicks, presses and wheels on the controls stay out of the 3D scene (R3F
// listens on the canvas's wrapper, which these sit inside), and Enter / Space
// on a focused light stay out of the app's keyboard shortcuts.
const SWALLOW = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'wheel', 'click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup']
const stop = (e: Event) => e.stopPropagation()
const stopKeys = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
}

// Mounts the window's controls in the canvas's wrapper for as long as the
// window is mounted; `parts` gets the live elements.
export function useWindowControls(parts: ControlParts, canvas: HTMLCanvasElement) {
  useEffect(() => {
    const wrap = canvas.parentElement
    if (!wrap) return
    const host = document.createElement('div')
    host.dataset.gg = 'window-controls'
    Object.assign(host.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '2' } satisfies Partial<CSSStyleDeclaration>)
    for (const type of SWALLOW) host.addEventListener(type, stop)
    host.addEventListener('keydown', stopKeys)
    host.addEventListener('keyup', stopKeys)
    wrap.appendChild(host)
    parts.host = host
    const root = createRoot(host)
    root.render(<WindowControls parts={parts} />)
    return () => {
      if (parts.host === host) parts.host = null
      // Unmount after this commit: React refuses to unmount a root synchronously mid-render.
      queueMicrotask(() => {
        root.unmount()
        host.remove()
      })
    }
  }, [canvas, parts])
}
