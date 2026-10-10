import type { RefObject } from 'react'
import type { Material, Mesh } from 'three'
import { GROUND } from '../../animation/config'

interface Props {
  meshRef: RefObject<Mesh | null>
  material: Material
}

// Radial ground blob. The tick moves it under the character and fades it with height.
export function Shadow({ meshRef, material }: Props) {
  return (
    <mesh ref={meshRef} name="shadow" material={material} rotation-x={-Math.PI / 2} position-y={GROUND.y + GROUND.blobLift}>
      <planeGeometry args={[GROUND.blobSize, GROUND.blobSize]} />
    </mesh>
  )
}
