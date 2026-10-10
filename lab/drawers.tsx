// Dev-only lab for the app-shell drawers and the mode switch, over a plain
// gradient instead of the 3D stage. Talks to the REAL docs endpoints; while
// the backend is missing the drawers show their not-ready states. The voice
// starts muted here so testing never spends ElevenLabs characters.
// Not part of the production build.
import '@fontsource/figtree/600.css'
import '@fontsource/figtree/700.css'
import '@fontsource/figtree/800.css'
import '@fontsource/figtree/900.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useWalkthrough } from '../src/lesson/runner'
import { PALETTE } from '../src/scene/layout3d'
import { useDirector } from '../src/state/director'
import { useDrawers } from '../src/state/drawers'
import { useGrowth } from '../src/state/growth'
import { useMode } from '../src/state/mode'
import { useProgress } from '../src/state/progress'
import '../src/styles/global.css'
import { Drawers } from '../src/ui/Drawers/Drawers'
import { useDocs } from '../src/ui/Drawers/docsStore'
import { ModeSwitch } from '../src/ui/ModeSwitch/ModeSwitch'

const LAB = {
  seedStep: 4, // walkthrough step shown as current by "Seed"
} as const

// Stores on window so the Playwright check can drive and read them.
Object.assign(window, { __lab: { useDrawers, useGrowth, useWalkthrough, useMode, useDirector, useProgress, useDocs } })
useWalkthrough.getState().setMuted(true)

// Sample growth + lesson position, for looking at the filled Quest tab.
function seed() {
  const g = useGrowth.getState()
  g.recordAnswer({ id: 'builtin:fcfs', title: 'First-come, first-served', documentId: null }, true)
  g.recordAnswer({ id: 'builtin:convoy', title: 'Convoy effect', documentId: null }, false)
  g.recordAnswer({ id: 'builtin:convoy', title: 'Convoy effect', documentId: null }, true)
  g.recordAnswer({ id: 'builtin:wait', title: 'Waiting time', documentId: null }, false)
  useGrowth.setState((s) => ({
    abilities: [{ id: 'queue_juggle', topicId: 'builtin:fcfs', learnedAt: Date.now() }, ...s.abilities.filter((a) => a.id !== 'queue_juggle')],
  }))
  useWalkthrough.setState({ started: true, index: LAB.seedStep, phase: 'idle', playing: false })
}

function DevStrip() {
  const caption = useDirector((d) => d.caption)
  const gesture = useDirector((d) => d.gesture)
  const loop = useDirector((d) => d.loop)
  const fx = useDirector((d) => d.fx)
  const mode = useMode((m) => m.mode)
  const muted = useWalkthrough((w) => w.muted)
  return (
    <div className="dev">
      <button type="button" onClick={seed}>
        Seed
      </button>
      <button type="button" onClick={() => useMode.getState().setMode(mode === 'celebrate' ? 'study' : 'celebrate')}>
        {mode === 'celebrate' ? 'End celebrate' : 'Celebrate'}
      </button>
      <button type="button" onClick={() => useWalkthrough.getState().setMuted(!muted)}>
        Voice {muted ? 'off' : 'on'}
      </button>
      <span>
        loop <b>{loop}</b> &middot; clip <b>{gesture?.clip ?? '-'}</b> &middot; fx <b>{fx[fx.length - 1]?.kind ?? '-'}</b>
      </span>
      {caption && <span className="cap">{caption.replace(/\*\*/g, '')}</span>}
    </div>
  )
}

const css = `
  body { margin: 0; overflow: hidden; background: radial-gradient(120% 90% at 50% 0%, #ffffff 0%, ${PALETTE.wall} 55%, #e9e6f7 100%); }
  .stage { position: fixed; inset: 0; display: grid; place-items: center; }
  .stage .floor { width: min(46vw, 520px); aspect-ratio: 1.6; border-radius: 50%; background: radial-gradient(closest-side, rgba(124,92,242,.16), transparent); }
  .stage .tutor { position: absolute; width: 120px; height: 120px; border-radius: 50% 50% 46% 46%; background: #fff; box-shadow: 0 30px 50px -30px rgba(61,90,214,.6), inset 0 -10px 20px rgba(29,27,36,.06); }
  .top { position: fixed; top: 18px; left: 0; right: 0; display: flex; justify-content: center; z-index: 20; }
  .dev { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; max-width: calc(100vw - 32px); padding: 6px 10px; border-radius: 14px; background: rgba(29,27,36,.82); color: #fff; font: 600 11.5px Figtree, system-ui; z-index: 10; }
  .dev button { font: 800 11.5px Figtree, system-ui; border: 0; border-radius: 8px; padding: 4px 8px; background: rgba(255,255,255,.16); color: #fff; cursor: pointer; }
  .dev .cap { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #c9bdff; }
  @media (max-width: 759px) { .dev { bottom: auto; top: 76px; } }
`

function Lab() {
  return (
    <>
      <style>{css}</style>
      <div className="stage" aria-hidden>
        <div className="floor" />
        <div className="tutor" />
      </div>
      <div className="top">
        <ModeSwitch />
      </div>
      <Drawers />
      <DevStrip />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
)
