import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { DoubleSide, Matrix4, Vector3, type Group } from 'three'
import { HOOPS } from './config'

// The dunk's pop-up hoop: a portable stand that springs out of the floor
// beside him just before the slam (its board on his left, the viewer's right,
// so it never hides him), stays a moment after the ball goes through and sinks
// away. BallProp places it; it has no colliders, the physics ball drops
// straight through. Model units in his root frame (frozen at the pop).

const DK = HOOPS.dunk
const C = DK.colors

export class DunkHoopState {
  active = false
  t = 0 // seconds since it started popping up
  slamAt = Infinity // `t` when the ball went through
  readonly rim = new Vector3() // rim centre, root frame
  readonly frame = new Matrix4() // his root's world matrix at the pop

  pop(rim: { x: number; y: number; z: number }, frame: Matrix4): void {
    this.rim.set(rim.x, rim.y, rim.z)
    this.frame.copy(frame)
    this.active = true
    this.t = 0
    this.slamAt = Infinity
  }
}

const easeOutBack = (x: number) => 1 + 2.9 * (x - 1) ** 3 + 1.9 * (x - 1) ** 2

export function DunkHoop({ state }: { state: DunkHoopState }) {
  const frame = useRef<Group>(null)
  const stand = useRef<Group>(null)
  const top = useRef<Group>(null)
  const pole = useRef<Group>(null)
  const bd = DK.board
  const boardX = DK.rimRadius + DK.boardGap // the board's face, from the rim centre toward his left
  const poleTop = bd.above + bd.height / 2

  useFrame((_, delta) => {
    const f = frame.current
    const st = stand.current
    if (!f || !st || !top.current || !pole.current) return
    if (!state.active) {
      f.visible = false
      return
    }
    state.t += Math.min(delta, 0.05)
    const away = state.t - state.slamAt - DK.stayAfter
    const stale = state.slamAt === Infinity && state.t > HOOPS.timeouts.clip
    if (away > DK.popSeconds || stale) {
      state.active = false
      f.visible = false
      return
    }
    const k = away > 0 ? 1 - away / DK.popSeconds : easeOutBack(Math.min(1, state.t / DK.popSeconds))
    f.visible = true
    f.matrix.copy(state.frame)
    f.matrixWorldNeedsUpdate = true
    // The stand's foot is on the floor under the board; it grows from there.
    const r = state.rim
    st.position.set(r.x + boardX, 0, r.z)
    st.scale.setScalar(Math.max(0.001, k))
    top.current.position.y = r.y
    const len = Math.max(0.01, r.y + poleTop)
    pole.current.scale.set(1, len, 1)
    pole.current.position.y = len / 2
  })

  return (
    <group ref={frame} matrixAutoUpdate={false} visible={false} name="hoops-dunk-hoop">
      <group ref={stand}>
        {/* Rim height: the rim, its net and the board. */}
        <group ref={top}>
          <group position={[-boardX, 0, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[DK.rimRadius, DK.tube, 10, 40]} />
              <meshStandardMaterial color={C.rim} roughness={0.3} />
            </mesh>
            <mesh position={[0, -DK.netDepth / 2, 0]}>
              <cylinderGeometry args={[DK.rimRadius, DK.rimRadius * 0.62, DK.netDepth, 14, 3, true]} />
              <meshBasicMaterial color={C.net} wireframe transparent opacity={0.6} toneMapped={false} side={DoubleSide} />
            </mesh>
          </group>
          <mesh position={[-DK.boardGap / 2, -0.01, 0]}>
            <boxGeometry args={[DK.boardGap + 0.02, 0.04, 0.1]} />
            <meshStandardMaterial color={C.rim} roughness={0.35} />
          </mesh>
          <mesh position={[bd.thick / 2, bd.above, 0]}>
            <boxGeometry args={[bd.thick, bd.height, bd.width]} />
            <meshStandardMaterial color={C.board} roughness={0.25} />
          </mesh>
          <mesh position={[-0.002, bd.above, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <ringGeometry args={[bd.height * 0.5 - 0.045, bd.height * 0.5, 4, 1, Math.PI / 4]} />
            <meshBasicMaterial color={C.frame} side={DoubleSide} toneMapped={false} />
          </mesh>
          <mesh position={[-0.002, 0.13, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <ringGeometry args={[0.12, 0.155, 4, 1, Math.PI / 4]} />
            <meshBasicMaterial color={C.frame} side={DoubleSide} toneMapped={false} />
          </mesh>
        </group>
        {/* The pole from the floor to the board's top, behind the board, and its round foot. */}
        <group ref={pole} position={[bd.thick + DK.pole, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[DK.pole, DK.pole, 1, 12]} />
            <meshStandardMaterial color={C.pole} roughness={0.4} metalness={0.2} />
          </mesh>
        </group>
        <mesh position={[bd.thick + DK.pole, 0.02, 0]}>
          <cylinderGeometry args={[0.22, 0.26, 0.04, 20]} />
          <meshStandardMaterial color={C.frame} roughness={0.5} />
        </mesh>
      </group>
    </group>
  )
}
