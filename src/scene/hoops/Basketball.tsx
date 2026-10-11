import { PHYSICS } from '../physics/config'

// The basketball's look, shared by the physics ball (src/scene/physics/Toys.tsx)
// and the ball the Play tab's moves draw in his hands (BallProp), so the
// swap between the two never shows. An orange ball with dark seams: two
// great circles and the two curved side seams.

const B = PHYSICS.ball
const SEAM = 0.035 // seam tube radius, as a share of the ball radius
const SIDE = 0.74 // the side seams' circle radius, as a share of the ball radius
const SIDE_AT = Math.sqrt(1 - SIDE * SIDE) // ...and their distance from the centre

export function Basketball({ radius = B.radius, castShadow = true }: { radius?: number; castShadow?: boolean }) {
  const r = radius
  const tube = r * SEAM
  return (
    <>
      <mesh castShadow={castShadow}>
        <sphereGeometry args={[r, 32, 24]} />
        <meshStandardMaterial color={B.color} roughness={0.62} />
      </mesh>
      {/* Great circles: one round the middle, one over the top. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r * 1.002, tube, 8, 48]} />
        <meshStandardMaterial color={B.stripe} roughness={0.7} />
      </mesh>
      <mesh>
        <torusGeometry args={[r * 1.002, tube, 8, 48]} />
        <meshStandardMaterial color={B.stripe} roughness={0.7} />
      </mesh>
      {/* Side seams: small circles either side of the top circle, crossing the middle one (as on a real ball). */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, 0, s * r * SIDE_AT]}>
          <torusGeometry args={[r * SIDE * 1.002, tube, 8, 40]} />
          <meshStandardMaterial color={B.stripe} roughness={0.7} />
        </mesh>
      ))}
    </>
  )
}
