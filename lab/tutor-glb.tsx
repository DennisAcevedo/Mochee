import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Clock,
  Color,
  DirectionalLight,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  type AnimationAction,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { LOOP_CLIPS } from '../src/state/director'

// Dev-only check of public/models/tutor.glb in the real runtime: node names
// after GLTFLoader's sanitizing, every clip playable by name. ?clip=<name>&t=<s>
// freezes a clip at a time (for screenshots). Not part of the production build.

const LAB = {
  camera: { fov: 32, position: [0, 1.5, 7.2] as const, lookAt: [0, 1.25, 0] as const },
  fade: 0.12, // crossfade seconds
  colors: ['#12a4b4', '#ff6b5b', '#ffc83d', '#7c5cf2', '#4cc76a', '#ff6fae', '#3d5ad6'],
  faceHide: ['happyL', 'happyR'],
}

const stage = document.getElementById('stage')!
const info = document.getElementById('info')!
const bar = document.getElementById('bar')!

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
stage.appendChild(renderer.domElement)

const scene = new Scene()
scene.background = new Color('#f4f3f1')
const camera = new PerspectiveCamera(LAB.camera.fov, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(...LAB.camera.position)
camera.lookAt(...LAB.camera.lookAt)
scene.add(new HemisphereLight('#ffffff', '#e4e0d8', 1.2))
const key = new DirectionalLight('#fff5ea', 2.0)
key.position.set(2.5, 6, 5)
key.castShadow = true
scene.add(key)
const fill = new DirectionalLight('#e9f0ff', 0.6)
fill.position.set(-5, 1.5, 3)
scene.add(fill)
const floor = new Mesh(new PlaneGeometry(20, 20), new MeshStandardMaterial({ color: '#ecebe8' }))
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

const params = new URLSearchParams(location.search)
const clock = new Clock()
let mixer: AnimationMixer | null = null
let current: AnimationAction | null = null

new GLTFLoader().load('/models/tutor.glb', (gltf) => {
  const root = gltf.scene
  root.traverse((o: Object3D) => {
    if ((o as Mesh).isMesh) o.castShadow = true
    if (LAB.faceHide.includes(o.name)) o.visible = false
  })
  scene.add(root)
  mixer = new AnimationMixer(root)
  const names: string[] = []
  root.traverse((o) => names.push(o.name))
  const actions = new Map(gltf.animations.map((c) => [c.name, mixer!.clipAction(c)]))
  const loops = new Set<string>(LOOP_CLIPS)

  const play = (name: string) => {
    const next = actions.get(name)
    if (!next) return
    next.reset()
    next.setLoop(loops.has(name) ? LoopRepeat : LoopOnce, Infinity)
    next.clampWhenFinished = true
    if (current && current !== next) next.crossFadeFrom(current, LAB.fade, false)
    next.play()
    current = next
    info.textContent = `clip: ${name}\nclips: ${gltf.animations.length}\nnodes: ${names.filter(Boolean).join(' ')}`
  }

  gltf.animations.forEach((c, i) => {
    const b = document.createElement('button')
    b.textContent = c.name
    b.style.background = LAB.colors[i % LAB.colors.length]
    b.onclick = () => play(c.name)
    bar.appendChild(b)
  })

  const clip = params.get('clip') ?? 'idle'
  play(clip)
  const t = params.get('t')
  if (t !== null && current) {
    current.paused = false
    mixer.setTime(Number(t))
    current.paused = true
  }
  Object.assign(window, { __tutor: { names, clips: gltf.animations.map((c) => [c.name, c.duration]) } })
})

renderer.setAnimationLoop(() => {
  mixer?.update(params.get('t') === null ? clock.getDelta() : 0)
  renderer.render(scene, camera)
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
