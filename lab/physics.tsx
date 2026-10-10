// Dev-only lab for physics play: the white-box room, the Blender tutor wrapped
// in PhysicsTutor, the toys (ball, hoop, FCFS blocks), the effects layer and
// a mode switch. Not part of the production build. window.__physics lets
// scripts toss him, shoot the ball and read his body state.
import '@fontsource/figtree/600.css'
import '@fontsource/figtree/800.css'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useState, type CSSProperties, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ACESFilmicToneMapping } from 'three'
import { RENDER } from '../src/animation/config'
import { BlenderTutorSafe } from '../src/character/blender/BlenderTutorSafe'
import { tutorStatus } from '../src/character/blender/BlenderTutor'
import { poke } from '../src/play/actions'
import { FxLayer } from '../src/scene/fx/FxLayer'
import { LESSON_CAMERA, PALETTE } from '../src/scene/layout3d'
import { Lights } from '../src/scene/Lights'
import { PhysicsRoom, PhysicsTutor, shootBall, tossTutor, Toys, usePlayBody } from '../src/scene/physics'
import { LessonRoom } from '../src/scene/room/LessonRoom'
import { useDirector } from '../src/state/director'
import { useMode, type StageMode } from '../src/state/mode'
import { useProgress } from '../src/state/progress'

const LAB = {
  glass: 'rgba(255,255,255,0.82)',
  shadow: '0 10px 30px -14px rgba(40,40,60,0.4)',
  modes: [
    ['study', PALETTE.indigo],
    ['play', PALETTE.violet],
    ['celebrate', PALETTE.coral],
  ] as [StageMode, string][],
}

declare global {
  interface Window {
    __physics: {
      tossTutor: typeof tossTutor
      shootBall: typeof shootBall
      body: typeof usePlayBody
      mode: typeof useMode
      director: typeof useDirector
      progress: typeof useProgress
      tutor: typeof tutorStatus
      project?: (x: number, y: number, z: number) => [number, number]
      find?: (name: string) => [number, number, number] | null
    }
  }
}
window.__physics = { tossTutor, shootBall, body: usePlayBody, mode: useMode, director: useDirector, progress: useProgress, tutor: tutorStatus }

// Lets scripts turn a world point into page pixels (to aim mouse drags).
function ExposeProjection() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const scene = useThree((s) => s.scene)
  window.__physics.find = (name) => {
    const o = scene.getObjectByName(name)
    return o ? [o.position.x, o.position.y, o.position.z] : null
  }
  window.__physics.project = (x, y, z) => {
    const v = camera.position.clone().set(x, y, z).project(camera)
    return [size.left + ((v.x + 1) / 2) * size.width, size.top + ((1 - v.y) / 2) * size.height]
  }
  return null
}

const panel: CSSProperties = {
  position: 'fixed',
  left: 16,
  right: 16,
  bottom: 16,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
  padding: '10px 12px',
  borderRadius: 18,
  background: LAB.glass,
  backdropFilter: 'blur(12px)',
  boxShadow: LAB.shadow,
  font: "700 13px 'Figtree', system-ui, sans-serif",
  color: PALETTE.ink,
  zIndex: 2,
}

function Pill({ on, color, onClick, children }: { on?: boolean; color: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 34,
        padding: '0 14px',
        borderRadius: 999,
        border: `2px solid ${color}`,
        background: on ? color : '#fff',
        color: on ? '#fff' : PALETTE.ink,
        font: "800 13px 'Figtree', system-ui, sans-serif",
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function Controls({ debug, setDebug }: { debug: boolean; setDebug: (v: boolean) => void }) {
  const mode = useMode((s) => s.mode)
  const setMode = useMode((s) => s.setMode)
  const state = usePlayBody((s) => s.state)
  const hoops = usePlayBody((s) => s.hoops)
  const xp = useProgress((s) => s.xp)
  return (
    <div style={panel}>
      <span style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 999, background: '#efedf7' }}>
        {LAB.modes.map(([m, c]) => (
          <Pill key={m} on={mode === m} color={c} onClick={() => setMode(m)}>
            {m}
          </Pill>
        ))}
      </span>
      <Pill color={PALETTE.teal} onClick={() => tossTutor()}>
        Toss him
      </Pill>
      <Pill color={PALETTE.coral} onClick={() => shootBall()}>
        Shoot ball
      </Pill>
      <Pill on={debug} color={PALETTE.ink} onClick={() => setDebug(!debug)}>
        colliders
      </Pill>
      <span data-testid="readout" style={{ marginLeft: 'auto', font: "800 14px 'Figtree', system-ui, sans-serif" }}>
        <span style={{ color: PALETTE.violet }}>{state}</span> · hoops <span style={{ color: PALETTE.coral }}>{hoops}</span> · {xp} XP
      </span>
    </div>
  )
}

function App() {
  const [debug, setDebug] = useState(false)
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#ffffff' }}>
      <Canvas
        shadows="soft"
        dpr={[1, RENDER.maxDpr]}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: RENDER.exposure }}
        camera={{ fov: LESSON_CAMERA.fov, near: 0.1, far: 100, position: LESSON_CAMERA.position }}
        onCreated={({ camera }) => camera.lookAt(...LESSON_CAMERA.lookAt)}
      >
        <ExposeProjection />
        <Lights />
        <LessonRoom />
        <Suspense fallback={null}>
          <PhysicsRoom debug={debug}>
            <PhysicsTutor onTap={() => poke()}>
              <BlenderTutorSafe />
            </PhysicsTutor>
            <Toys />
          </PhysicsRoom>
        </Suspense>
        <FxLayer />
      </Canvas>
      <Controls debug={debug} setDebug={setDebug} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
