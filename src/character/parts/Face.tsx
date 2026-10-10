import { useEffect, useMemo, type RefObject } from 'react'
import type { Mesh } from 'three'
import { buildSparkleGeometry, FACE, type Placement } from '../geometry'
import type { Materials } from '../materials'
import type { RigRefs } from '../rig'

interface Props {
  refs: RigRefs
  materials: Materials
}

interface EyeProps {
  meshRef: RefObject<Mesh | null>
  placement: Placement
  materials: Materials
}

// Glossy black eye with two highlights. The highlights are children, so they
// inherit the (1, 1.1, 0.5) squash exactly as in tutor-3d.js.
function Eye({ meshRef, placement, materials }: EyeProps) {
  return (
    <mesh
      ref={meshRef}
      position={placement.position}
      quaternion={placement.quaternion}
      scale={[1, 1.1, 0.5]}
      material={materials.eye}
    >
      <sphereGeometry args={[0.094, 36, 28]} />
      <mesh position={[0.03, 0.035, 0.088]} material={materials.highlight}>
        <sphereGeometry args={[0.03, 16, 12]} />
      </mesh>
      <mesh position={[-0.03, -0.035, 0.09]} material={materials.highlight}>
        <sphereGeometry args={[0.013, 12, 8]} />
      </mesh>
    </mesh>
  )
}

export function Face({ refs, materials }: Props) {
  const sparkle = useMemo(buildSparkleGeometry, [])
  useEffect(() => () => sparkle.dispose(), [sparkle])

  return (
    <>
      <group name="eyes">
        <Eye meshRef={refs.eyeL} placement={FACE.eyeL} materials={materials} />
        <Eye meshRef={refs.eyeR} placement={FACE.eyeR} materials={materials} />
        <mesh ref={refs.happyL} position={FACE.happyL.position} quaternion={FACE.happyL.quaternion} material={materials.ink} visible={false}>
          <torusGeometry args={[0.075, 0.022, 10, 28, Math.PI * 0.85]} />
        </mesh>
        <mesh ref={refs.happyR} position={FACE.happyR.position} quaternion={FACE.happyR.quaternion} material={materials.ink} visible={false}>
          <torusGeometry args={[0.075, 0.022, 10, 28, Math.PI * 0.85]} />
        </mesh>
        <mesh ref={refs.sleepL} position={FACE.sleepL.position} quaternion={FACE.sleepL.quaternion} material={materials.ink} visible={false}>
          <torusGeometry args={[0.07, 0.017, 10, 28, Math.PI * 0.8]} />
        </mesh>
        <mesh ref={refs.sleepR} position={FACE.sleepR.position} quaternion={FACE.sleepR.quaternion} material={materials.ink} visible={false}>
          <torusGeometry args={[0.07, 0.017, 10, 28, Math.PI * 0.8]} />
        </mesh>
      </group>

      {/* Wake-up twinkles. The tick scales and turns the inner mesh. */}
      <group position={FACE.sparkL.position} quaternion={FACE.sparkL.quaternion}>
        <mesh ref={refs.sparkL} geometry={sparkle} material={materials.twinkle} visible={false} />
      </group>
      <group position={FACE.sparkR.position} quaternion={FACE.sparkR.quaternion}>
        <mesh ref={refs.sparkR} geometry={sparkle} material={materials.twinkle} visible={false} />
      </group>

      <group ref={refs.brows} name="brows">
        <mesh ref={refs.browL} position={FACE.browL.position} quaternion={FACE.browL.quaternion} material={materials.ink}>
          <torusGeometry args={[0.05, 0.012, 10, 28, Math.PI * 0.7]} />
        </mesh>
        <mesh ref={refs.browR} position={FACE.browR.position} quaternion={FACE.browR.quaternion} material={materials.ink}>
          <torusGeometry args={[0.05, 0.012, 10, 28, Math.PI * 0.7]} />
        </mesh>
      </group>

      <mesh ref={refs.smile} position={FACE.smile.position} quaternion={FACE.smile.quaternion} material={materials.ink}>
        <torusGeometry args={[0.048, 0.014, 10, 28, Math.PI * 0.8]} />
      </mesh>

      <group ref={refs.mouth} name="mouth" position={FACE.mouth.position} quaternion={FACE.mouth.quaternion}>
        <mesh scale={[1.15, 1, 0.45]} material={materials.mouth}>
          <sphereGeometry args={[0.066, 32, 16]} />
        </mesh>
        <mesh position={[0, -0.03, 0.012]} scale={[1.2, 0.6, 0.5]} material={materials.tongue}>
          <sphereGeometry args={[0.036, 24, 12]} />
        </mesh>
      </group>

      <mesh position={FACE.cheekL.position} quaternion={FACE.cheekL.quaternion} material={materials.cheek}>
        <planeGeometry args={[0.26, 0.15]} />
      </mesh>
      <mesh position={FACE.cheekR.position} quaternion={FACE.cheekR.quaternion} material={materials.cheek}>
        <planeGeometry args={[0.26, 0.15]} />
      </mesh>
    </>
  )
}
