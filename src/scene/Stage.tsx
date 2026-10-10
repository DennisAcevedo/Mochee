import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { ACESFilmicToneMapping, type Group, type PerspectiveCamera } from 'three'
import { CAMERA, CHARACTER, RENDER } from '../animation/config'
import { Character } from '../character/Character'
import { BlenderTutorSafe } from '../character/blender/BlenderTutorSafe'
import { GGHooks } from '../debug/GGHooks'
import { introRef, introTargets } from '../intro/targets'
import { poke } from '../play/actions'
import { useCurrentTutor } from '../state/currentTutor'
import { lookOf } from '../state/library'
import { useLayout } from '../state/layout'
import { useTutorStore } from '../state/store'
import { layout as L } from '../theme'
import { CameraRig } from './CameraRig'
import { CharacterDirector } from './CharacterDirector'
import { CapTint } from './fx/CapTint'
import { FxLayer } from './fx/FxLayer'
import { PartyLights } from './fx/PartyLights'
import { PlayProps } from './fx/PlayProps'
import { AbilityProps, ReturnExperiment, RoomEvolution } from './evolution'
import { IntroTutor } from './IntroTutor'
import { Lights } from './Lights'
import { PhysicsRoom, PhysicsTutor, Toys } from './physics'
import { LessonRoom } from './room/LessonRoom'
import { BuildIn } from './room/build'
import styles from './Stage.module.css'

interface Props {
  children?: ReactNode
}

// The rounded stage and whatever UI chrome is passed in as children (top bar,
// caption, HUD).
//
// The 3D scene is ONE fullscreen canvas (position: fixed) shared by the start
// screen and the lesson. It sits inside the stage so it paints above the
// stage backdrop and below the chrome. The start-screen gradient is a fixed
// layer just under it that the intro fades away. While the start screen and
// the intro run, the classic character plays the intro; once the lesson is
// live, the white-box room, the Blender tutor and the effects take over.
export function Stage({ children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const setStageW = useTutorStore((s) => s.setStageW)
  const live = useTutorStore((s) => s.phase === 'live')
  // The intro reveals the room (and drops the Blender tutor in) before going live.
  const room = useTutorStore((s) => s.phase === 'live' || s.roomShown)
  const { regionRight } = useLayout()
  const tutor = useCurrentTutor()
  const look = lookOf(tutor)
  const introRoot = useRef<Group>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    introTargets.stage = el
    const ro = new ResizeObserver(([entry]) => setStageW(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (introTargets.stage === el) delete introTargets.stage
    }
  }, [setStageW])

  return (
    <div ref={ref} className={styles.stage}>
      <div ref={introRef('backdrop')} className={styles.startBackdrop} />

      <div ref={introRef('scene')} className={styles.scene}>
        {/* Renderer settings match tutor-3d.js: ACES filmic at 1.18, soft shadows, DPR ≤ 2.
            Pointer events only once live: 3D clicks (quiz keys, tickles, window tabs)
            land on the canvas; DOM chrome sits above it with its own z-index. */}
        <Canvas
          style={{ position: 'absolute', inset: 0, pointerEvents: live ? 'auto' : 'none' }}
          shadows="soft"
          dpr={[1, RENDER.maxDpr]}
          gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: RENDER.exposure }}
          camera={{ fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far, position: CAMERA.position }}
          onCreated={({ camera }) => {
            // CameraRig owns the aspect and view offset; stop R3F resetting them on resize.
            ;(camera as PerspectiveCamera & { manual?: boolean }).manual = true
            camera.lookAt(...CAMERA.lookAt)
          }}
        >
          <CameraRig />
          <Lights />
          <GGHooks />
          {/* The room and the Blender tutor mount hidden during the intro, so the
              window fonts and the GLB are ready the moment the lesson goes live. */}
          <group visible={room}>
            <LessonRoom />
            <BuildIn part="evolution" style="rise" distance={2.6}>
              <RoomEvolution />
            </BuildIn>
          </group>
          {/* Room space (no transform), so the physics bodies and the drawn tutor
              agree. Rapier loads once here, during the intro, while all of it is hidden.
              A tap on him (no drag) is the tickle: PhysicsTutor owns his pointer. */}
          <Suspense fallback={null}>
            <PhysicsRoom>
              <group name="tutor" visible={room}>
                <PhysicsTutor onTap={poke}>
                  <BlenderTutorSafe visible={room} accessory={look.accessory} accColor={look.accColor} />
                </PhysicsTutor>
              </group>
              {live && <Toys />}
            </PhysicsRoom>
          </Suspense>
          {/* Up with the room, so the intro's landing burst renders. */}
          {room && <FxLayer />}
          {live ? (
            <>
              <CapTint />
              <PartyLights />
              <PlayProps />
              <AbilityProps />
              <ReturnExperiment />
            </>
          ) : room ? null : (
            <>
              {/* The classic rig runs hidden and steers the Blender tutor (see IntroTutor). */}
              <Character
                size={CHARACTER.defaultSize}
                roam={CHARACTER.defaultRoam}
                rleft={L.regionLeft}
                rright={regionRight}
                look={look}
                introDriven
                ghost
                rootOut={introRoot}
              />
              <IntroTutor rootRef={introRoot} look={look} />
            </>
          )}
        </Canvas>
      </div>
      <CharacterDirector />

      {children}
    </div>
  )
}
