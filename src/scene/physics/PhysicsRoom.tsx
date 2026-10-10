import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import type { ReactNode } from 'react'
import { useMode } from '../../state/mode'
import { PHYSICS, ROOM_BOX } from './config'

// The physics world for play mode: Rapier with fixed colliders on every face
// of the white-box room (floor, back wall, side walls, ceiling) plus an
// invisible front wall just inside the camera's frame, so nothing thrown ever
// leaves the room or rolls out of view. The two floating windows get thin
// colliders too. The simulation pauses in study mode (the tutor's body is
// then moved by hand, and the toys are unmounted).
//
// Rapier's WASM loads on first mount, so this suspends once: put it inside a
// <Suspense>. Everything physical (PhysicsTutor, Toys) goes in as children.

const T = PHYSICS.wallThickness
const H = T / 2
const { halfW, floorY, ceilY, backZ, frontZ } = ROOM_BOX
const midY = (floorY + ceilY) / 2
const midZ = (backZ + frontZ) / 2
const halfY = (ceilY - floorY) / 2 + T
const halfZ = (frontZ - backZ) / 2 + T
const halfX = halfW + T

// [half extents, centre] for each face, outside the room so the inner surface sits exactly on it.
const FACES: { args: [number, number, number]; position: [number, number, number] }[] = [
  { args: [halfX, H, halfZ], position: [0, floorY - H, midZ] }, // floor
  { args: [halfX, H, halfZ], position: [0, ceilY + H, midZ] }, // ceiling
  { args: [halfX, halfY, H], position: [0, midY, backZ - H] }, // back wall
  { args: [halfX, halfY, H], position: [0, midY, frontZ + H] }, // invisible front wall
  { args: [H, halfY, halfZ], position: [-halfW - H, midY, midZ] }, // left wall
  { args: [H, halfY, halfZ], position: [halfW + H, midY, midZ] }, // right wall
]

// The room's colliders alone, for a scene that already has a <Physics>.
export function RoomColliders({ windows = true }: { windows?: boolean }) {
  return (
    <RigidBody type="fixed" colliders={false} name="physics-room">
      {FACES.map((f, i) => (
        <CuboidCollider key={i} args={f.args} position={f.position} restitution={PHYSICS.restitution} friction={PHYSICS.friction} />
      ))}
      {windows &&
        PHYSICS.windows.map((w, i) => (
          <CuboidCollider key={`w${i}`} args={w.half} position={w.position} rotation={[0, w.yaw, 0]} restitution={PHYSICS.restitution} friction={PHYSICS.friction} />
        ))}
    </RigidBody>
  )
}

interface PhysicsRoomProps {
  children?: ReactNode
  debug?: boolean // draw Rapier's collider wireframes
  windows?: boolean // colliders for the two floating windows (default on)
}

export function PhysicsRoom({ children, debug = false, windows = true }: PhysicsRoomProps) {
  const paused = useMode((s) => s.mode === 'study')
  return (
    <Physics gravity={PHYSICS.gravity} timeStep={PHYSICS.timeStep} paused={paused} debug={debug}>
      <RoomColliders windows={windows} />
      {children}
    </Physics>
  )
}
