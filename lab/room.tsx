import '@fontsource/figtree/600.css'
import '@fontsource/figtree/800.css'
import '@fontsource/jetbrains-mono/500.css'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, type CSSProperties, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ACESFilmicToneMapping, MathUtils, type Group, type PerspectiveCamera } from 'three'
import { RENDER } from '../src/animation/config'
import { notesTabs } from '../src/data/stageContent'
import { anchors } from '../src/scene/anchors'
import { FLOOR_Y, LESSON_CAMERA, PALETTE, SPOTS, TUTOR_SCALE } from '../src/scene/layout3d'
import { Lights } from '../src/scene/Lights'
import { LessonRoom } from '../src/scene/room/LessonRoom'
import { useDirector, type Focus, type Spot } from '../src/state/director'
import { useTutorStore } from '../src/state/store'

// Dev-only preview of the white-box room and the two 3D windows (not part
// of the production build). Buttons drive the director and the tutor store;
// window.__director / window.__tutor let scripts set states directly.

const LAB = {
  camDamp: 3,
  tutor: { radius: 0.42, length: 0.55, float: 0.12, damp: 4, bob: { amp: 0.04, f: 2.2 } },
}

declare global {
  interface Window {
    __director: typeof useDirector
    __tutor: typeof useTutorStore
    __anchors: typeof anchors
  }
}
window.__director = useDirector
window.__tutor = useTutorStore
window.__anchors = anchors

// LESSON_CAMERA, panned toward the focused window as the real CameraRig will.
function LabCamera() {
  useFrame(({ camera }, dt) => {
    const focus = useDirector.getState().focus
    const shift = focus === 'notes' ? -LESSON_CAMERA.focusShift : focus === 'board' ? LESSON_CAMERA.focusShift : 0
    const cam = camera as PerspectiveCamera
    const x = MathUtils.damp(cam.position.x, LESSON_CAMERA.position[0] + shift, LAB.camDamp, dt)
    cam.position.set(x, LESSON_CAMERA.position[1], LESSON_CAMERA.position[2])
    cam.lookAt(LESSON_CAMERA.lookAt[0] + x, LESSON_CAMERA.lookAt[1], LESSON_CAMERA.lookAt[2])
  })
  return null
}

// Placeholder for the Blender tutor: a white capsule with eyes, walking between spots.
function TutorStandIn() {
  const ref = useRef<Group>(null)
  const t = LAB.tutor
  useFrame(({ clock }, dt) => {
    const g = ref.current
    if (!g) return
    const spot = SPOTS[useDirector.getState().spot]
    g.position.x = MathUtils.damp(g.position.x, spot.x, t.damp, dt)
    g.position.z = MathUtils.damp(g.position.z, spot.z, t.damp, dt)
    g.position.y = FLOOR_Y + t.float + t.bob.amp * (1 + Math.sin(clock.elapsedTime * t.bob.f))
    anchors.tutor.set(g.position.x, g.position.y + (t.radius * 2 + t.length) * (TUTOR_SCALE / 0.62), g.position.z)
  })
  const half = t.radius + t.length / 2
  return (
    <group ref={ref} position={[SPOTS.center.x, FLOOR_Y, SPOTS.center.z]}>
      <mesh position={[0, half, 0]} castShadow>
        <capsuleGeometry args={[t.radius, t.length, 8, 24]} />
        <meshStandardMaterial color="#ffffff" roughness={0.35} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.15, half + 0.22, t.radius - 0.02]} scale={[1, 1.15, 0.5]}>
          <sphereGeometry args={[0.065, 16, 16]} />
          <meshStandardMaterial color="#131316" roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, half + t.length / 2 + t.radius + 0.02, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.06, 32]} />
        <meshStandardMaterial color={PALETTE.violet} roughness={0.5} />
      </mesh>
    </group>
  )
}

const bar: CSSProperties = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 12,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  padding: '10px 12px',
  borderRadius: 16,
  background: 'rgba(255,255,255,0.9)',
  boxShadow: '0 8px 24px -12px rgba(40,40,50,0.35)',
  font: "700 13px 'Figtree', system-ui, sans-serif",
  zIndex: 2,
}

function Btn({ on, color = PALETTE.teal, onClick, children }: { on?: boolean; color?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 32,
        padding: '0 12px',
        borderRadius: 10,
        border: `2px solid ${color}`,
        background: on ? color : '#fff',
        color: on ? '#fff' : PALETTE.ink,
        font: 'inherit',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const Cluster = ({ label, children }: { label: string; children: ReactNode }) => (
  <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 10 }}>
    <span style={{ color: '#8a857d', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
    {children}
  </span>
)

function Controls() {
  const d = useDirector()
  const mode = useTutorStore((s) => s.mode)
  const setMode = useTutorStore((s) => s.setMode)
  const ids = notesTabs[d.notesTab]?.lines.map((l) => l.id) ?? []
  const nextHighlight = () => {
    const i = d.highlight ? ids.indexOf(d.highlight) : -1
    d.setHighlight(i + 1 < ids.length ? ids[i + 1] : null)
  }
  const reveal = Number.isFinite(d.boardReveal) ? d.boardReveal : 7
  return (
    <div style={bar}>
      <Cluster label="Focus">
        {(['none', 'notes', 'board'] as Focus[]).map((f) => (
          <Btn key={f} on={d.focus === f} onClick={() => d.setFocus(f)}>
            {f}
          </Btn>
        ))}
      </Cluster>
      <Cluster label="Spot">
        {(['left', 'center', 'right'] as Spot[]).map((s) => (
          <Btn key={s} on={d.spot === s} color={PALETTE.violet} onClick={() => d.walkTo(s)}>
            {s}
          </Btn>
        ))}
      </Cluster>
      <Cluster label="Notes tab">
        {notesTabs.map((t, i) => (
          <Btn key={t.title} on={d.notesTab === i} color={PALETTE.coral} onClick={() => d.setNotesTab(i)}>
            {i + 1}
          </Btn>
        ))}
      </Cluster>
      <Cluster label="Highlight">
        <Btn on={!!d.highlight} color={PALETTE.sun} onClick={nextHighlight}>
          {d.highlight ?? 'none'} →
        </Btn>
      </Cluster>
      <Cluster label="Board">
        <Btn color={PALETTE.lime} onClick={() => d.setBoardReveal(Math.max(0, reveal - 1))}>
          −
        </Btn>
        <span style={{ minWidth: 18, textAlign: 'center' }}>{reveal}</span>
        <Btn color={PALETTE.lime} onClick={() => d.setBoardReveal(Math.min(7, reveal + 1))}>
          +
        </Btn>
      </Cluster>
      <Cluster label="Mode">
        <Btn on={mode === 'lecture'} color={PALETTE.indigo} onClick={() => setMode('lecture')}>
          lecture
        </Btn>
        <Btn on={mode === 'quiz'} color={PALETTE.pink} onClick={() => setMode('quiz')}>
          quiz
        </Btn>
      </Cluster>
    </div>
  )
}

function App() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#ece9e3' }}>
      <Canvas
        shadows="soft"
        dpr={[1, RENDER.maxDpr]}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: RENDER.exposure }}
        camera={{ fov: LESSON_CAMERA.fov, near: 0.1, far: 100, position: LESSON_CAMERA.position }}
        onCreated={({ camera }) => camera.lookAt(...LESSON_CAMERA.lookAt)}
      >
        <LabCamera />
        <Lights />
        <LessonRoom />
        <TutorStandIn />
      </Canvas>
      <Controls />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
