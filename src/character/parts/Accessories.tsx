import { useEffect, useMemo, type RefObject } from 'react'
import type { Group } from 'three'
import { ACCESSORY_PLACES as P, buildTieBladeGeometry } from '../geometry'
import type { Accessory } from '../look'
import type { Materials } from '../materials'

// Accessories from design/tutor-3d.js, same geometry and transforms. Each is
// always mounted and toggled with `visible`, like the original's acc map.

interface Props {
  accessory: Accessory
  materials: Materials
}

// Glasses, bow tie, earbuds and tie ride on the body (they share its squash).
export function BodyAccessories({ accessory, materials: m }: Props) {
  const blade = useMemo(buildTieBladeGeometry, [])
  useEffect(() => () => blade.dispose(), [blade])

  return (
    <>
      <group name="glasses" visible={accessory === 'glasses'}>
        <mesh position={P.rimL.position} quaternion={P.rimL.quaternion} material={m.frame}>
          <torusGeometry args={[0.125, 0.018, 12, 44]} />
        </mesh>
        <mesh position={P.rimR.position} quaternion={P.rimR.quaternion} material={m.frame}>
          <torusGeometry args={[0.125, 0.018, 12, 44]} />
        </mesh>
        <mesh position={P.bridge.position} quaternion={P.bridge.quaternion} material={m.frame}>
          <torusGeometry args={[0.045, 0.011, 8, 20, Math.PI]} />
        </mesh>
      </group>

      <group name="bowtie" visible={accessory === 'bowtie'} position={P.bowtie.position} quaternion={P.bowtie.quaternion}>
        {([-1, 1] as const).map((sx) => (
          <mesh key={sx} material={m.bow} rotation-z={(sx * Math.PI) / 2} position-x={sx * 0.08} scale-z={0.5}>
            <coneGeometry args={[0.08, 0.15, 24]} />
          </mesh>
        ))}
        <mesh material={m.bow} scale-z={0.6}>
          <sphereGeometry args={[0.038, 16, 10]} />
        </mesh>
      </group>

      <group name="headphones" visible={accessory === 'headphones'}>
        {([-1, 1] as const).map((sx) => (
          <group key={sx} position={[sx * 0.84, 0, 0.08]} rotation={[0, sx * 0.25, sx * 0.15]} scale={1.35}>
            <mesh material={m.earbud} scale={[0.8, 1, 0.8]}>
              <sphereGeometry args={[0.075, 24, 16]} />
            </mesh>
            <mesh material={m.earbud} position={[0, -0.11, 0.02]}>
              <capsuleGeometry args={[0.026, 0.11, 8, 16]} />
            </mesh>
          </group>
        ))}
      </group>

      <group name="scarf" visible={accessory === 'scarf'} position={P.tie.position} quaternion={P.tie.quaternion}>
        <mesh material={m.tie} scale={[1.15, 0.9, 0.55]}>
          <sphereGeometry args={[0.055, 20, 14]} />
        </mesh>
        <mesh geometry={blade} material={m.tie} position={[0, -0.035, -0.005]} />
      </group>
    </>
  )
}

// The sprout sits on the cap, so it pops with it.
export function CapLeaf({ accessory, materials: m }: Props) {
  return (
    <group name="leaf" visible={accessory === 'leaf'} position={[-0.2, 0.935, 0.14]} scale={1.7}>
      <mesh material={m.leafStem} position-y={0.06} rotation-z={-0.15}>
        <cylinderGeometry args={[0.01, 0.013, 0.13, 8]} />
      </mesh>
      <mesh material={m.leaf} scale={[1, 0.2, 0.48]} position={[0.09, 0.15, 0]} rotation-z={0.55}>
        <sphereGeometry args={[0.11, 28, 14]} />
      </mesh>
      <mesh material={m.leaf} scale={[1, 0.2, 0.5]} position={[-0.06, 0.12, 0.02]} rotation-z={-0.65}>
        <sphereGeometry args={[0.08, 24, 12]} />
      </mesh>
    </group>
  )
}

// Held in the left hand. The tick hides it while reading.
export function Mic({ groupRef, materials: m }: { groupRef: RefObject<Group | null>; materials: Materials }) {
  return (
    <group ref={groupRef} name="mic" visible={false} position={[0.02, 0.12, 0.16]} rotation={[0.25, 0, -0.15]} scale={1.6}>
      <mesh material={m.micBody}>
        <capsuleGeometry args={[0.048, 0.15, 10, 24]} />
      </mesh>
      <mesh material={m.micHead} position-y={0.2}>
        <sphereGeometry args={[0.1, 36, 24]} />
      </mesh>
      <mesh material={m.micBody} rotation-x={Math.PI / 2} position-y={0.125}>
        <torusGeometry args={[0.058, 0.016, 12, 32]} />
      </mesh>
    </group>
  )
}

// Held in the right hand.
export function Pencil({ accessory, materials: m }: Props) {
  return (
    <group name="pencil" visible={accessory === 'pencil'} position={[-0.04, 0.12, 0.14]} rotation={[0.2, 0, 0.3]} scale={1.3}>
      <mesh material={m.pencil}>
        <cylinderGeometry args={[0.04, 0.04, 0.32, 6]} />
      </mesh>
      <mesh material={m.pencilWood} position-y={0.205}>
        <coneGeometry args={[0.04, 0.09, 6]} />
      </mesh>
      <mesh material={m.pencilLead} position-y={0.245}>
        <sphereGeometry args={[0.014, 10, 8]} />
      </mesh>
      <mesh material={m.ferrule} position-y={-0.177}>
        <cylinderGeometry args={[0.042, 0.042, 0.035, 16]} />
      </mesh>
      <mesh material={m.eraser} position-y={-0.215}>
        <capsuleGeometry args={[0.04, 0.02, 8, 16]} />
      </mesh>
    </group>
  )
}

// Open book for the read pose, on the root in front of the body.
export function Book({ groupRef, materials: m }: { groupRef: RefObject<Group | null>; materials: Materials }) {
  return (
    <group ref={groupRef} name="book" visible={false} position={[0, -0.3, 0.98]} rotation-x={-0.85} scale={1.25}>
      {([-1, 1] as const).map((sx) => (
        <group key={sx} rotation-z={sx * 0.22}>
          <mesh material={m.bookCover} position-x={sx * 0.135}>
            <boxGeometry args={[0.27, 0.014, 0.36]} />
          </mesh>
          <mesh material={m.bookPage} position={[sx * 0.128, 0.018, 0]}>
            <boxGeometry args={[0.25, 0.024, 0.33]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
