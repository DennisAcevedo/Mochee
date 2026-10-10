import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, type ReactNode } from 'react'
import { ACESFilmicToneMapping, type PerspectiveCamera } from 'three'
import { CAMERA, CHARACTER, RENDER } from '../animation/config'
import { Character } from '../character/Character'
import { introRef, introTargets } from '../intro/targets'
import { useCurrentTutor } from '../state/currentTutor'
import { lookOf } from '../state/library'
import { useLayout } from '../state/layout'
import { useTutorStore } from '../state/store'
import { layout as L } from '../theme'
import { CameraRig } from './CameraRig'
import { CharacterDirector } from './CharacterDirector'
import { Lights } from './Lights'
import styles from './Stage.module.css'

interface Props {
  children?: ReactNode
}

// The rounded stage: gradient backdrop, floor, horizon, and whatever UI chrome
// is passed in as children (top bar, board, panel).
//
// The 3D scene is ONE fullscreen canvas (position: fixed) shared by the start
// screen and the lesson. It sits inside the stage so it paints above the
// stage backdrop and below the chrome. The start-screen gradient is a fixed
// layer just under it that the intro fades away.
export function Stage({ children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const setStageW = useTutorStore((s) => s.setStageW)
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
      <div className={styles.floor} />
      <div className={styles.horizon} />
      <div ref={introRef('backdrop')} className={styles.startBackdrop} />

      <div ref={introRef('scene')} className={styles.scene}>
        {/* Renderer settings match tutor-3d.js: ACES filmic at 1.18, soft shadows, DPR ≤ 2. */}
        <Canvas
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
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
          <Character
            size={CHARACTER.defaultSize}
            roam={CHARACTER.defaultRoam}
            rleft={L.regionLeft}
            rright={regionRight}
            look={lookOf(tutor)}
            introDriven
          />
        </Canvas>
      </div>
      <CharacterDirector />

      {children}
    </div>
  )
}
