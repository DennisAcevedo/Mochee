import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  DoubleSide,
  type Texture,
} from 'three'
import { useMode } from '../../state/mode'
import { FLOOR_Y, PALETTE, ROOM, SPOTS, WINDOW } from '../layout3d'
import { roundedRect } from '../windows/shapes'
import { blobTexture, glowTexture, surfaceTexture, type Edge, type SurfaceGlow } from './bakedTextures'
import { BuildIn } from './build'
import { ROOM_STYLE as S, type DecalKind, type Surface } from './roomStyle'

// The lesson's white-box room: a one-point-perspective interior (floor, back
// wall, two side walls, ceiling) with baked soft-white tones and corner
// falloff, transparent shadow catchers over each surface, and the bold
// accents (rug, ceiling light, confetti decals). Unlit surfaces keep the room's tones under any
// light rig; only the shadows come from the scene's key light.

const HALF_W = ROOM.width / 2
const CEIL_Y = FLOOR_Y + ROOM.height
const BACK_Z = -ROOM.backZ
const FRONT_Z = ROOM.depth - ROOM.backZ
const SIDE_LEN = ROOM.depth
const SIDE_MID_Z = (BACK_Z + FRONT_Z) / 2
const MID_Y = (FLOOR_Y + CEIL_Y) / 2
const HALF_PI = Math.PI / 2

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function useRoomTextures() {
  const tex = useMemo(() => {
    const t = S.tones
    return {
      back: surfaceTexture({ from: t.backCenter, to: t.backEdge, radial: true, edges: ['top', 'right', 'bottom', 'left'], width: ROOM.width, height: ROOM.height }),
      floor: surfaceTexture({ from: t.floorBack, to: t.floorFront, axis: 'y', edges: ['top', 'left', 'right'], width: ROOM.width, height: SIDE_LEN }),
      ceiling: surfaceTexture({ from: t.ceilOuter, to: t.ceilInner, axis: 'y', edges: ['bottom', 'left', 'right'], width: ROOM.width, height: SIDE_LEN }),
      left: surfaceTexture({ from: t.wallOuter, to: t.wallInner, axis: 'x', edges: ['right', 'top', 'bottom'], width: SIDE_LEN, height: ROOM.height }),
      right: surfaceTexture({ from: t.wallInner, to: t.wallOuter, axis: 'x', edges: ['left', 'top', 'bottom'], width: SIDE_LEN, height: ROOM.height }),
      sky: skyTextures(),
      glow: glowTexture(),
      blob: blobTexture(),
    }
  }, [])
  useEffect(
    () => () => {
      for (const t of [tex.back, tex.floor, tex.ceiling, tex.left, tex.right, tex.glow, tex.blob, ...Object.values(tex.sky)]) t.dispose()
    },
    [tex],
  )
  return tex
}

// Study mode's surfaces: Ronil's pastel sky (ROOM_STYLE.sky). Texture axes: the
// left wall runs front (u 0) to back, the right wall back to front, the floor
// back (v 0) to front, the ceiling front to back.
function skyTextures() {
  const k = S.sky
  const paint = (color: string, glows: SurfaceGlow[], edges: Edge[], width: number, height: number) =>
    surfaceTexture({ from: color, to: color, edges, width, height, glows, falloff: k.falloff })
  return {
    back: paint(
      k.base,
      [
        { x: 0, y: 0.62, rx: 0.48, ry: 0.7, rgb: k.blue, alpha: 0.55 },
        { x: 1, y: 0, rx: 0.4, ry: 0.55, rgb: k.peach, alpha: 0.55 },
        { x: 1, y: 0.85, rx: 0.42, ry: 0.6, rgb: k.yellow, alpha: 0.5 },
      ],
      ['top', 'right', 'bottom', 'left'],
      ROOM.width,
      ROOM.height,
    ),
    left: paint(k.base, [{ x: 0.6, y: 0.62, rx: 0.9, ry: 0.85, rgb: k.blue, alpha: 0.5 }], ['right', 'top', 'bottom'], SIDE_LEN, ROOM.height),
    right: paint(
      k.base,
      [
        { x: 0.4, y: 0, rx: 0.9, ry: 0.6, rgb: k.peach, alpha: 0.5 },
        { x: 0.4, y: 0.9, rx: 0.9, ry: 0.6, rgb: k.yellow, alpha: 0.45 },
      ],
      ['left', 'top', 'bottom'],
      SIDE_LEN,
      ROOM.height,
    ),
    floor: paint(
      k.floor,
      [
        { x: 0, y: 0.35, rx: 0.5, ry: 0.7, rgb: k.blue, alpha: 0.22 },
        { x: 1, y: 0.35, rx: 0.5, ry: 0.7, rgb: k.yellow, alpha: 0.25 },
      ],
      ['top', 'left', 'right'],
      ROOM.width,
      SIDE_LEN,
    ),
    ceiling: paint(k.ceiling, [{ x: 1, y: 0.7, rx: 0.6, ry: 0.8, rgb: k.peach, alpha: 0.25 }], ['bottom', 'left', 'right'], ROOM.width, SIDE_LEN),
  }
}

// One unlit surface plus the shadow catcher just in front of it.
function Surface({
  map,
  width,
  height,
  position,
  rotation,
  shadowOpacity,
}: {
  map: Texture
  width: number
  height: number
  position: [number, number, number]
  rotation: [number, number, number]
  shadowOpacity: number
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, S.lift * 3]} receiveShadow renderOrder={2}>
        <planeGeometry args={[width, height]} />
        <shadowMaterial transparent opacity={shadowOpacity} depthWrite={false} />
      </mesh>
    </group>
  )
}

// Concentric colour rings under the tutor's centre spot, with a dotted inner ring.
function Rug() {
  const { radius, squash, rings, ringWidth, center, segments, dotRing } = S.rug
  const inner = radius - rings.length * ringWidth
  const dots = useMemo(
    () =>
      Array.from({ length: dotRing.count }, (_, i) => {
        const a = (i / dotRing.count) * Math.PI * 2
        return [Math.cos(a) * dotRing.radius, Math.sin(a) * dotRing.radius] as const
      }),
    [dotRing.count, dotRing.radius],
  )
  return (
    <group position={[SPOTS.center.x, FLOOR_Y + S.lift, SPOTS.center.z]} scale={[1, 1, squash]}>
      <group rotation={[-HALF_PI, 0, 0]}>
        {rings.map((c, i) => (
          <mesh key={c + i} position={[0, 0, i * 0.0005]}>
            <ringGeometry args={[radius - (i + 1) * ringWidth, radius - i * ringWidth, segments]} />
            <meshBasicMaterial color={PALETTE[c]} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.0005]}>
          <circleGeometry args={[inner, segments]} />
          <meshBasicMaterial color={center} toneMapped={false} />
        </mesh>
        {dots.map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0.001]}>
            <circleGeometry args={[dotRing.size, 16]} />
            <meshBasicMaterial color={PALETTE[dotRing.color]} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// Soft contact blob on the floor under the floating browser window.
function WindowBlobs({ map }: { map: Texture }) {
  const { width, depth, opacity, dz, color } = S.windowBlob
  const [x, , z] = WINDOW.position
  return (
    <mesh position={[x, FLOOR_Y + S.lift * 2, z + dz]} rotation={[-HALF_PI, 0, 0]} renderOrder={1}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial map={map} color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

// Glowing panel on the ceiling with a coloured rim and a warm halo.
function CeilingLight({ glow }: { glow: Texture }) {
  const { width, depth, z, radius, color, rim, rimWidth, glow: halo } = S.ceilingLight
  return (
    <group position={[0, CEIL_Y - S.lift, z]} rotation={[HALF_PI, 0, 0]}>
      <mesh geometry={roundedRect(width * halo.scale, depth * halo.scale * 1.4, 0)} position={[0, 0, -0.001]}>
        <meshBasicMaterial map={glow} color={halo.color} transparent opacity={halo.opacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={roundedRect(width + rimWidth * 2, depth + rimWidth * 2, radius + rimWidth)} position={[0, 0, 0.001]}>
        <meshBasicMaterial color={PALETTE[rim]} toneMapped={false} side={DoubleSide} />
      </mesh>
      <mesh geometry={roundedRect(width, depth, radius)} position={[0, 0, 0.002]}>
        <meshBasicMaterial color={color} toneMapped={false} side={DoubleSide} />
      </mesh>
    </group>
  )
}

const DECAL_GEOMETRY: Record<DecalKind, () => (CircleGeometry | BoxGeometry)[]> = {
  dot: () => [new CircleGeometry(0.5, 32)],
  tri: () => [new CircleGeometry(0.5, 3)],
  plus: () => [new BoxGeometry(1, 0.32, 0.001), new BoxGeometry(0.32, 1, 0.001)],
}

function decalPlacement(surface: Surface, u: number, v: number): { position: [number, number, number]; yaw: number } {
  const y = lerp(FLOOR_Y, CEIL_Y, v)
  if (surface === 'back') return { position: [lerp(-HALF_W, HALF_W, u), y, BACK_Z + S.decalLift], yaw: 0 }
  if (surface === 'left') return { position: [-HALF_W + S.decalLift, y, lerp(S.sideFrontZ, BACK_Z, u)], yaw: HALF_PI }
  return { position: [HALF_W - S.decalLift, y, lerp(BACK_Z, S.sideFrontZ, u)], yaw: -HALF_PI }
}

// Confetti shapes on the walls.
function Decals() {
  const geos = useMemo(() => ({ dot: DECAL_GEOMETRY.dot(), tri: DECAL_GEOMETRY.tri(), plus: DECAL_GEOMETRY.plus() }), [])
  useEffect(() => () => Object.values(geos).flat().forEach((g) => g.dispose()), [geos])
  return (
    <>
      {S.decals.map(([surface, u, v, kind, color, size, angle], i) => {
        const { position, yaw } = decalPlacement(surface, u, v)
        return (
          <group key={i} position={position} rotation={[0, yaw, 0]}>
            <group rotation={[0, 0, angle]} scale={size}>
              {geos[kind].map((g, j) => (
                <mesh key={j} geometry={g}>
                  <meshBasicMaterial color={PALETTE[color]} transparent opacity={S.decalOpacity} toneMapped={false} />
                </mesh>
              ))}
            </group>
          </group>
        )
      })}
    </>
  )
}

export function WhiteBoxRoom() {
  const tex = useRoomTextures()
  const { floor: floorShadow, walls: wallShadow } = S.shadowOpacity
  // Both modes share the pastel wall gradient. Study also uses the matching
  // floor and ceiling, while Play keeps its court floor and neutral ceiling.
  const study = useMode((s) => s.mode === 'study')
  const wall = tex.sky
  const floor = study ? tex.sky.floor : tex.floor
  const ceiling = study ? tex.sky.ceiling : tex.ceiling

  return (
    <group name="white-box-room">
      <Surface map={wall.back} width={ROOM.width} height={ROOM.height} position={[0, MID_Y, BACK_Z]} rotation={[0, 0, 0]} shadowOpacity={wallShadow} />
      <Surface map={floor} width={ROOM.width} height={SIDE_LEN} position={[0, FLOOR_Y, SIDE_MID_Z]} rotation={[-HALF_PI, 0, 0]} shadowOpacity={floorShadow} />
      <Surface map={ceiling} width={ROOM.width} height={SIDE_LEN} position={[0, CEIL_Y, SIDE_MID_Z]} rotation={[HALF_PI, 0, 0]} shadowOpacity={0} />
      <Surface map={wall.left} width={SIDE_LEN} height={ROOM.height} position={[-HALF_W, MID_Y, SIDE_MID_Z]} rotation={[0, HALF_PI, 0]} shadowOpacity={wallShadow} />
      <Surface map={wall.right} width={SIDE_LEN} height={ROOM.height} position={[HALF_W, MID_Y, SIDE_MID_Z]} rotation={[0, -HALF_PI, 0]} shadowOpacity={wallShadow} />
      {/* The walls, floor and ceiling are the bare box he lands in; everything
          below builds itself in during the intro (build.tsx). */}
      <group visible={!study}>
        <BuildIn part="decals" style="pop" pivot={[0, MID_Y, BACK_Z]}>
          <Decals />
        </BuildIn>
      </group>
      <group visible={study}>
        <BuildIn part="rug" style="pop" pivot={[SPOTS.center.x, FLOOR_Y, SPOTS.center.z]}>
          <Rug />
        </BuildIn>
      </group>
      <BuildIn part="blobs" style="pop" pivot={[WINDOW.position[0], FLOOR_Y, WINDOW.position[2]]}>
        <WindowBlobs map={tex.blob} />
      </BuildIn>
      <BuildIn part="ceiling" style="drop" distance={1.4}>
        <CeilingLight glow={tex.glow} />
      </BuildIn>
    </group>
  )
}

