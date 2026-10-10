import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { use, useEffect, useMemo, useRef } from 'react'
import { Color, Quaternion, Vector3, type Group, type Material, type Mesh, type Object3D } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { anchors } from '../../scene/anchors'
import { FLOOR_Y, SPOTS, TUTOR_SCALE } from '../../scene/layout3d'
import { entrance } from '../../animation/introState'
import { useDirector, type FxKind, type Gesture, type LoopClip } from '../../state/director'
import type { Accessory } from '../look'
import { useTutorStore } from '../../state/store'
import { AnimationController, type AnimSnapshot } from './animController'
import { ACCESSORY_NODES, accessoryMaterial, ANCHOR, ANIM, BOOK_NODE, LOOK, MOTION, TUTOR_ASSETS, type FaceState } from './config'
import { TutorFace } from './face'
import { loadManifest, manifestUrl } from './manifest'
import { mapClipNames, TutorMotion, type MotionPhase } from './motion'
import { capMeshes, collectRigNodes, meshesWithMaterial, sneakerMeshes } from './rigNodes'

export interface BlenderTutorProps {
  src?: string // GLB url; the manifest is read from next to it. Defaults to /models/tutor.glb
  onPoke?: () => void // pointer down on any of his meshes
  capColor?: string // recolours the 'cap' material; undefined keeps the Blender colour
  sneakerColor?: string // recolours the feet's 'sneaker' sole band (v2 GLB); undefined keeps the coral
  accessory?: Accessory // shows that accessory node (v3 GLB); 'none' or undefined shows none
  accColor?: string // tints the accessory's acc_<name> material; '' or undefined keeps its Blender colour
  visible?: boolean
  // Standalone (Home cards): plays `control` instead of the director's loop and
  // one-shots, stands at its own origin, and leaves the room's anchors, fx and
  // status readout alone, so several can render at once.
  standalone?: boolean
  control?: { loop: LoopClip; gesture: Gesture | null }
  // Bare (standalone only): model units at the parent's origin, no room scale
  // or floor offset; the parent places him (the intro's IntroTutor).
  bare?: boolean
}

const ORIGIN = { x: 0, z: 0 }

// Live readout for lab pages and end-to-end checks; never read by the app.
export const tutorStatus = {
  loaded: false,
  clip: '' as string, // the contract clip asked for
  playing: '' as string, // the clip actually playing after fallbacks
  phase: 'still' as MotionPhase,
  face: 'neutral' as FaceState,
  missing: [] as string[], // contract clips the GLB does not have
  fxFired: 0,
  anim: null as AnimSnapshot | null, // the animation state machine: state, base loop, one-shot, queue, last transition
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))

// The last pointer position in viewport px (null until the pointer moves).
const pointer: { x: number | null; y: number | null } = { x: null, y: null }
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
  })
}

// Product of local rotations from `from` up to (not including) `stop`.
function chainQuat(from: Object3D | null, stop: Object3D, out: Quaternion): Quaternion {
  out.identity()
  for (let o = from; o && o !== stop; o = o.parent) out.premultiply(o.quaternion)
  return out
}

// The Blender tutor (public/models/tutor.glb) standing in the room. Plays the
// director's loop, one-shots and walks; the face, the cursor look and the
// anchors are layered in code. See docs/specs/2026-10-10-whitebox-stage.md.
export function BlenderTutor({
  src = TUTOR_ASSETS.model,
  onPoke,
  capColor,
  sneakerColor,
  accessory = 'none',
  accColor,
  visible = true,
  standalone = false,
  control,
  bare = false,
}: BlenderTutorProps) {
  const gltf = useGLTF(src)
  const manifest = use(loadManifest(manifestUrl(src)))
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const placement = useRef<Group>(null)
  const controlRef = useRef(control)
  controlRef.current = control
  // What he plays: the director, or the card's own control.
  const source = () => {
    const d = useDirector.getState()
    const c = controlRef.current
    return { loop: c?.loop ?? d.loop, gesture: c ? c.gesture : d.gesture, target: standalone ? ORIGIN : SPOTS[d.spot] }
  }

  // Own copy of the scene (useGLTF caches one per URL) with own cap, sneaker and accessory materials.
  const scene = useMemo(() => {
    const s = cloneSkinned(gltf.scene)
    s.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]
      mesh.castShadow = mats.every((m) => !m.transparent)
    })
    const own: Mesh[] = [...capMeshes(s), ...sneakerMeshes(s)]
    for (const name of ACCESSORY_NODES) own.push(...meshesWithMaterial(s, accessoryMaterial(name)))
    for (const mesh of new Set(own)) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone()
    }
    return s
  }, [gltf.scene])
  const nodes = useMemo(() => collectRigNodes(scene), [scene])
  const props3 = useMemo(() => {
    const acc = new Map<string, Object3D>()
    for (const name of ACCESSORY_NODES) {
      const node = scene.getObjectByName(name)
      if (node) acc.set(name, node)
    }
    return { acc, book: scene.getObjectByName(BOOK_NODE) ?? null }
  }, [scene])
  const clipNames = useMemo(() => mapClipNames(gltf.animations.map((c) => c.name)), [gltf.animations])
  const { actions } = useAnimations(gltf.animations, scene)

  // Director -> state machine (priorities, cooldowns, queue) -> motion (mixer fades and walking).
  const { motion, anim } = useMemo(() => {
    const d = source()
    const motion = new TutorMotion((name) => actions[name], clipNames, manifest, d.target, 0)
    const ctrl = new AnimationController((clip) => motion.gestureSeconds(clip), d.loop, 0, d.gesture?.id ?? 0)
    return { motion, anim: { ctrl, clock: 0, seen: -1 } }
  }, [actions, clipNames, manifest])
  const face = useMemo(() => new TutorFace(nodes, scene), [nodes, scene])
  const look = useMemo(
    () => ({ yaw: 0, pitch: 0, t: 0, q: new Quaternion(), q2: new Quaternion(), qp: new Quaternion(), v: new Vector3(), fx: [] as FxKind[] }),
    [],
  )

  useEffect(() => {
    if (standalone) return
    tutorStatus.loaded = true
    return () => {
      tutorStatus.loaded = false
    }
  }, [standalone])

  // Cap recolour. The Blender cap is white x an indigo->violet vertex
  // gradient, so a custom colour turns the gradient off (a flat bold cap);
  // clearing the prop brings both back.
  useEffect(() => {
    type CapMat = Material & { color?: Color; vertexColors: boolean; userData: { base?: { color: Color; vertexColors: boolean } } }
    const mats = capMeshes(scene).flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])) as CapMat[]
    for (const m of mats) {
      if (!m.color) continue
      m.userData.base ??= { color: m.color.clone(), vertexColors: m.vertexColors }
      const vertexColors = capColor ? false : m.userData.base.vertexColors
      if (capColor) m.color.set(capColor)
      else m.color.copy(m.userData.base.color)
      if (m.vertexColors !== vertexColors) {
        m.vertexColors = vertexColors
        m.needsUpdate = true
      }
    }
  }, [scene, capColor])

  // Sneaker recolour: a plain coloured material, so only the colour changes.
  useEffect(() => {
    type SneakerMat = Material & { color?: Color; userData: { base?: Color } }
    const mats = sneakerMeshes(scene).flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])) as SneakerMat[]
    for (const m of mats) {
      if (!m.color) continue
      m.userData.base ??= m.color.clone()
      if (sneakerColor) m.color.set(sneakerColor)
      else m.color.copy(m.userData.base)
    }
  }, [scene, sneakerColor])

  // Accessory tint: the picked accessory's main material takes accColor, every
  // other one goes back to its Blender colour.
  useEffect(() => {
    type AccMat = Material & { color?: Color; userData: { base?: Color } }
    for (const name of ACCESSORY_NODES) {
      const mats = meshesWithMaterial(scene, accessoryMaterial(name))
        .flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material]))
        .filter((m) => m.name === accessoryMaterial(name)) as AccMat[]
      for (const m of mats) {
        if (!m.color) continue
        m.userData.base ??= m.color.clone()
        const tint = name === accessory && accColor
        try {
          if (tint) m.color.set(tint)
          else m.color.copy(m.userData.base)
        } catch {
          m.color.copy(m.userData.base)
        }
      }
    }
  }, [scene, accessory, accColor])

  // Before the mixer: put the body back to rest (the look is additive), then
  // let the controller pick clips and move him, so fades start this frame.
  useFrame((_, delta) => {
    const dt = Math.min(MOTION.maxDt, delta)
    const body = nodes.body
    if (body) body.node.quaternion.copy(body.restQuat)
    const d = source()
    const target = d.target
    anim.clock += Math.min(ANIM.maxDt, delta) // real seconds: cooldowns and clip ends match the mixer
    const out = anim.ctrl.sync(anim.clock, {
      loop: d.loop,
      speaking: !standalone && useTutorStore.getState().mic === 'speaking',
      gesture: d.gesture,
      moving: motion.willMove(target),
    })
    motion.update(dt, { target, loop: out.loop, speaking: false, gesture: out.gesture, loopFade: out.loopFade, cut: out.cut })
    const g = placement.current
    if (g && bare) {
      g.position.set(0, 0, 0)
      g.rotation.y = 0
      g.scale.setScalar(1)
    } else if (g) {
      // entrance: the intro drops him in from above and squashes him on landing (feet pivot).
      g.position.set(motion.pos.x, FLOOR_Y + (standalone ? 0 : entrance.dropY), motion.pos.z)
      g.rotation.y = motion.yaw
      const sq = standalone ? 0 : entrance.squash
      g.scale.set(TUTOR_SCALE * (1 + sq * 0.5), TUTOR_SCALE * (1 - sq), TUTOR_SCALE * (1 + sq * 0.5))
    }
  }, -1)

  // After the mixer (useAnimations updates it in its own frame callback,
  // subscribed before this one): face, cursor look, fx and anchors.
  useFrame((_, delta) => {
    const g = placement.current
    if (!g) return
    const dt = Math.min(MOTION.maxDt, delta)
    look.t += dt
    const speaking = !standalone && useTutorStore.getState().mic === 'speaking'
    const faceState = motion.face()
    face.update(dt, look.t, faceState, speaking || motion.requested === 'talk')

    // The look's accessory; while reading, the book instead of the mic.
    const reading = motion.playing === 'read'
    for (const [name, node] of props3.acc) node.visible = name === accessory && !(reading && name === 'mic')
    if (props3.book) props3.book.visible = reading

    // Cursor look: head-to-cursor in NDC, small, damped, quieter during clips.
    // Off while reading or asleep (as in tutor-3d.js): the head eases back to centre.
    const calm = reading || motion.playing === 'sleep'
    let yawT = 0
    let pitchT = 0
    if (!calm && pointer.x !== null && pointer.y !== null && size.width && size.height) {
      const head = look.v.copy(anchors.tutor).project(camera)
      const cx = ((pointer.x - size.left) / size.width) * 2 - 1
      const cy = -(((pointer.y - size.top) / size.height) * 2 - 1)
      const aspect = size.width / size.height
      const k = motion.gesture || motion.phase !== 'still' ? LOOK.duringClip : 1
      yawT = clamp(((cx - head.x) * aspect) / LOOK.gain, -1, 1) * LOOK.yaw * k
      pitchT = -clamp((cy - head.y) / LOOK.gain, -1, 1) * LOOK.pitch * k
    }
    look.yaw = damp(look.yaw, yawT, LOOK.damp, dt)
    look.pitch = damp(look.pitch, pitchT, LOOK.damp, dt)
    const body = nodes.body?.node
    if (body) {
      // Rotate in the model's frame (+Z = his front), whatever the bone axes are.
      const qp = chainQuat(body.parent, scene, look.qp)
      look.q.setFromAxisAngle(look.v.set(0, 1, 0), look.yaw)
      look.q.multiply(look.q2.setFromAxisAngle(look.v.set(1, 0, 0), look.pitch))
      body.quaternion.premultiply(qp).premultiply(look.q).premultiply(qp.invert())
    }

    if (standalone) return // the room's fx, anchors and status belong to the lesson tutor

    // Timed fx from the manifest.
    look.fx.length = 0
    motion.collectFx(look.fx)
    if (look.fx.length) {
      const burst = useDirector.getState().burst
      for (const kind of look.fx) burst(kind, 'tutor')
      tutorStatus.fxFired += look.fx.length
    }

    // Anchors: top of the head and both hands, in world space.
    g.updateMatrixWorld(true)
    const worldScale = g.scale.y
    if (nodes.cap) {
      nodes.cap.node.getWorldPosition(anchors.tutor)
      anchors.tutor.y += ANCHOR.headAboveCap * worldScale
    } else if (body) {
      body.getWorldPosition(anchors.tutor)
      anchors.tutor.y += ANCHOR.headAboveBody * worldScale
    }
    if (nodes.handL) nodes.handL.node.getWorldPosition(anchors.handL)
    if (nodes.handR) nodes.handR.node.getWorldPosition(anchors.handR)

    tutorStatus.clip = motion.requested ?? ''
    tutorStatus.playing = motion.playing ?? ''
    tutorStatus.phase = motion.phase
    tutorStatus.face = faceState
    if (motion.missing.size !== tutorStatus.missing.length) tutorStatus.missing = [...motion.missing]
    if (anim.seen !== anim.ctrl.transitions) {
      anim.seen = anim.ctrl.transitions
      tutorStatus.anim = anim.ctrl.snapshot()
    }
  })

  // Pointer: poke on press, pointer cursor on hover (only while shown and pokeable).
  const hovering = useRef(false)
  useEffect(
    () => () => {
      if (hovering.current) document.body.style.cursor = ''
    },
    [],
  )
  const handlers = onPoke
    ? {
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
          if (!visible) return
          e.stopPropagation()
          onPoke()
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          if (!visible) return
          e.stopPropagation()
          hovering.current = true
          document.body.style.cursor = 'pointer'
        },
        onPointerOut: () => {
          if (!hovering.current) return
          hovering.current = false
          document.body.style.cursor = ''
        },
      }
    : {}

  return (
    <group ref={placement} name="blender-tutor" scale={TUTOR_SCALE} visible={visible} {...handlers}>
      <primitive object={scene} />
    </group>
  )
}

export function preloadBlenderTutor(src: string = TUTOR_ASSETS.model) {
  useGLTF.preload(src)
  void loadManifest(manifestUrl(src))
}
