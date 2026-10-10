// Dev-only lab for the play system: a white room, a placeholder tutor that
// writes the anchors and acts out each one-shot, the effects layer, the props
// and the HUD. Not part of the production build.
import { Canvas, useFrame } from '@react-three/fiber'
import { StrictMode, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { ACESFilmicToneMapping, Vector3, type Group, type Mesh } from 'three'
import * as actions from '../src/play/actions'
import { LevelWatcher } from '../src/play/LevelWatcher'
import { usePlay } from '../src/play/playStore'
import { anchors } from '../src/scene/anchors'
import { CapTint } from '../src/scene/fx/CapTint'
import { FxLayer } from '../src/scene/fx/FxLayer'
import { PartyLights } from '../src/scene/fx/PartyLights'
import { PlayProps } from '../src/scene/fx/PlayProps'
import { PokeTarget } from '../src/scene/fx/PokeTarget'
import { FLOOR_Y, LESSON_CAMERA, PALETTE, ROOM, SPOTS, TUTOR_SCALE, WINDOWS } from '../src/scene/layout3d'
import { Lights } from '../src/scene/Lights'
import { useDirector, type FxKind, type FxTarget, type OneShotClip } from '../src/state/director'
import { levelForXp, useProgress, xpForLevel } from '../src/state/progress'
import '../src/styles/global.css'
import { PlayHud } from '../src/ui/PlayHud/PlayHud'

const R = 0.8 // model units: body radius
const HAND_FOLLOW = 14 // 1/s
const goal = new Vector3()
const CLIP_SECONDS: Partial<Record<OneShotClip, number>> = {
  giggle: 1.0,
  highfive: 1.0,
  catch: 1.9,
  yum: 1.2,
  dance_bounce: 2.4,
  dance_spin: 2.0,
  dance_robot: 2.4,
  levelup: 2.0,
}

// Stand-in for the Blender tutor: gumdrop body, eyes, a cap whose material is
// named `cap`, and floating mittens. Acts out the play clips procedurally.
function PlaceholderTutor() {
  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const handL = useRef<Mesh>(null)
  const handR = useRef<Mesh>(null)
  const clip = useRef<{ id: number; name: OneShotClip; t: number } | null>(null)

  useFrame((state, dt) => {
    const g = useDirector.getState().gesture
    if (g && g.id !== clip.current?.id) clip.current = { id: g.id, name: g.clip, t: 0 }
    const c = clip.current
    if (c) {
      c.t += dt
      if (c.t > (CLIP_SECONDS[c.name] ?? 1.2)) clip.current = null
    }
    const time = state.clock.elapsedTime
    const b = body.current!
    const hl = handL.current!
    const hr = handR.current!
    let y = 0.06 * Math.sin(time * 2.2)
    let sx = 1
    let sy = 1
    let ry = 0
    let rz = 0
    const hlp = [-1.0, -0.2 + 0.05 * Math.sin(time * 2), 0.3]
    const hrp = [1.0, -0.2 + 0.05 * Math.sin(time * 2 + 1), 0.3]
    if (c) {
      const k = c.t
      switch (c.name) {
        case 'giggle':
          rz = 0.18 * Math.sin(k * 40) * Math.exp(-k * 2)
          sy = 1 + 0.06 * Math.sin(k * 30)
          break
        case 'highfive':
          hrp[0] = 0.9
          hrp[1] = 1.1
          hrp[2] = 0.7
          y += 0.25 * Math.max(0, Math.sin(k * Math.PI * 1.5))
          break
        case 'catch':
          hlp[0] = -0.28
          hlp[1] = -0.1
          hlp[2] = 0.85
          hrp[0] = 0.28
          hrp[1] = -0.1
          hrp[2] = 0.85
          break
        case 'yum':
          sy = 1 + 0.1 * Math.sin(k * 18)
          sx = 1 - 0.05 * Math.sin(k * 18)
          break
        case 'dance_bounce':
          y += 0.3 * Math.abs(Math.sin(k * 7))
          hlp[1] = 0.6 * Math.abs(Math.sin(k * 7))
          hrp[1] = 0.6 * Math.abs(Math.cos(k * 7))
          break
        case 'dance_spin':
          ry = Math.min(1, k / 1.2) * Math.PI * 4
          y += 0.15 * Math.abs(Math.sin(k * 5))
          break
        case 'dance_robot':
          ry = Math.round(Math.sin(k * 4) * 2) * 0.35
          hlp[1] = Math.round(Math.sin(k * 6)) * 0.4
          hrp[1] = -Math.round(Math.sin(k * 6)) * 0.4
          break
        case 'levelup':
          y += 0.6 * Math.max(0, Math.sin(k * Math.PI))
          ry = Math.min(1, k / 1.0) * Math.PI * 2
          hlp[1] = 1.0
          hrp[1] = 1.0
          break
      }
    }
    b.position.y = R + y
    b.scale.set(sx, sy, sx)
    b.rotation.set(0, ry, rz)
    const follow = Math.min(1, dt * HAND_FOLLOW)
    hl.position.lerp(goal.set(hlp[0], R + hlp[1] + y, hlp[2]), follow)
    hr.position.lerp(goal.set(hrp[0], R + hrp[1] + y, hrp[2]), follow)

    // Write the anchors the effects and props read.
    root.current!.updateMatrixWorld()
    b.localToWorld(anchors.tutor.set(0, R * 1.05, 0))
    hl.getWorldPosition(anchors.handL)
    hr.getWorldPosition(anchors.handR)
  })

  return (
    <group ref={root} position={[SPOTS.center.x, FLOOR_Y, SPOTS.center.z]} scale={TUTOR_SCALE}>
      <group ref={body} position={[0, R, 0]}>
        <mesh castShadow scale={[1, 0.95, 1]}>
          <sphereGeometry args={[R, 48, 32]} />
          <meshPhysicalMaterial color="#f7f7f5" roughness={0.6} sheen={1} clearcoat={0.12} />
        </mesh>
        {[-0.205, 0.205].map((x) => (
          <mesh key={x} position={[x, 0.05, R * 0.93]} scale={[1, 1.1, 0.5]}>
            <sphereGeometry args={[0.094, 20, 16]} />
            <meshPhysicalMaterial color="#131316" clearcoat={1} roughness={0.2} />
          </mesh>
        ))}
        <mesh position={[0, R * 0.92, 0]}>
          <cylinderGeometry args={[0.47, 0.52, 0.24, 32]} />
          <meshPhysicalMaterial name="cap" color={PALETTE.indigo} roughness={0.5} />
        </mesh>
        <mesh position={[0, R * 0.92 + 0.14, 0]} rotation={[0, Math.PI / 4, 0]}>
          <boxGeometry args={[1.05, 0.06, 1.05]} />
          <meshPhysicalMaterial name="cap" color={PALETTE.indigo} roughness={0.5} />
        </mesh>
      </group>
      <mesh ref={handL} castShadow scale={[1, 1, 0.74]}>
        <capsuleGeometry args={[0.15, 0.06, 8, 16]} />
        <meshPhysicalMaterial color="#fdfdfc" roughness={0.55} />
      </mesh>
      <mesh ref={handR} castShadow scale={[1, 1, 0.74]}>
        <capsuleGeometry args={[0.15, 0.06, 8, 16]} />
        <meshPhysicalMaterial color="#fdfdfc" roughness={0.55} />
      </mesh>
    </group>
  )
}

// White box: floor, back wall, side walls, ceiling, and two window slabs so
// window-anchored bursts have something to land on.
function Room() {
  const w = ROOM.width
  const h = ROOM.height
  const d = ROOM.depth
  const cy = FLOOR_Y + h / 2
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, d / 2 - ROOM.backZ]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={PALETTE.floor} />
      </mesh>
      <mesh position={[0, cy, -ROOM.backZ]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={PALETTE.wall} />
      </mesh>
      <mesh position={[-w / 2, cy, d / 2 - ROOM.backZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color="#efeeec" />
      </mesh>
      <mesh position={[w / 2, cy, d / 2 - ROOM.backZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color="#efeeec" />
      </mesh>
      <mesh position={[0, FLOOR_Y + h, d / 2 - ROOM.backZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#fbfbfa" />
      </mesh>
      {(['notes', 'board'] as const).map((k) => (
        <mesh key={k} position={WINDOWS[k].position} rotation={[0, WINDOWS[k].yaw, 0]} castShadow>
          <boxGeometry args={[WINDOWS[k].width, WINDOWS[k].height, 0.05]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  )
}

// Lab-only: jump straight to the next level, as award() would.
function forceLevelUp() {
  useProgress.setState((s) => {
    const xp = xpForLevel(s.level + 1)
    return { xp, level: levelForXp(xp), levelUpId: s.levelUpId + 1, levelFrom: s.level }
  })
}

const FX_KINDS: FxKind[] = ['confetti', 'sparkles', 'hearts', 'stars', 'ring', 'levelup']
const TARGETS: FxTarget[] = ['tutor', 'notes', 'board']

function DevPanel() {
  const level = useProgress((s) => s.level)
  const xp = useProgress((s) => s.xp)
  const props = usePlay((s) => s.props.length)
  return (
    <div style={{ position: 'fixed', left: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 6, font: '600 12px Figtree, system-ui', zIndex: 20 }}>
      <div>
        lab: level {level}, xp {xp}, props {props}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button id="force-level" onClick={forceLevelUp}>Force level-up</button>
        <button id="reset" onClick={() => useProgress.getState().resetProgress()}>Reset</button>
      </div>
      {TARGETS.map((t) => (
        <div key={t} style={{ display: 'flex', gap: 4 }}>
          {FX_KINDS.map((k) => (
            <button key={k} onClick={() => useDirector.getState().burst(k, t)}>
              {k}@{t}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function Lab() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: PALETTE.wall }}>
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.18 }}
        camera={{ fov: LESSON_CAMERA.fov, position: LESSON_CAMERA.position, near: 0.1, far: 100 }}
        onCreated={({ camera }) => camera.lookAt(...LESSON_CAMERA.lookAt)}
      >
        <Lights />
        <Room />
        <PlaceholderTutor />
        <PokeTarget />
        <CapTint />
        <PartyLights />
        <PlayProps />
        <FxLayer />
      </Canvas>
      <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)' }}>
        <PlayHud />
      </div>
      <LevelWatcher />
      <DevPanel />
    </div>
  )
}

Object.assign(window, { __play: { actions, useProgress, useDirector, usePlay, forceLevelUp } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
)
