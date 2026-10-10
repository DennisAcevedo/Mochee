import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, use, useEffect } from 'react'
import { Box3, Vector3, type Camera, type Object3D, type Scene } from 'three'
import { tutorStatus } from '../character/blender/BlenderTutor'
import { TUTOR_ASSETS } from '../character/blender/config'
import { probeModel } from '../character/blender/manifest'
import { mapClipNames } from '../character/blender/motion'
import { useExperimentRun } from '../growth'
import { useWalkthrough } from '../lesson/runner'
import { RESOLVED_STEPS } from '../lesson/walkthrough'
import { anchors } from '../scene/anchors'
import { ROOM_BOX, shootBall, tossTutor, usePlayBody } from '../scene/physics'
import { useDirector } from '../state/director'
import { useDrawers } from '../state/drawers'
import { useGrowth } from '../state/growth'
import { useMode } from '../state/mode'
import { useProgress } from '../state/progress'
import { useTutorStore } from '../state/store'

// Dev-only hooks for the end-to-end tests (tests/e2e/lesson_e2e.py, study_play_e2e.py):
// window.__gg exposes the stores, the walkthrough steps, the loaded model's
// clips and screenOf(name), which projects a named 3D object to viewport px.
// Mounted inside the lesson Canvas; renders nothing; a no-op in production.

interface GG {
  director: typeof useDirector
  tutor: typeof useTutorStore
  progress: typeof useProgress
  walkthrough: typeof useWalkthrough
  mode: typeof useMode
  drawers: typeof useDrawers
  growth: typeof useGrowth
  experiment: typeof useExperimentRun
  playBody: typeof usePlayBody
  play: { toss: typeof tossTutor; shoot: typeof shootBall; room: typeof ROOM_BOX }
  steps: typeof RESOLVED_STEPS
  model: { readonly loaded: boolean; clips: string[] }
  screenOf: (name: string) => { x: number; y: number } | null
  scene: Scene // for ad-hoc probes from the console
  readonly anim: typeof tutorStatus.anim // the animation state machine's latest snapshot
  played: { clip: string; t: number }[] // one-shots the tutor really started (performance.now() ms)
  loops: { clip: string; t: number }[] // base loops he switched to
  drops: { clip: string; reason: string; t: number }[] // one-shots the state machine dropped
}

declare global {
  interface Window {
    __gg?: GG
  }
}

const v = new Vector3()
const feet = new Vector3()
const box = new Box3()

// World point to aim at: the tutor's mid-body (feet to the top-of-head anchor),
// anything else its own origin, or its bounding-box centre for a plain group.
function aimPoint(scene: Scene, name: string, out: Vector3): Vector3 | null {
  const obj: Object3D | undefined = scene.getObjectByName(name)
  if (!obj) return null
  obj.updateWorldMatrix(true, true)
  if (name === 'tutor') {
    const body = obj.getObjectByName('blender-tutor')
    if (body) return out.copy(body.getWorldPosition(feet)).add(anchors.tutor).multiplyScalar(0.5)
    box.setFromObject(obj)
    return box.isEmpty() ? obj.getWorldPosition(out) : box.getCenter(out)
  }
  return obj.getWorldPosition(out)
}

// NDC through the camera's projection (which carries CameraRig's view offset)
// maps onto the whole canvas, so the canvas rect turns it into viewport px.
function project(p: Vector3, camera: Camera, canvas: HTMLCanvasElement) {
  p.project(camera)
  if (p.z < -1 || p.z > 1) return null
  const r = canvas.getBoundingClientRect()
  return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
}

// What the tutor actually played, read off the state machine's snapshots
// (the director only records what was asked for).
const LOG_CAP = 200
const played: GG['played'] = []
const loops: GG['loops'] = []
const drops: GG['drops'] = []
const DROP_REASONS = new Set(['cooldown', 'blocked', 'expired'])
const seen = { transitions: -1, oneShot: null as string | null, loop: null as string | null }

function watchAnim() {
  const a = tutorStatus.anim
  if (!a) return
  const t = performance.now()
  if (a.loop !== seen.loop) {
    seen.loop = a.loop
    loops.push({ clip: a.loop, t })
    if (loops.length > LOG_CAP) loops.shift()
  }
  if (a.transitions === seen.transitions) return
  seen.transitions = a.transitions
  if (a.oneShot && a.oneShot !== seen.oneShot) played.push({ clip: a.oneShot, t })
  seen.oneShot = a.oneShot
  if (a.last && DROP_REASONS.has(a.last.reason)) drops.push({ clip: a.last.clip, reason: a.last.reason, t })
  if (played.length > LOG_CAP) played.shift()
  if (drops.length > LOG_CAP) drops.shift()
}

const model = {
  clips: [] as string[],
  get loaded() {
    return tutorStatus.loaded && this.clips.length > 0
  },
}

function ModelClips({ src }: { src: string }) {
  const gltf = useGLTF(src)
  useEffect(() => {
    model.clips = [...mapClipNames(gltf.animations.map((c) => c.name)).keys()]
  }, [gltf])
  return null
}

// Reads the clip names off the cached GLB (the tutor loads it; no second fetch).
function ModelProbe() {
  const present = use(probeModel(TUTOR_ASSETS.model))
  return present ? <ModelClips src={TUTOR_ASSETS.model} /> : null
}

export function GGHooks() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const canvas = useThree((s) => s.gl.domElement)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__gg = {
      director: useDirector,
      tutor: useTutorStore,
      progress: useProgress,
      walkthrough: useWalkthrough,
      mode: useMode,
      drawers: useDrawers,
      growth: useGrowth,
      experiment: useExperimentRun,
      playBody: usePlayBody,
      play: { toss: tossTutor, shoot: shootBall, room: ROOM_BOX },
      steps: RESOLVED_STEPS,
      model,
      screenOf: (name) => {
        const p = aimPoint(scene, name, v)
        return p ? project(p, camera, canvas) : null
      },
      scene,
      get anim() {
        return tutorStatus.anim
      },
      played,
      loops,
      drops,
    }
    return () => {
      delete window.__gg
    }
  }, [scene, camera, canvas])

  useFrame(() => {
    if (import.meta.env.DEV) watchAnim()
  })

  if (!import.meta.env.DEV) return null
  return (
    <Suspense fallback={null}>
      <ModelProbe />
    </Suspense>
  )
}
