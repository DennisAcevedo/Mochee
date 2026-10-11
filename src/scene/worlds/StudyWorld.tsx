import { DoubleSide } from 'three'
import { FLOOR_Y } from '../layout3d'
import { SparkleStage } from '../room/SparkleStage'
import { Block, Plate, useOwned, useQuad } from './parts'
import { RoomShell } from './RoomShell'
import { glassTexture, shaftTexture, softRectTexture, sunPanesTexture, tileTexture } from './textures'
import { WORLD, type Band } from './worldConfig'

// Study: a calm, bright classroom. Cool pale walls over a cooler wainscot
// and a pale chalk rail (the room's soft horizon), big pale floor tiles, one
// wide window high on the back wall with daylight falling through it onto
// the floor. No sparkles or stars: the notes and the board are the colour.

const C = WORLD.study
const S = WORLD.shell
const HALF_PI = Math.PI / 2
const BANDS: Band[] = [
  { from: 0, to: C.skirting.height, color: C.skirting.color },
  { from: C.skirting.height, to: C.wainscot.to, color: C.wainscot.color },
]

// Pale chalk rail round the room at the wainscot's top, with a shadow lip under it.
function ChalkRail() {
  const R = C.rail
  const y = FLOOR_Y + R.at
  const depth = S.frontZ - S.backZ
  const midZ = (S.frontZ + S.backZ) / 2
  return (
    <group name="study-rail">
      <Block size={[S.halfW * 2, R.height, R.depth]} position={[0, y, S.backZ + R.depth / 2]} color={R.color} />
      <Plate size={[S.halfW * 2, R.height * 0.5]} position={[0, y - R.height * 0.75, S.backZ + 0.004]} color={R.lip} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (S.halfW - R.depth / 2), y, midZ]} rotation={[0, -side * HALF_PI, 0]}>
          <Block size={[depth, R.height, R.depth]} position={[0, 0, 0]} color={R.color} />
          <Plate size={[depth, R.height * 0.5]} position={[0, -R.height * 0.75, -R.depth / 2 + 0.004]} color={R.lip} />
        </group>
      ))}
      {C.chalk.map((c) => (
        <Block key={c.x} size={[c.length, 0.035, 0.035]} position={[c.x, y + R.height / 2 + 0.018, S.backZ + R.depth * 0.6]} color={c.color} lit roughness={0.9} />
      ))}
      <group position={[C.eraser.x, y + R.height / 2 + C.eraser.size[1] / 2, S.backZ + R.depth * 0.55]}>
        <Block size={C.eraser.size} position={[0, 0, 0]} color={C.eraser.felt} lit roughness={0.95} />
        <Block size={[C.eraser.size[0], C.eraser.size[1] * 0.45, C.eraser.size[2] * 1.02]} position={[0, C.eraser.size[1] * 0.3, 0]} color={C.eraser.top} lit roughness={0.7} />
      </group>
    </group>
  )
}

// Hairline where the floor meets the walls.
function FloorLine() {
  const { line, lineWidth } = C.skirting
  const y = FLOOR_Y + 0.003
  const depth = S.frontZ - S.backZ
  const midZ = (S.frontZ + S.backZ) / 2
  const flat: [number, number, number] = [-HALF_PI, 0, 0]
  return (
    <group name="study-floor-line">
      <Plate size={[S.halfW * 2, lineWidth]} position={[0, y, S.backZ + lineWidth / 2]} rotation={flat} color={line} />
      <Plate size={[lineWidth, depth]} position={[-S.halfW + lineWidth / 2, y, midZ]} rotation={flat} color={line} />
      <Plate size={[lineWidth, depth]} position={[S.halfW - lineWidth / 2, y, midZ]} rotation={flat} color={line} />
    </group>
  )
}

// The window: sky glass, mullions, a white frame and sill, and a soft shadow on the wall.
function ClassWindow() {
  const W = C.window
  const glass = useOwned(glassTexture)
  const soft = useOwned(softRectTexture)
  const [w, h] = W.size
  const cx = W.center[0]
  const cy = FLOOR_Y + W.center[1]
  const z = S.backZ
  const f = W.frame
  const m = W.mullion
  const cols = Array.from({ length: W.cols - 1 }, (_, i) => cx - w / 2 + ((i + 1) * w) / W.cols)
  const rows = Array.from({ length: W.rows - 1 }, (_, i) => cy - h / 2 + ((i + 1) * h) / W.rows)
  const sill = W.sill
  return (
    <group name="study-window">
      <Plate size={[w + 0.5, h + 0.55]} position={[cx, cy - W.shadow.offset * 2, z + 0.003]} color={W.shadow.color} map={soft} opacity={0.75} depthWrite={false} />
      <Plate size={[w, h]} position={[cx, cy, z + 0.006]} color="#ffffff" map={glass} />
      {cols.map((x) => (
        <Block key={`c${x}`} size={[m, h, 0.03]} position={[x, cy, z + 0.02]} color={W.mullionColor} />
      ))}
      {rows.map((y) => (
        <Block key={`r${y}`} size={[w, m, 0.03]} position={[cx, y, z + 0.02]} color={W.mullionColor} />
      ))}
      <Block size={[w + f * 2, f, 0.06]} position={[cx, cy + h / 2 + f / 2, z + 0.03]} color={W.frameColor} />
      <Block size={[f, h, 0.06]} position={[cx - w / 2 - f / 2, cy, z + 0.03]} color={W.frameColor} />
      <Block size={[f, h, 0.06]} position={[cx + w / 2 + f / 2, cy, z + 0.03]} color={W.frameColor} />
      <Block size={[w + f * 2 + sill.overhang * 2, sill.height, sill.depth]} position={[cx, cy - h / 2 - sill.height / 2, z + sill.depth / 2]} color={sill.color} />
    </group>
  )
}

// Daylight: the window's panes thrown onto the floor in front of the back
// wall, drifting sideways with distance (the sun is off to the left), and a
// faint shaft from the top of the glass down to the patch's near edge.
function Daylight() {
  const L = C.light
  const W = C.window
  const panes = useOwned(sunPanesTexture)
  const shaft = useOwned(shaftTexture)
  const [z0, z1] = L.patch.z
  const half = L.patch.width / 2
  const drift = (z: number) => (L.patch.skew * (z - S.backZ)) / (z1 - S.backZ)
  const s0 = drift(z0)
  const s1 = drift(z1)
  const y = FLOOR_Y + 0.002
  const top = FLOOR_Y + W.center[1] + W.size[1] / 2
  const wz = S.backZ + 0.05
  const cx = W.center[0]
  const geo = useQuad([cx - W.size[0] / 2, top, wz], [cx + W.size[0] / 2, top, wz], [cx + half + s1, y, z1], [cx - half + s1, y, z1])
  const patchGeo = useQuad([cx - half + s0, y, z0], [cx + half + s0, y, z0], [cx + half + s1, y, z1], [cx - half + s1, y, z1])
  return (
    <group name="study-daylight">
      <mesh geometry={patchGeo}>
        <meshBasicMaterial color={L.patch.color} map={panes} transparent opacity={L.patch.opacity} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={geo}>
        <meshBasicMaterial color={L.shaft.color} map={shaft} transparent opacity={L.shaft.opacity} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
    </group>
  )
}

export function StudyWorld() {
  const tiles = useOwned(tileTexture)
  return (
    <group name="world-study">
      <RoomShell wall={C.wall} bands={BANDS} floor={C.floor} floorMap={tiles} />
      <FloorLine />
      <ChalkRail />
      <ClassWindow />
      <Daylight />
      {C.platform && <SparkleStage />}
    </group>
  )
}
