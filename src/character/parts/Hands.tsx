import type { ReactNode, RefObject } from 'react'
import type { Group, Material } from 'three'

interface HandProps {
  groupRef: RefObject<Group | null>
  name: string
  side: -1 | 1
  material: Material
  children?: ReactNode
}

// Floating mitten: squashed capsule plus a thumb nub. Lives in world space
// (not under the root) so the spring lag against the body reads naturally.
function Hand({ groupRef, name, side, material, children }: HandProps) {
  return (
    <group ref={groupRef} name={name}>
      <mesh material={material} scale={[1, 1, 0.74]} castShadow receiveShadow>
        <capsuleGeometry args={[0.15, 0.06, 12, 28]} />
      </mesh>
      <mesh material={material} scale={[0.85, 1.25, 0.8]} position={[-side * 0.135, -0.04, 0.05]} rotation-z={side * 0.5} castShadow>
        <sphereGeometry args={[0.07, 24, 16]} />
      </mesh>
      {children}
    </group>
  )
}

interface Props {
  leftRef: RefObject<Group | null>
  rightRef: RefObject<Group | null>
  material: Material
  left?: ReactNode // held items (tutor-3d.js: mic in the left hand, pencil in the right)
  right?: ReactNode
}

export function Hands({ leftRef, rightRef, material, left, right }: Props) {
  return (
    <>
      <Hand groupRef={leftRef} name="hand_L" side={-1} material={material}>
        {left}
      </Hand>
      <Hand groupRef={rightRef} name="hand_R" side={1} material={material}>
        {right}
      </Hand>
    </>
  )
}
