import { RoundedBox } from '@react-three/drei'
import type { MeshStandardMaterial, Object3D } from 'three'
import type { Archetype } from '../archetypes'
import { BOSS_SHAPE as B } from './config'

// The boss: the bus monster from design/study-hub/Boss.dc.html built from
// primitives, in boss units with its feet (wheel bottoms) at the origin and
// its face on +z. It renders still; BossArena drives it every frame through
// `rig` (flash on the body materials, eyes, pupils and wheels).

export interface BossRig {
  mats: MeshStandardMaterial[] // body and band: their emissive is the white hit flash
  eyes: Object3D[] // scaled for blinks, squints and glares
  pupils: Object3D[]
  wheels: Object3D[] // spun about z
}

export const newBossRig = (): BossRig => ({ mats: [], eyes: [], pupils: [], wheels: [] })

const W = B.wheel
const WHEELS: [number, number][] = [
  [-W.x, W.z],
  [W.x, W.z],
  [-W.x, -W.z],
  [W.x, -W.z],
]

export function BossModel({ arch, rig }: { arch: Archetype; rig: BossRig }) {
  const { body, band, eye, pupil, brow, teeth, pipe } = B
  const top = body.bottom + body.h
  const front = body.d / 2
  return (
    <group>
      {WHEELS.map(([x, z], i) => (
        <group key={i} position={[x, W.r, z]} ref={(o) => void (o && (rig.wheels[i] = o))}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[W.r, W.r, W.len, 28]} />
            <meshStandardMaterial color={B.tire} roughness={0.8} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, Math.sign(z) * (W.len / 2 + 0.005)]}>
            <cylinderGeometry args={[W.hub, W.hub, 0.02, 20]} />
            <meshStandardMaterial color={B.hubColor} roughness={0.4} />
          </mesh>
          {/* Spokes, so a spinning wheel reads as spinning. */}
          <mesh position={[0, 0, Math.sign(z) * (W.len / 2 + 0.012)]}>
            <boxGeometry args={[W.r * 1.5, W.spoke, 0.012]} />
            <meshStandardMaterial color={B.hubColor} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, Math.sign(z) * (W.len / 2 + 0.012)]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[W.r * 1.5, W.spoke, 0.012]} />
            <meshStandardMaterial color={B.hubColor} roughness={0.4} />
          </mesh>
        </group>
      ))}

      <RoundedBox args={[body.w, body.h, body.d]} radius={body.radius} smoothness={4} position={[0, body.bottom + body.h / 2, 0]}>
        <meshStandardMaterial ref={(m) => void (m && (rig.mats[0] = m))} color={arch.body} roughness={B.roughness} emissive="#ffffff" emissiveIntensity={0} />
      </RoundedBox>
      <RoundedBox
        args={[body.w + band.grow, band.h, body.d + band.grow]}
        radius={band.radius}
        smoothness={4}
        position={[0, top - band.h / 2 + band.grow / 2, 0]}
      >
        <meshStandardMaterial ref={(m) => void (m && (rig.mats[1] = m))} color={arch.shade} roughness={B.roughness} emissive="#ffffff" emissiveIntensity={0} />
      </RoundedBox>

      {/* Exhaust pipe. */}
      <mesh position={[pipe.x, top + pipe.h / 2 - 0.05, pipe.z]}>
        <cylinderGeometry args={[pipe.r, pipe.r, pipe.h, 14]} />
        <meshStandardMaterial color={B.hubColor} roughness={0.45} />
      </mesh>

      {/* Face. */}
      {eye.xs.map((x, i) => (
        <group key={i} position={[x, eye.y, front + 0.02]} ref={(o) => void (o && (rig.eyes[i] = o))}>
          <mesh scale={[1, eye.squash, eye.depth]}>
            <sphereGeometry args={[eye.r, 24, 16]} />
            <meshStandardMaterial color={B.eyeWhite} roughness={0.3} />
          </mesh>
          <group position={pupil.look} ref={(o) => void (o && (rig.pupils[i] = o))}>
            <mesh scale={[1, 1, 0.6]}>
              <sphereGeometry args={[pupil.r, 16, 12]} />
              <meshStandardMaterial color={B.ink} roughness={0.3} />
            </mesh>
          </group>
        </group>
      ))}
      {eye.xs.map((x, i) => (
        <mesh key={i} position={[x + (i === 0 ? 0.04 : -0.04), brow.y, front + 0.05]} rotation={[0, 0, i === 0 ? -brow.tilt : brow.tilt]}>
          <boxGeometry args={[brow.w, brow.h, brow.d]} />
          <meshStandardMaterial color={B.ink} roughness={0.5} />
        </mesh>
      ))}
      <RoundedBox args={[teeth.w, teeth.h, teeth.d]} radius={0.06} smoothness={3} position={[teeth.x, teeth.y, front]}>
        <meshStandardMaterial color={B.eyeWhite} roughness={0.35} />
      </RoundedBox>
      {teeth.gaps.map((gx, i) => (
        <mesh key={i} position={[teeth.x + gx, teeth.y, front + teeth.d / 2 + 0.002]}>
          <planeGeometry args={[teeth.gap, teeth.h * 0.92]} />
          <meshBasicMaterial color={arch.body} />
        </mesh>
      ))}
    </group>
  )
}
