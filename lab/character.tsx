import '@fontsource/figtree/600.css'
import '@fontsource/figtree/800.css'
import { Canvas } from '@react-three/fiber'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ACESFilmicToneMapping } from 'three'
import { RENDER } from '../src/animation/config'
import { tutorStatus } from '../src/character/blender/BlenderTutor'
import { BlenderTutorSafe } from '../src/character/blender/BlenderTutorSafe'
import { anchors } from '../src/scene/anchors'
import { Lights } from '../src/scene/Lights'
import { FLOOR_Y, LESSON_CAMERA, PALETTE, ROOM, SPOTS } from '../src/scene/layout3d'
import { LOOP_CLIPS, ONESHOT_CLIPS, useDirector, type FxKind, type Spot } from '../src/state/director'
import { useTutorStore } from '../src/state/store'

// Dev-only lab for the Blender tutor: every clip, the three spots, the voice
// toggle and cap colours on one page. http://localhost:5176/lab/character.html
// ?model=/path/to/other.glb plays a different GLB (its manifest is read from next to it).

const LAB = {
  panelW: 360,
  fxToastMs: 1100,
  fpsWindowMs: 1000,
  floorSize: 30,
  spotRing: [0.28, 0.36] as [number, number],
  spotSegments: 48,
}

// "Tour" button: the walkthrough's moves in one go, [delay ms after the previous step, action].
const TOUR: Array<[number, () => void]> = [
  [0, () => useDirector.getState().play('wave')],
  [1400, () => (useDirector.getState().walkTo('left'), useDirector.getState().setLoop('point_left'))],
  [2000, () => useTutorStore.setState({ mic: 'speaking' })],
  [1600, () => (useTutorStore.setState({ mic: 'idle' }), useDirector.getState().walkTo('right'), useDirector.getState().setLoop('point_right'))],
  [2400, () => (useDirector.getState().walkTo('center'), useDirector.getState().setLoop('idle'))],
  [1500, () => useDirector.getState().play('celebrate')],
  [1900, () => useDirector.getState().play('dance_spin')],
]
let tourTimers: ReturnType<typeof setTimeout>[] = []
function runTour() {
  tourTimers.forEach(clearTimeout)
  let at = 0
  tourTimers = TOUR.map(([delay, step]) => setTimeout(step, (at += delay)))
}

const ACCENTS = [PALETTE.teal, PALETTE.coral, PALETTE.sun, PALETTE.violet, PALETTE.lime, PALETTE.pink, PALETTE.indigo]
const FX_COLOR: Record<FxKind, string> = {
  confetti: PALETTE.coral,
  sparkles: PALETTE.sun,
  hearts: PALETTE.pink,
  stars: PALETTE.violet,
  ring: PALETTE.teal,
  levelup: PALETTE.lime,
}
const SPOT_COLOR: Record<Spot, string> = { left: PALETTE.teal, center: PALETTE.sun, right: PALETTE.coral }

const params = new URLSearchParams(location.search)
const model = params.get('model') ?? undefined

const css = `
  * { box-sizing: border-box; }
  html, body, #root { margin: 0; height: 100%; }
  body { font-family: Figtree, system-ui, sans-serif; background: ${PALETTE.wall}; color: ${PALETTE.ink}; overflow: hidden; }
  .lab { display: grid; grid-template-columns: 1fr ${LAB.panelW}px; height: 100%; }
  .view { position: relative; min-width: 0; }
  .hud { position: absolute; left: 16px; top: 16px; display: flex; flex-wrap: wrap; gap: 8px; pointer-events: none; }
  .pill { font-weight: 800; font-size: 13px; padding: 6px 12px; border-radius: 999px; background: #fff; box-shadow: 0 2px 0 rgba(29,27,36,.12); border: 2px solid ${PALETTE.ink}; }
  .pill b { color: var(--c); }
  .fx { position: absolute; right: 16px; top: 16px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; pointer-events: none; }
  .fx span { font-weight: 800; color: #fff; padding: 6px 14px; border-radius: 999px; font-size: 14px; animation: pop .25s cubic-bezier(.3,1.6,.5,1); }
  @keyframes pop { from { transform: scale(.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }
  .panel { background: #fff; border-left: 3px solid ${PALETTE.ink}; padding: 18px 16px; overflow-y: auto; }
  .panel h1 { font-size: 26px; font-weight: 800; margin: 0 0 4px; letter-spacing: -.02em; }
  .panel h1 em { font-style: normal; color: ${PALETTE.violet}; }
  .panel p.sub { margin: 0 0 14px; font-weight: 600; font-size: 13px; opacity: .65; }
  .panel h2 { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; margin: 16px 0 8px; opacity: .7; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { font: 800 13px Figtree, sans-serif; border: 2px solid var(--c); color: var(--c); background: #fff; border-radius: 10px; padding: 7px 10px; cursor: pointer; transition: transform .08s, background .12s, color .12s; box-shadow: 0 3px 0 var(--c); }
  .chip:hover { transform: translateY(-1px); }
  .chip:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--c); }
  .chip.on { background: var(--c); color: #fff; }
  .swatch { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 0 2px ${PALETTE.ink}; cursor: pointer; }
  .swatch.on { box-shadow: 0 0 0 3px ${PALETTE.ink}, 0 0 0 6px var(--c); }
  .readout { margin-top: 16px; font: 600 12px/1.6 'JetBrains Mono', monospace; background: ${PALETTE.wall}; border-radius: 10px; padding: 10px 12px; white-space: pre-wrap; }
`

function Room() {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, 0]} receiveShadow>
        <planeGeometry args={[LAB.floorSize, LAB.floorSize]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={0.9} />
      </mesh>
      <mesh position={[0, FLOOR_Y + ROOM.height / 2, -ROOM.backZ]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.height]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.95} />
      </mesh>
      {(Object.keys(SPOTS) as Spot[]).map((s) => (
        <mesh key={s} rotation-x={-Math.PI / 2} position={[SPOTS[s].x, FLOOR_Y + 0.003, SPOTS[s].z]}>
          <ringGeometry args={[...LAB.spotRing, LAB.spotSegments]} />
          <meshBasicMaterial color={SPOT_COLOR[s]} toneMapped={false} />
        </mesh>
      ))}
    </>
  )
}

// requestAnimationFrame timing, independent of the R3F loop.
function useFps() {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let frames = 0
    let start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      frames++
      if (now - start >= LAB.fpsWindowMs) {
        const v = Math.round((frames * 1000) / (now - start))
        ;(window as unknown as { __fps: number }).__fps = v
        setFps(v)
        frames = 0
        start = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

function FxToasts() {
  const fx = useDirector((s) => s.fx)
  const clearFx = useDirector((s) => s.clearFx)
  useEffect(() => {
    const timers = fx.map((f) => setTimeout(() => clearFx(f.id), LAB.fxToastMs))
    return () => timers.forEach(clearTimeout)
  }, [fx, clearFx])
  return (
    <div className="fx">
      {fx.map((f) => (
        <span key={f.id} style={{ background: FX_COLOR[f.kind] }}>
          ✦ {f.kind}
        </span>
      ))}
    </div>
  )
}

function Lab() {
  const d = useDirector()
  const speaking = useTutorStore((s) => s.mic === 'speaking')
  const [cap, setCap] = useState<string | undefined>(undefined)
  const [sneaker, setSneaker] = useState<string | undefined>(undefined)
  const [pokes, setPokes] = useState(0)
  const [status, setStatus] = useState({ ...tutorStatus })
  const fps = useFps()

  useEffect(() => {
    const id = setInterval(() => setStatus({ ...tutorStatus }), 120)
    return () => clearInterval(id)
  }, [])

  const poke = () => {
    setPokes((n) => n + 1)
    useDirector.getState().play('giggle')
  }

  return (
    <div className="lab">
      <div className="view">
        <Canvas
          shadows="soft"
          dpr={[1, RENDER.maxDpr]}
          gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: RENDER.exposure }}
          camera={{ fov: LESSON_CAMERA.fov, position: LESSON_CAMERA.position, near: 0.1, far: 100 }}
          onCreated={({ camera }) => camera.lookAt(...LESSON_CAMERA.lookAt)}
        >
          <color attach="background" args={[PALETTE.wall]} />
          <Lights />
          <Room />
          <BlenderTutorSafe src={model} capColor={cap} sneakerColor={sneaker} onPoke={poke} />
        </Canvas>
        <div className="hud">
          <span className="pill" style={{ ['--c' as string]: fps >= 55 ? PALETTE.lime : PALETTE.coral }}>
            <b>{fps}</b> fps
          </span>
          <span className="pill" style={{ ['--c' as string]: PALETTE.violet }}>
            clip <b>{status.clip || '-'}</b>
            {status.playing && status.playing !== status.clip ? ` → ${status.playing}` : ''}
          </span>
          <span className="pill" style={{ ['--c' as string]: PALETTE.teal }}>
            {status.phase} · face <b>{status.face}</b>
          </span>
          <span className="pill" style={{ ['--c' as string]: PALETTE.pink }}>
            pokes <b>{pokes}</b>
          </span>
          <span className="pill" data-anim-state={status.anim?.state ?? ''} style={{ ['--c' as string]: PALETTE.coral }}>
            state <b>{status.anim?.state ?? '-'}</b>
            {status.anim?.queued ? ` · queued ${status.anim.queued}` : ''}
          </span>
        </div>
        <FxToasts />
      </div>

      <aside className="panel">
        <h1>
          Gemini Guy <em>lab</em>
        </h1>
        <p className="sub">{status.loaded ? 'Blender tutor loaded' : 'tutor.glb not loaded: classic fallback'}</p>

        <h2>Loops</h2>
        <div className="chips">
          {LOOP_CLIPS.map((c, i) => (
            <button key={c} className={`chip ${d.loop === c ? 'on' : ''}`} style={{ ['--c' as string]: ACCENTS[i % ACCENTS.length] }} onClick={() => d.setLoop(c)}>
              {c}
            </button>
          ))}
        </div>

        <h2>One-shots</h2>
        <div className="chips">
          {ONESHOT_CLIPS.map((c, i) => (
            <button
              key={c}
              className={`chip ${status.clip === c ? 'on' : ''}`}
              style={{ ['--c' as string]: ACCENTS[(i + 3) % ACCENTS.length] }}
              onClick={() => d.play(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <h2>Walk to</h2>
        <div className="chips">
          {(Object.keys(SPOTS) as Spot[]).map((s) => (
            <button key={s} className={`chip ${d.spot === s ? 'on' : ''}`} style={{ ['--c' as string]: SPOT_COLOR[s] }} onClick={() => d.walkTo(s)}>
              {s}
            </button>
          ))}
          <button className="chip" style={{ ['--c' as string]: PALETTE.violet }} onClick={runTour}>
            ▶ tour
          </button>
        </div>

        <h2>Voice</h2>
        <div className="chips">
          <button
            className={`chip ${speaking ? 'on' : ''}`}
            style={{ ['--c' as string]: PALETTE.indigo }}
            onClick={() => useTutorStore.setState({ mic: speaking ? 'idle' : 'speaking' })}
          >
            {speaking ? 'speaking…' : 'start speaking'}
          </button>
        </div>

        <h2>Cap colour</h2>
        <div className="chips">
          <button className={`swatch ${cap === undefined ? 'on' : ''}`} title="Blender colour" style={{ background: '#fff', ['--c' as string]: PALETTE.ink }} onClick={() => setCap(undefined)} />
          {ACCENTS.map((c) => (
            <button key={c} className={`swatch ${cap === c ? 'on' : ''}`} style={{ background: c, ['--c' as string]: c }} onClick={() => setCap(c)} />
          ))}
        </div>

        <h2>Sneaker colour</h2>
        <div className="chips">
          <button className={`swatch ${sneaker === undefined ? 'on' : ''}`} title="Blender coral" style={{ background: '#fff', ['--c' as string]: PALETTE.ink }} onClick={() => setSneaker(undefined)} />
          {ACCENTS.map((c) => (
            <button key={c} className={`swatch ${sneaker === c ? 'on' : ''}`} style={{ background: c, ['--c' as string]: c }} onClick={() => setSneaker(c)} />
          ))}
        </div>

        <div className="readout">
          {`spot     ${d.spot}\nloop     ${d.loop}\nphase    ${status.phase}\nfx fired ${status.fxFired}\nmissing  ${status.missing.join(', ') || 'none'}`}
          {`\nstate    ${status.anim?.state ?? '-'} (base ${status.anim?.base ?? '-'})\nlast     ${
            status.anim?.last ? `${status.anim.last.from} -> ${status.anim.last.to} ${status.anim.last.clip} (${status.anim.last.reason})` : '-'
          }\ndropped  ${status.anim?.dropped ?? 0}`}
        </div>
      </aside>
    </div>
  )
}

const style = document.createElement('style')
style.textContent = css
document.head.appendChild(style)
Object.assign(window, { __lab: { director: useDirector, store: useTutorStore, status: tutorStatus, anchors } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
)
