// Dev-only lab for the stage's two worlds (src/scene/worlds): WorldSwitch
// under the lesson camera exactly as CameraRig frames it once live, with the
// browser window, the Blender tutor and (in play) the physics toys, so the toy
// hoop can be checked against the gym's wall mount. Not part of the build.
// URL: ?mode=study|play|celebrate &frame=lesson|full &toys=0 &hoop=mount|full &ui=0 &outline=1 &void=1
// window.__worlds lets scripts flip the mode, the frame and the scoreboard.
import '@fontsource/figtree/600.css'
import '@fontsource/figtree/800.css'
import '@fontsource/jetbrains-mono/500.css'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ACESFilmicToneMapping, type PerspectiveCamera, type Scene } from 'three'
import { RENDER } from '../src/animation/config'
import { BlenderTutorSafe } from '../src/character/blender/BlenderTutorSafe'
import { tutorStatus } from '../src/character/blender/BlenderTutor'
import { cameraPan, LESSON_CAMERA, PALETTE } from '../src/scene/layout3d'
import { Lights } from '../src/scene/Lights'
import { PhysicsRoom, PhysicsTutor, Toys } from '../src/scene/physics'
import { NotesWindow } from '../src/scene/windows'
import { useGym, WorldSwitch, type HoopDraw } from '../src/scene/worlds'
import { useDirector, type Focus } from '../src/state/director'
import { useMode, type StageMode } from '../src/state/mode'

type FrameKind = 'lesson' | 'full'

const params = new URLSearchParams(location.search)
const LAB = {
  // The lesson page's stage frame, as measured at 1280/1456/1920 wide: 68 px
  // under the top, 129 px over the bottom, 16:9, centred between 72 px gutters.
  lesson: { top: 68, bottom: 129, gutter: 72, maxWidth: 1760 },
  glass: 'rgba(255,255,255,0.86)',
}

// Lab state outside React so scripts can drive it.
interface LabSettings {
  frame: FrameKind
  toys: boolean
  hoop: HoopDraw
  ui: boolean
  outline: boolean
}
interface LabState extends LabSettings {
  listeners: Set<() => void>
  version: number
  set: (patch: Partial<LabSettings>) => void
}
const lab: LabState = {
  frame: params.get('frame') === 'full' ? 'full' : 'lesson',
  toys: params.get('toys') !== '0',
  hoop: params.get('hoop') === 'full' ? 'full' : 'mount',
  ui: params.get('ui') !== '0',
  outline: params.get('outline') === '1',
  listeners: new Set(),
  version: 0,
  set(patch) {
    Object.assign(lab, patch)
    lab.version++
    lab.listeners.forEach((l) => l())
  },
}
const subscribe = (l: () => void) => {
  lab.listeners.add(l)
  return () => lab.listeners.delete(l)
}
const useLab = () => {
  useSyncExternalStore(subscribe, () => lab.version)
  return lab
}

// ?void=1 paints the page magenta behind the (transparent) canvas, so any gap in the room shows.
if (params.get('void') === '1') document.body.style.background = '#ff00ff'

const startMode = params.get('mode')
if (startMode === 'play' || startMode === 'celebrate' || startMode === 'study') useMode.getState().setMode(startMode)

declare global {
  interface Window {
    __worlds: {
      mode: typeof useMode
      gym: typeof useGym
      director: typeof useDirector
      tutor: typeof tutorStatus
      lab: typeof lab
      scene?: Scene // the R3F scene, for probes that read the fade off the materials
    }
  }
}
window.__worlds = { mode: useMode, gym: useGym, director: useDirector, tutor: tutorStatus, lab }

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// Where LessonPage letterboxes the 16:9 stage frame, or the whole window.
function frameRect(kind: FrameKind, vw: number, vh: number): Rect {
  if (kind === 'full') return { x: 0, y: 0, w: vw, h: vh }
  const L = LAB.lesson
  const a = LESSON_CAMERA.aspect
  const w = Math.floor(Math.min(vw - L.gutter * 2, (vh - L.top - L.bottom) * a, L.maxWidth))
  const h = w / a
  return { x: (vw - w) / 2, y: L.top + (vh - L.top - L.bottom - h) / 2, w, h }
}

// Hands the scene to window.__worlds for probe scripts.
function SceneHandle() {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    window.__worlds.scene = scene
  }, [scene])
  return null
}

// CameraRig once live: LESSON_CAMERA rendered into the frame rect (the
// canvas runs on past it), panned toward the focused window.
function LabCamera() {
  useFrame((state) => {
    const cam = state.camera as PerspectiveCamera
    const vw = state.size.width
    const vh = state.size.height
    if (!vw || !vh) return
    const f = frameRect(lab.frame, vw, vh)
    const shift = cameraPan(useDirector.getState().focus, null)
    const P = LESSON_CAMERA.position
    const A = LESSON_CAMERA.lookAt
    cam.fov = LESSON_CAMERA.fov
    cam.aspect = f.w / f.h
    cam.setViewOffset(f.w, f.h, -f.x, -f.y, vw, vh)
    cam.position.set(P[0] + shift, P[1], P[2])
    cam.lookAt(A[0] + shift, A[1], A[2])
    cam.updateMatrixWorld()
  }, -1)
  return null
}

function Pill({ on, color, onClick, children }: { on?: boolean; color: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 32,
        padding: '0 12px',
        borderRadius: 999,
        border: `2px solid ${color}`,
        background: on ? color : '#fff',
        color: on ? '#fff' : PALETTE.ink,
        font: "800 12px 'Figtree', system-ui, sans-serif",
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <span style={{ display: 'flex', gap: 5, alignItems: 'center', marginRight: 8 }}>
    <span style={{ color: '#7d7a86', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
    {children}
  </span>
)

const panel: CSSProperties = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 12,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  padding: '8px 10px',
  borderRadius: 16,
  background: LAB.glass,
  boxShadow: '0 10px 30px -14px rgba(40,40,60,0.4)',
  font: "700 13px 'Figtree', system-ui, sans-serif",
  color: PALETTE.ink,
  zIndex: 2,
}

function Controls() {
  const l = useLab()
  const mode = useMode((s) => s.mode)
  const setMode = useMode((s) => s.setMode)
  const focus = useDirector((s) => s.focus)
  const gym = useGym()
  if (!l.ui) return null
  const modes: [StageMode, string][] = [
    ['study', PALETTE.indigo],
    ['play', '#FF7A45'],
    ['celebrate', PALETTE.pink],
  ]
  return (
    <div style={panel}>
      <Group label="Mode">
        {modes.map(([m, c]) => (
          <Pill key={m} on={mode === m} color={c} onClick={() => setMode(m)}>
            {m}
          </Pill>
        ))}
      </Group>
      <Group label="Frame">
        {(['lesson', 'full'] as FrameKind[]).map((f) => (
          <Pill key={f} on={l.frame === f} color={PALETTE.teal} onClick={() => lab.set({ frame: f })}>
            {f}
          </Pill>
        ))}
        <Pill on={l.outline} color={PALETTE.teal} onClick={() => lab.set({ outline: !l.outline })}>
          outline
        </Pill>
      </Group>
      <Group label="Focus">
        {(['none', 'notes', 'board'] as Focus[]).map((f) => (
          <Pill key={f} on={focus === f} color={PALETTE.violet} onClick={() => useDirector.getState().setFocus(f)}>
            {f}
          </Pill>
        ))}
      </Group>
      <Group label="Hoop">
        <Pill on={l.toys} color={PALETTE.coral} onClick={() => lab.set({ toys: !l.toys })}>
          toys
        </Pill>
        {(['mount', 'full'] as HoopDraw[]).map((h) => (
          <Pill key={h} on={l.hoop === h} color={PALETTE.coral} onClick={() => lab.set({ hoop: h })}>
            {h}
          </Pill>
        ))}
      </Group>
      <Group label={`Shots ${gym.makes} / ${gym.attempts}`}>
        <Pill color={PALETTE.lime} onClick={() => gym.recordShot(true)}>
          make
        </Pill>
        <Pill color={PALETTE.lime} onClick={() => gym.recordShot(false)}>
          miss
        </Pill>
        <Pill color={PALETTE.lime} onClick={() => gym.reset()}>
          reset
        </Pill>
      </Group>
    </div>
  )
}

// Dashed outline of the lesson frame, to see what lands inside it.
function FrameOutline() {
  const l = useLab()
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight })
  useEffect(() => {
    const on = () => setSize({ w: innerWidth, h: innerHeight })
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])
  if (!l.outline) return null
  const f = frameRect(l.frame, size.w, size.h)
  return <div style={{ position: 'fixed', left: f.x, top: f.y, width: f.w, height: f.h, outline: '2px dashed rgba(27,29,42,0.5)', pointerEvents: 'none', zIndex: 1 }} />
}

function App() {
  const l = useLab()
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows="soft"
        dpr={[1, RENDER.maxDpr]}
        gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: RENDER.exposure }}
        camera={{ fov: LESSON_CAMERA.fov, near: 0.1, far: 100, position: LESSON_CAMERA.position }}
        onCreated={({ camera }) => {
          ;(camera as PerspectiveCamera & { manual?: boolean }).manual = true
        }}
      >
        <LabCamera />
        <SceneHandle />
        <Lights />
        <WorldSwitch hoop={l.hoop} />
        <Suspense fallback={null}>
          <NotesWindow />
        </Suspense>
        <Suspense fallback={null}>
          <PhysicsRoom>
            <PhysicsTutor>
              <BlenderTutorSafe />
            </PhysicsTutor>
            {l.toys && <Toys />}
          </PhysicsRoom>
        </Suspense>
      </Canvas>
      <FrameOutline />
      <Controls />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
