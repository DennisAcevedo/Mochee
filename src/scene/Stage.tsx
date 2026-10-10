import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { ACESFilmicToneMapping, type PerspectiveCamera } from 'three'
import { CAMERA, CHARACTER, RENDER } from '../animation/config'
import { BossArena } from '../boss'
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
import { Lights } from './Lights'
import { PhysicsRoom, PhysicsTutor, Toys } from './physics'
import { LessonRoom } from './room/LessonRoom'
import styles from './Stage.module.css'

interface Props {
  children?: ReactNode
}

// The stage and whatever UI chrome is passed in as children (caption, HUD).
// It is full-bleed: the stage element is only the frame the lesson shot is
// composed in, while its sky and the canvas cover the whole window.
//
// The 3D scene is ONE fullscreen canvas (position: fixed) shared by the start
// screen and the lesson. It sits inside the stage so it paints above the
// stage's sky and below the chrome. The start-screen gradient is a fixed
// layer just under it that the intro fades away. The Blender tutor is on
// stage the whole time: asleep on the start screen, then the intro's wake and
// spin (introDriven); the room and the effects join once the lesson is live.
// The classic character only appears as his fallback if the GLB is missing.
export function Stage({ children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const setStageW = useTutorStore((s) => s.setStageW)
  const live = useTutorStore((s) => s.phase === 'live')
  const { regionRight } = useLayout()
  const tutor = useCurrentTutor()

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
          {/* The room mounts hidden during the intro, so the window fonts are
              ready the moment the lesson goes live. */}
          <group visible={live}>
            <LessonRoom />
            <RoomEvolution />
          </group>
          {/* Room space (no transform), so the physics bodies and the drawn tutor
              agree. Rapier loads once here, during the intro, while all of it is hidden.
              A tap on him (no drag) is the tickle: PhysicsTutor owns his pointer. */}
          <Suspense fallback={null}>
            <PhysicsRoom>
              <group name="tutor">
                <PhysicsTutor onTap={poke}>
                  <BlenderTutorSafe
                    introDriven
                    fallback={
                      <Character
                        size={CHARACTER.defaultSize}
                        roam={live ? 0 : CHARACTER.defaultRoam}
                        rleft={live ? 0 : L.regionLeft}
                        rright={live ? 1 : regionRight}
                        look={lookOf(tutor)}
                        introDriven
                      />
                    }
                  />
                </PhysicsTutor>
              </group>
              {live && <Toys />}
            </PhysicsRoom>
          </Suspense>
          {live && (
            <>
              <CapTint />
              <PartyLights />
              <PlayProps />
              <FxLayer />
              <AbilityProps />
              <ReturnExperiment />
              <BossArena />
            </>
          )}
        </Canvas>
      </div>
      <CharacterDirector />

      {children}
    </div>
  )
}
