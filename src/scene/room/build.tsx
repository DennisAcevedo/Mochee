import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type { Group } from 'three'

// The room assembling itself during the intro: after the tutor lands in the
// bare white box, each piece pops, rises or slides into place. The intro
// tweens these 0..1 values (src/intro/intro.ts, INTRO.build); 1 = built,
// which is also the default, so everywhere else the room is simply there.

export type BuildPart = 'rug' | 'skirting' | 'ceiling' | 'decals' | 'blobs' | 'notes' | 'board' | 'evolution'

export const roomBuild: Record<BuildPart, number> = {
  rug: 1,
  skirting: 1,
  ceiling: 1,
  decals: 1,
  blobs: 1,
  notes: 1,
  board: 1,
  evolution: 1,
}

export function setRoomBuild(k: number) {
  for (const part of Object.keys(roomBuild) as BuildPart[]) roomBuild[part] = k
}

// pop: grows from `pivot`. rise / drop: slides up from under the floor / down
// from the ceiling by `distance`. left / right: flies in from that side,
// growing and turning as it comes.
type BuildStyle = 'pop' | 'rise' | 'drop' | 'left' | 'right'

interface Props {
  part: BuildPart
  style: BuildStyle
  pivot?: [number, number, number]
  distance?: number
  children: ReactNode
}

export function BuildIn({ part, style, pivot = [0, 0, 0], distance = 1, children }: Props) {
  const outer = useRef<Group>(null)

  useFrame(() => {
    const g = outer.current
    if (!g) return
    const k = roomBuild[part]
    g.visible = k > 0.001
    const away = 1 - k
    const [px, py, pz] = pivot
    let s = 1
    let x = px
    let y = py
    let yaw = 0
    if (style === 'pop') s = Math.max(0, k)
    else if (style === 'rise') y = py - away * distance
    else if (style === 'drop') y = py + away * distance
    else {
      const side = style === 'left' ? -1 : 1
      x = px + side * away * distance
      s = Math.max(0, 0.6 + 0.4 * k)
      yaw = -side * away * 0.6
    }
    g.position.set(x, y, pz)
    g.scale.setScalar(s)
    g.rotation.y = yaw
  })

  // The outer group moves around the pivot; the inner one puts the children back where they were.
  return (
    <group ref={outer} position={pivot}>
      <group position={[-pivot[0], -pivot[1], -pivot[2]]}>{children}</group>
    </group>
  )
}
