import { useEffect, useMemo } from 'react'
import { Color, type Texture } from 'three'
import { FLOOR_Y } from '../layout3d'
import { SHELL } from './fade'
import { WORLD, type Band } from './worldConfig'

// The room both worlds share: a floor, the back wall and two side walls, at
// the physics room's bounds. Walls are stacked horizontal bands of flat
// colour (unlit, so the mock's exact colours survive the tone mapping); the
// side walls are a shade darker so the corners read. Every piece is marked
// as shell for the cross-fade (fade.ts) and drawn first among transparent
// things, so a world's props and the scene's glows always land on top.

const S = WORLD.shell
const HALF_PI = Math.PI / 2
const DEPTH = S.frontZ - S.backZ
const MID_Z = (S.backZ + S.frontZ) / 2

interface Segment {
  from: number
  to: number
  color: string
}

// Splits 0..top into flat segments: the wall colour, overridden by each band in turn.
function segments(wall: string, bands: readonly Band[]): Segment[] {
  let out: Segment[] = [{ from: 0, to: S.top, color: wall }]
  for (const b of bands) {
    const next: Segment[] = []
    for (const s of out) {
      if (b.to <= s.from || b.from >= s.to) {
        next.push(s)
        continue
      }
      if (s.from < b.from) next.push({ from: s.from, to: b.from, color: s.color })
      next.push({ from: Math.max(s.from, b.from), to: Math.min(s.to, b.to), color: b.color })
      if (b.to < s.to) next.push({ from: b.to, to: s.to, color: s.color })
    }
    out = next
  }
  return out.filter((s) => s.to - s.from > 1e-4)
}

function flat(color: Color | string) {
  return { color, transparent: true, toneMapped: false } as const
}

export interface RoomShellProps {
  wall: string
  bands?: readonly Band[] // floor-relative heights, painted over the wall colour in order
  floor: string
  floorMap?: Texture // repeated over the floor; texture.userData.tile = [width, depth] of one repeat
}

export function RoomShell({ wall, bands = [], floor, floorMap }: RoomShellProps) {
  const segs = useMemo(() => segments(wall, bands), [wall, bands])
  const side = useMemo(() => segs.map((s) => new Color(s.color).multiplyScalar(S.sideShade)), [segs])

  useEffect(() => {
    if (!floorMap) return
    const [tw, td] = (floorMap.userData.tile as [number, number] | undefined) ?? [1, 1]
    floorMap.repeat.set((S.halfW * 2) / tw, DEPTH / td)
    floorMap.needsUpdate = true
  }, [floorMap])

  return (
    <group name="world-shell">
      <mesh userData={SHELL} renderOrder={S.order} position={[0, FLOOR_Y, MID_Z]} rotation={[-HALF_PI, 0, 0]}>
        <planeGeometry args={[S.halfW * 2, DEPTH]} />
        <meshBasicMaterial {...flat(floorMap ? '#ffffff' : floor)} map={floorMap ?? null} />
      </mesh>
      {segs.map((s, i) => {
        const h = s.to - s.from
        const y = FLOOR_Y + s.from + h / 2
        return (
          <group key={`${s.from}-${s.to}`}>
            <mesh userData={SHELL} renderOrder={S.order} position={[0, y, S.backZ]}>
              <planeGeometry args={[S.halfW * 2, h]} />
              <meshBasicMaterial {...flat(s.color)} />
            </mesh>
            <mesh userData={SHELL} renderOrder={S.order} position={[-S.halfW, y, MID_Z]} rotation={[0, HALF_PI, 0]}>
              <planeGeometry args={[DEPTH, h]} />
              <meshBasicMaterial {...flat(side[i])} />
            </mesh>
            <mesh userData={SHELL} renderOrder={S.order} position={[S.halfW, y, MID_Z]} rotation={[0, -HALF_PI, 0]}>
              <planeGeometry args={[DEPTH, h]} />
              <meshBasicMaterial {...flat(side[i])} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// Receives the key light's shadow (tutor, toys) on the floor, over everything painted on it.
export function ShadowCatcher({ opacity, lift }: { opacity: number; lift: number }) {
  return (
    <mesh position={[0, FLOOR_Y + lift, (S.backZ + 3) / 2]} rotation={[-HALF_PI, 0, 0]} receiveShadow>
      <planeGeometry args={[S.halfW * 2, 3 - S.backZ]} />
      <shadowMaterial transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}
