import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Object3D,
  type InstancedMesh,
  type Texture,
} from 'three'
import { FLOOR_Y, PALETTE, ROOM, SPOTS, WINDOWS } from '../layout3d'
import { roundedRect } from '../windows/shapes'
import { blobTexture, glowTexture, surfaceTexture } from './bakedTextures'
import { ROOM_STYLE as S, type DecalKind, type Surface } from './roomStyle'

// The lesson's white-box room: a one-point-perspective interior (floor, back
// wall, two side walls, ceiling) with baked soft-white tones and corner
// falloff, transparent shadow catchers over each surface, and the bold
// accents (colour-block skirting, rug, rainbow arch, ceiling light, confetti
// decals). Unlit surfaces keep the room the mock's exact tones under any
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
      glow: glowTexture(),
      blob: blobTexture(),
    }
  }, [])
  useEffect(() => () => Object.values(tex).forEach((t: Texture) => t.dispose()), [tex])
  return tex
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

// Colour blocks along the base of the walls, one InstancedMesh for all of
// them. The colour sequence runs left wall (front to back), back wall (left
// to right), right wall (back to front), so it wraps the corners unbroken.
function Skirting() {
  const ref = useRef<InstancedMesh>(null)
  const { height, depth, segment, gap, colors, rail } = S.skirting

  const blocks = useMemo(() => {
    const out: { x: number; z: number; yaw: number; len: number }[] = []
    const run = (len: number, at: (d: number) => [number, number], yaw: number) => {
      const n = Math.ceil(len / segment)
      for (let i = 0; i < n; i++) {
        const start = i * segment
        const l = Math.min(segment, len - start) - gap
        if (l <= 0) continue
        const [x, z] = at(start + gap / 2 + l / 2)
        out.push({ x, z, yaw, len: l })
      }
    }
    run(SIDE_LEN, (d) => [-HALF_W + depth / 2, FRONT_Z - d], HALF_PI)
    run(ROOM.width, (d) => [-HALF_W + d, BACK_Z + depth / 2], 0)
    run(SIDE_LEN, (d) => [HALF_W - depth / 2, BACK_Z + d], -HALF_PI)
    return out
  }, [segment, gap, depth])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const o = new Object3D()
    const c = new Color()
    blocks.forEach((b, i) => {
      o.position.set(b.x, FLOOR_Y + height / 2, b.z)
      o.rotation.set(0, b.yaw, 0)
      o.scale.set(b.len, height, depth)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      mesh.setColorAt(i, c.set(PALETTE[colors[i % colors.length]]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [blocks, colors, height, depth])

  const railY = FLOOR_Y + height + rail.gapAbove + rail.height / 2
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, blocks.length]} castShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {/* Ink rail above the blocks: back, left, right. */}
      <mesh position={[0, railY, BACK_Z + depth / 4]}>
        <boxGeometry args={[ROOM.width, rail.height, depth / 2]} />
        <meshBasicMaterial color={rail.color} toneMapped={false} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (HALF_W - depth / 4), railY, SIDE_MID_Z]}>
          <boxGeometry args={[depth / 2, rail.height, SIDE_LEN]} />
          <meshBasicMaterial color={rail.color} toneMapped={false} />
        </mesh>
      ))}
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

// Soft contact blobs on the floor under the two floating windows.
function WindowBlobs({ map }: { map: Texture }) {
  const { width, depth, opacity, dz } = S.windowBlob
  return (
    <>
      {[WINDOWS.notes, WINDOWS.board].map((w, i) => (
        <mesh key={i} position={[w.position[0], FLOOR_Y + S.lift * 2, w.position[2] + dz]} rotation={[-HALF_PI, 0, 0]} renderOrder={1}>
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial map={map} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  )
}

// Half-ring rainbow on the back wall, framing the tutor from behind.
function Arch() {
  const { radius, bands, bandWidth, gap, opacity, segments } = S.arch
  return (
    <group position={[SPOTS.center.x, FLOOR_Y, BACK_Z + S.lift * 2]}>
      {bands.map((c, i) => {
        const outer = radius - i * (bandWidth + gap)
        return (
          <mesh key={c + i}>
            <ringGeometry args={[outer - bandWidth, outer, segments, 1, 0, Math.PI]} />
            <meshBasicMaterial color={PALETTE[c]} transparent opacity={opacity} toneMapped={false} />
          </mesh>
        )
      })}
    </group>
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

  return (
    <group name="white-box-room">
      <Surface map={tex.back} width={ROOM.width} height={ROOM.height} position={[0, MID_Y, BACK_Z]} rotation={[0, 0, 0]} shadowOpacity={wallShadow} />
      <Surface map={tex.floor} width={ROOM.width} height={SIDE_LEN} position={[0, FLOOR_Y, SIDE_MID_Z]} rotation={[-HALF_PI, 0, 0]} shadowOpacity={floorShadow} />
      <Surface map={tex.ceiling} width={ROOM.width} height={SIDE_LEN} position={[0, CEIL_Y, SIDE_MID_Z]} rotation={[HALF_PI, 0, 0]} shadowOpacity={0} />
      <Surface map={tex.left} width={SIDE_LEN} height={ROOM.height} position={[-HALF_W, MID_Y, SIDE_MID_Z]} rotation={[0, HALF_PI, 0]} shadowOpacity={wallShadow} />
      <Surface map={tex.right} width={SIDE_LEN} height={ROOM.height} position={[HALF_W, MID_Y, SIDE_MID_Z]} rotation={[0, -HALF_PI, 0]} shadowOpacity={wallShadow} />
      <Arch />
      <Decals />
      <Skirting />
      <Rug />
      <WindowBlobs map={tex.blob} />
      <CeilingLight glow={tex.glow} />
    </group>
  )
}

