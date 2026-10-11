import { useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute, type Texture } from 'three'
import type { Vec3 } from './worldConfig'

// Small building blocks shared by the two worlds. Every material is created
// transparent (opacity 1 at rest) so the cross-fade only ever changes
// opacity, never the shader; flat pieces are unlit so they keep the mock's
// colours exactly.

interface FlatProps {
  size: [number, number]
  position: Vec3
  rotation?: Vec3
  color: string
  opacity?: number
  map?: Texture | null
  renderOrder?: number
  depthWrite?: boolean
}

// A flat, unlit rectangle.
export function Plate({ size, position, rotation, color, opacity = 1, map = null, renderOrder, depthWrite = true }: FlatProps) {
  return (
    <mesh position={position} rotation={rotation} renderOrder={renderOrder}>
      <planeGeometry args={size} />
      <meshBasicMaterial color={color} map={map} transparent opacity={opacity} depthWrite={depthWrite} toneMapped={false} />
    </mesh>
  )
}

interface BoxProps {
  size: Vec3
  position: Vec3
  rotation?: Vec3
  color: string
  lit?: boolean // shaded by the stage lights (for small solid props)
  roughness?: number
  castShadow?: boolean
}

// A box: unlit for trim that should keep its exact colour, lit for props.
export function Block({ size, position, rotation, color, lit = false, roughness = 0.6, castShadow = false }: BoxProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow={castShadow}>
      <boxGeometry args={size} />
      {lit ? (
        <meshStandardMaterial color={color} roughness={roughness} transparent />
      ) : (
        <meshBasicMaterial color={color} transparent toneMapped={false} />
      )}
    </mesh>
  )
}

// A quad through four world points (a, b along the top edge; d, c along the
// bottom), uv (0,1) at a and (1,0) at c, for slanted planes like light shafts.
export function useQuad(a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute([...a, ...b, ...c, ...d], 3))
    g.setAttribute('uv', new Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2))
    g.setIndex([0, 3, 1, 1, 3, 2])
    g.computeVertexNormals()
    return g
  }, [...a, ...b, ...c, ...d])
  useEffect(() => () => geo.dispose(), [geo])
  return geo
}

// Disposes a texture made in useMemo when its owner unmounts.
export function useOwned<T extends { dispose: () => void }>(make: () => T): T {
  const t = useMemo(make, [make])
  useEffect(() => () => t.dispose(), [t])
  return t
}
