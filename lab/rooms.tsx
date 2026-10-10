// Dev-only lab for the Blender rooms (BLENDER/rooms -> public/models/rooms): one
// room GLB under the lesson camera exactly as CameraRig frames it, with the real
// platform, windows and tutor for scale, so a room is judged in the app's own
// shot before any app code mounts it. Not part of the build.
// URL: ?room=study|play (public/models/rooms/<room>_room.glb) or ?file=<url>
//      &frame=lesson|full &pan=notes|board &guides=1 &tutor=0 &set=0 &windows=0 &tonemap=1 &ui=0 &void=1
// Drop a .glb on the page to swap it in. window.__rooms reports what loaded.
import '@fontsource/figtree/800.css'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ACESFilmicToneMapping,
  Box3,
  Box3Helper,
  BufferGeometry,
  CanvasTexture,
  Group,
  Line,
  LineBasicMaterial,
  MeshBasicMaterial,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RENDER } from '../src/animation/config'
import { BlenderTutorSafe } from '../src/character/blender/BlenderTutorSafe'
import { cameraPan, FLOOR_Y, LESSON_CAMERA, PALETTE } from '../src/scene/layout3d'
import { Lights } from '../src/scene/Lights'
import { LessonRoom } from '../src/scene/room/LessonRoom'
import { SparkleStage } from '../src/scene/room/SparkleStage'
import { useDirector, type Focus } from '../src/state/director'

type V3 = [number, number, number]
type FrameKind = 'lesson' | 'full'

const params = new URLSearchParams(location.search)
const LAB = {
  // LessonPage's 16:9 stage frame, measured live at 1456x785 (202, 68.125,
  // 1052 x 591.75): 68.125 px under the top, 125.125 px over the bottom,
  // centred between 72 px gutters. The canvas runs on past it, full-bleed.
  frame: { top: 68.125, bottom: 125.125, gutter: 72, maxWidth: 1760 },
  glbMagic: 0x46546c67, // 'glTF': Vite answers a missing file with index.html, not a 404
  scoreboard: { bg: '#262A44', ink: '#FFCE4A', text: 'SHOTS 7 / 10', width: 512 },
  guide: { arc: '#ff2e88', clear: '#ff2e88', calm: '#14a39a', apexBelowCap: 0.2, samples: 40 },
  glass: 'rgba(255,255,255,0.88)',
}
const FLAGS = {
  tutor: params.get('tutor') !== '0',
  set: params.get('set') !== '0', // platform + windows
  windows: params.get('windows') !== '0',
  tonemap: params.get('tonemap') === '1', // the app draws rooms unlit, untoned: off unless comparing
  ui: params.get('ui') !== '0',
}
const frameKind: FrameKind = params.get('frame') === 'full' ? 'full' : 'lesson'
const startPan = params.get('pan')
if (startPan === 'notes' || startPan === 'board') useDirector.getState().setFocus(startPan)
if (params.get('void') === '1') document.body.style.background = '#ff00ff' // gaps in the room show magenta

// What the exporter writes into the room root's extras (pipeline.export_glb).
interface Layout {
  nodes: { required: string[]; optional: string[] }
  release: V3
  rim: V3
  shotApexMax: number
  clear: Record<string, [V3, V3]>
  calm: Record<string, [V3, V3]>
}

interface Report {
  ready: boolean
  file: string
  room: string | null
  contract: number | null
  bytes: number
  nodes: string[] // every named node in the file
  named: Record<string, V3> // room-frame positions (floor at y 0) of the named nodes
  required: string[]
  missing: string[]
  meshes: number
  triangles: number
  materials: string[]
  error?: string
}

interface Source {
  label: string
  buffer?: ArrayBuffer // a dropped file; otherwise label is fetched
}

declare global {
  interface Window {
    __rooms: Report
  }
}

const empty = (file: string): Report => ({
  ready: false, file, room: null, contract: null, bytes: 0, nodes: [], named: {}, required: [], missing: [], meshes: 0, triangles: 0, materials: [],
})

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function frameRect(kind: FrameKind, vw: number, vh: number): Rect {
  if (kind === 'full') return { x: 0, y: 0, w: vw, h: vh }
  const F = LAB.frame
  const a = LESSON_CAMERA.aspect
  const w = Math.floor(Math.min(vw - F.gutter * 2, (vh - F.top - F.bottom) * a, F.maxWidth))
  const h = w / a
  return { x: (vw - w) / 2, y: F.top + (vh - F.top - F.bottom - h) / 2, w, h }
}

// CameraRig once live: LESSON_CAMERA rendered into the frame rect, panned toward the focused window.
function LabCamera() {
  useFrame((state) => {
    const cam = state.camera as PerspectiveCamera
    const vw = state.size.width
    const vh = state.size.height
    if (!vw || !vh) return
    const f = frameRect(frameKind, vw, vh)
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

async function readSource(src: Source): Promise<ArrayBuffer> {
  if (src.buffer) return src.buffer
  const res = await fetch(src.label)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${src.label}`)
  return res.arrayBuffer()
}

// The live scoreboard texture the app will draw: glTF UVs, so flipY = false.
async function paintScoreboard(mesh: Mesh) {
  const S = LAB.scoreboard
  const size = new Box3().setFromObject(mesh).getSize(new Vector3())
  const canvas = document.createElement('canvas')
  canvas.width = S.width
  canvas.height = Math.max(32, Math.round((S.width * size.y) / Math.max(size.x, size.z, 1e-3)))
  const font = `800 ${Math.round(canvas.height * 0.48)}px Figtree, system-ui, sans-serif`
  await document.fonts.load(font)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = S.bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = S.ink
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(S.text, canvas.width / 2, canvas.height / 2)
  const tex = new CanvasTexture(canvas)
  tex.flipY = false
  tex.colorSpace = SRGBColorSpace
  mesh.material = new MeshBasicMaterial({ map: tex, toneMapped: false })
}

// Loads one room GLB and checks it against the contract its own extras carry.
async function loadRoom(src: Source): Promise<{ gltf: GLTF; layout: Layout | null; report: Report }> {
  const buffer = await readSource(src)
  if (buffer.byteLength < 12 || new DataView(buffer).getUint32(0, true) !== LAB.glbMagic) {
    throw new Error(`${src.label} is not a GLB (a missing file comes back as index.html): build the room first`)
  }
  const gltf = await new GLTFLoader().parseAsync(buffer, '')
  const scene = gltf.scene
  const root: Object3D = scene.children.find((o) => o.userData.contract !== undefined) ?? scene
  const layout = typeof root.userData.layout === 'string' ? (JSON.parse(root.userData.layout) as Layout) : null
  const fileNodes = ((gltf.parser.json as { nodes?: { name?: string }[] }).nodes ?? []).map((n) => n.name ?? '').filter(Boolean)
  const nodes = fileNodes.filter((n) => n !== root.name && n !== 'room_static')

  scene.updateMatrixWorld(true)
  const named: Record<string, V3> = {}
  const v = new Vector3()
  for (const n of nodes) {
    const o = scene.getObjectByName(n)
    if (o) named[n] = o.getWorldPosition(v).toArray().map((c) => Math.round(c * 1e4) / 1e4) as V3
  }

  let meshes = 0
  let triangles = 0
  const materials = new Set<string>()
  scene.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    meshes++
    const g = mesh.geometry
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3
    for (const m of ([] as Material[]).concat(mesh.material)) {
      materials.add(m.name)
      if (!FLAGS.tonemap) m.toneMapped = false
    }
  })
  const screen = scene.getObjectByName('scoreboard_screen') as Mesh | undefined
  if (screen?.isMesh) await paintScoreboard(screen)

  const required = layout?.nodes.required ?? []
  const report: Report = {
    ready: true,
    file: src.label,
    room: typeof root.userData.room === 'string' ? root.userData.room : null,
    contract: typeof root.userData.contract === 'number' ? root.userData.contract : null,
    bytes: buffer.byteLength,
    nodes,
    named,
    required,
    missing: required.filter((n) => !nodes.includes(n)),
    meshes,
    triangles,
    materials: [...materials],
  }
  return { gltf, layout, report }
}

// The shot's flight (release -> rim, apex just under the app's cap) and the
// keep-out boxes: pink = clear (stage, shot lane), teal = calm (walls behind the windows).
function Guides({ layout }: { layout: Layout }) {
  const group = useMemo(() => {
    const G = LAB.guide
    const g = new Group()
    const [sx, sy, sz] = layout.release
    const [ex, ey, ez] = layout.rim
    const k = layout.shotApexMax - G.apexBelowCap - sy
    const m = ey - sy
    const b = 2 * k + 2 * Math.sqrt(Math.max(0, k * (k - m)))
    const a = b - m
    const pts = Array.from({ length: G.samples + 1 }, (_, i) => {
      const u = i / G.samples
      return new Vector3(sx + (ex - sx) * u, sy + b * u - a * u * u, sz + (ez - sz) * u)
    })
    g.add(new Line(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({ color: G.arc, toneMapped: false })))
    const boxes: [Record<string, [V3, V3]>, string][] = [
      [layout.clear, G.clear],
      [layout.calm, G.calm],
    ]
    for (const [set, color] of boxes) {
      for (const [lo, hi] of Object.values(set)) g.add(new Box3Helper(new Box3(new Vector3(...lo), new Vector3(...hi)), color))
    }
    return g
  }, [layout])
  return <primitive object={group} position={[0, FLOOR_Y, 0]} />
}

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
  font: "800 12px 'Figtree', system-ui, sans-serif",
  color: PALETTE.ink,
  zIndex: 2,
}

function Pill({ on, color, onClick, children }: { on?: boolean; color: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height: 30, padding: '0 12px', borderRadius: 999, border: `2px solid ${color}`, background: on ? color : '#fff', color: on ? '#fff' : PALETTE.ink, font: 'inherit', cursor: 'pointer' }}
    >
      {children}
    </button>
  )
}

function Panel({ src, report, guides, setSrc, setGuides }: { src: Source; report: Report; guides: boolean; setSrc: (s: Source) => void; setGuides: (g: boolean) => void }) {
  const focus = useDirector((s) => s.focus)
  const status = report.error
    ? report.error
    : report.ready
      ? `${report.room ?? '?'} - ${(report.bytes / 1024).toFixed(0)} KB, ${report.meshes} meshes, ${report.triangles} tris` +
        (report.missing.length ? ` - MISSING ${report.missing.join(', ')}` : ` - nodes ok (${report.nodes.length})`)
      : 'loading...'
  return (
    <div style={panel}>
      {(['study', 'play'] as const).map((r) => (
        <Pill key={r} on={src.label === roomUrl(r)} color={r === 'study' ? PALETTE.indigo : PALETTE.coral} onClick={() => setSrc({ label: roomUrl(r) })}>
          {r}
        </Pill>
      ))}
      {(['none', 'notes', 'board'] as Focus[]).map((f) => (
        <Pill key={f} on={focus === f} color={PALETTE.violet} onClick={() => useDirector.getState().setFocus(f)}>
          {f}
        </Pill>
      ))}
      <Pill on={guides} color={PALETTE.pink} onClick={() => setGuides(!guides)}>
        guides
      </Pill>
      <span style={{ marginLeft: 6, color: report.error || report.missing.length ? PALETTE.coral : '#5c5966' }}>{status}</span>
    </div>
  )
}

const roomUrl = (room: string) => `/models/rooms/${room}_room.glb`

function App() {
  const [src, setSrc] = useState<Source>(() => ({ label: params.get('file') ?? roomUrl(params.get('room') === 'play' ? 'play' : 'study') }))
  const [guides, setGuides] = useState(params.get('guides') === '1')
  const [loaded, setLoaded] = useState<{ scene: Group; layout: Layout | null } | null>(null)
  const [report, setReport] = useState<Report>(() => empty(src.label))

  useEffect(() => {
    let live = true
    window.__rooms = empty(src.label)
    setReport(window.__rooms)
    loadRoom(src).then(
      ({ gltf, layout, report }) => {
        if (!live) return
        setLoaded({ scene: gltf.scene, layout })
        setReport(report)
        window.__rooms = report
        console.info(`[rooms] loaded ${report.file}: room=${report.room} ${report.bytes} bytes, ${report.meshes} meshes, ${report.triangles} tris`)
        console.info(`[rooms] named nodes: ${report.nodes.join(', ') || '(none)'}`)
        if (report.missing.length) console.warn(`[rooms] missing required nodes: ${report.missing.join(', ')}`)
      },
      (err: Error) => {
        if (!live) return
        setLoaded(null)
        const failed = { ...empty(src.label), error: err.message }
        setReport(failed)
        window.__rooms = failed
        console.warn(`[rooms] ${err.message}`)
      },
    )
    return () => {
      live = false
    }
  }, [src])

  // Drop a freshly exported .glb anywhere on the page to look at it.
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer?.files[0]
      if (file) file.arrayBuffer().then((buffer) => setSrc({ label: file.name, buffer }))
    }
    addEventListener('dragover', over)
    addEventListener('drop', drop)
    return () => {
      removeEventListener('dragover', over)
      removeEventListener('drop', drop)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows="soft"
        dpr={[1, RENDER.maxDpr]}
        gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: RENDER.exposure, preserveDrawingBuffer: true }}
        camera={{ fov: LESSON_CAMERA.fov, near: 0.1, far: 100, position: LESSON_CAMERA.position }}
        onCreated={({ camera }) => {
          ;(camera as PerspectiveCamera & { manual?: boolean }).manual = true
        }}
      >
        <LabCamera />
        <Lights />
        {loaded && <primitive key={loaded.scene.uuid} object={loaded.scene} position={[0, FLOOR_Y, 0]} />}
        {guides && loaded?.layout && <Guides layout={loaded.layout} />}
        {FLAGS.set && (FLAGS.windows ? <LessonRoom /> : <SparkleStage />)}
        {FLAGS.tutor && (
          <Suspense fallback={null}>
            <BlenderTutorSafe />
          </Suspense>
        )}
      </Canvas>
      {FLAGS.ui && <Panel src={src} report={report} guides={guides} setSrc={setSrc} setGuides={setGuides} />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
