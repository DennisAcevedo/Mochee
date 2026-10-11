import { useEffect, useMemo } from 'react'
import { DoubleSide, PlaneGeometry, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FLOOR_Y } from '../layout3d'
import { useGym } from './gymStore'
import { Block, Plate } from './parts'
import { scoreboardFace } from './textures'
import { WORLD, type Vec3 } from './worldConfig'

// The gym's dressing: court lines, the light dashes along the sky stripe,
// the hoop (mount, and optionally a drawn hoop), the SHOTS scoreboard and
// the ball rack.

const G = WORLD.play
const S = WORLD.shell
const HALF_PI = Math.PI / 2
const MID_Z = (S.backZ + S.frontZ) / 2
const DEPTH = S.frontZ - S.backZ
const FLAT: Vec3 = [-HALF_PI, 0, 0]

// A geometry built once from config, disposed with its owner.
function useDisposed<T extends BufferGeometry>(make: () => T): T {
  const g = useMemo(make, [make])
  useEffect(() => () => g.dispose(), [g])
  return g
}

// A row of bars along a wall of the given length, centred, in the wall's plane.
const backDashes = () => dashRow(S.halfW * 2 - 0.2)
const sideDashes = () => dashRow(DEPTH)
function dashRow(length: number) {
  const D = G.dashes
  const pitch = D.length + D.gap
  const n = Math.floor((length - D.gap) / pitch)
  const start = -((n - 1) * pitch) / 2
  return mergeGeometries(Array.from({ length: n }, (_, i) => new PlaneGeometry(D.length, D.height).translate(start + i * pitch, 0, 0)))
}

export function Dashes() {
  const D = G.dashes
  const back = useDisposed(backDashes)
  const side = useDisposed(sideDashes)
  const y = FLOOR_Y + D.at
  const mat = <meshBasicMaterial color={D.color} transparent opacity={D.opacity} depthWrite={false} toneMapped={false} />
  return (
    <group name="gym-dashes">
      <mesh geometry={back} position={[0, y, S.backZ + 0.004]}>
        {mat}
      </mesh>
      <mesh geometry={side} position={[-S.halfW + 0.004, y, MID_Z]} rotation={[0, HALF_PI, 0]}>
        {mat}
      </mesh>
      <mesh geometry={side} position={[S.halfW - 0.004, y, MID_Z]} rotation={[0, -HALF_PI, 0]}>
        {mat}
      </mesh>
    </group>
  )
}

// Half court under the hoop: the lane, the free-throw circle, the
// three-point arc round the rim's floor spot (cut off by the walls), a
// sideline along the back wall and half a centre circle on the left wall.
export function CourtLines() {
  const L = G.court
  const [rx, , rz] = G.hoop.rim
  const y = FLOOR_Y + L.lift
  const w = L.width
  const ftX = S.halfW - L.laneLength
  // The arc in world angles phi (direction (cos phi, sin phi) in x, z): from
  // the right wall on the camera side, round through -x, to the back sideline.
  const phiStart = Math.acos(Math.min(1, (S.halfW - rx) / L.threeRadius))
  const toSideline = Math.asin(Math.min(1, (rz - (S.backZ + L.sideline)) / L.threeRadius))
  const phiEnd = Math.min(Math.PI + toSideline, 2 * Math.PI - phiStart)
  // Laid flat (rotation -90 deg about x), a ring's local angle t points at world phi = -t.
  const mat = <meshBasicMaterial color={L.color} transparent depthWrite={false} toneMapped={false} />
  return (
    <group name="gym-court">
      {/* lane: two long lines and the free-throw line */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(S.halfW + ftX) / 2, y, rz + (s * L.laneWidth) / 2]} rotation={FLAT}>
          <planeGeometry args={[L.laneLength, w]} />
          {mat}
        </mesh>
      ))}
      <mesh position={[ftX, y, rz]} rotation={FLAT}>
        <planeGeometry args={[w, L.laneWidth + w]} />
        {mat}
      </mesh>
      <mesh position={[ftX, y, rz]} rotation={FLAT}>
        <ringGeometry args={[L.freeThrowRadius - w / 2, L.freeThrowRadius + w / 2, 64]} />
        {mat}
      </mesh>
      <mesh position={[rx, y, rz]} rotation={FLAT}>
        <ringGeometry args={[L.threeRadius - w / 2, L.threeRadius + w / 2, 96, 1, -phiEnd, phiEnd - phiStart]} />
        {mat}
      </mesh>
      <mesh position={[0, y, S.backZ + L.sideline]} rotation={FLAT}>
        <planeGeometry args={[S.halfW * 2, w]} />
        {mat}
      </mesh>
      <mesh position={[-S.halfW, y, rz]} rotation={FLAT}>
        <ringGeometry args={[L.centerRadius - w / 2, L.centerRadius + w / 2, 64, 1, -HALF_PI, Math.PI]} />
        {mat}
      </mesh>
    </group>
  )
}

// The pad on the right wall behind the toy's backboard, and (draw = 'full')
// a board, rim and net of its own at the same rim.
export function GymHoop({ draw }: { draw: 'mount' | 'full' }) {
  const H = G.hoop
  const [rx, ry, rz] = H.rim
  const B = H.board
  const by = ry + B.above
  const P = H.pad
  const wallX = S.halfW
  const turn: Vec3 = [0, -HALF_PI, 0] // facing into the room (-x)
  return (
    <group name="gym-hoop">
      <Plate size={[B.width + P.margin * 2 + P.inset * 2, B.height + P.margin * 2 + P.inset * 2]} position={[wallX - 0.004, by, rz]} rotation={turn} color={P.trim} />
      <Plate size={[B.width + P.margin * 2, B.height + P.margin * 2]} position={[wallX - 0.008, by, rz]} rotation={turn} color={P.color} />
      {draw === 'full' && (
        <>
          <Block size={[B.thick, B.height, B.width]} position={[wallX - B.thick / 2 - 0.01, by, rz]} color={H.colors.board} lit roughness={0.25} castShadow />
          <mesh position={[wallX - B.thick - 0.012, by, rz]} rotation={turn}>
            <ringGeometry args={[B.height * 0.5 - 0.05, B.height * 0.5, 4, 1, Math.PI / 4]} />
            <meshBasicMaterial color={H.colors.frame} side={DoubleSide} transparent toneMapped={false} />
          </mesh>
          <mesh position={[wallX - B.thick - 0.012, ry + 0.17, rz]} rotation={turn}>
            <ringGeometry args={[0.15, 0.19, 4, 1, Math.PI / 4]} />
            <meshBasicMaterial color={H.colors.target} side={DoubleSide} transparent toneMapped={false} />
          </mesh>
          <Block size={[wallX - B.thick - rx - H.rimRadius, 0.05, 0.12]} position={[(rx + H.rimRadius + wallX - B.thick) / 2, ry - 0.02, rz]} color={H.colors.frame} lit />
          <mesh position={[rx, ry, rz]} rotation={[HALF_PI, 0, 0]} castShadow>
            <torusGeometry args={[H.rimRadius, H.tube, 12, 48]} />
            <meshStandardMaterial color={H.colors.rim} roughness={0.35} transparent />
          </mesh>
          <mesh position={[rx, ry - H.netDepth / 2, rz]}>
            <cylinderGeometry args={[H.rimRadius, H.rimRadius * 0.62, H.netDepth, 16, 3, true]} />
            <meshBasicMaterial color={H.colors.net} wireframe transparent opacity={0.85} toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  )
}

// SHOTS made / attempted, bound to the gym store.
export function Scoreboard() {
  const B = G.scoreboard
  const face = useMemo(scoreboardFace, [])
  useEffect(() => {
    const draw = () => {
      const s = useGym.getState()
      face.draw(s.makes, s.attempts)
    }
    draw()
    document.fonts?.load(`800 64px ${B.font}`).then(draw, () => {})
    const unsubscribe = useGym.subscribe(draw)
    return () => {
      unsubscribe()
      face.tex.dispose()
    }
  }, [face, B.font])
  const [w, h] = B.size
  const y = FLOOR_Y + B.center[1]
  const z = S.backZ
  return (
    <group name="gym-scoreboard" position={[B.center[0], y, z]}>
      <Block size={[w + 0.14, h + 0.14, B.depth]} position={[0, 0, B.depth / 2]} color={G.stripes[0].color} />
      <Plate size={[w, h]} position={[0, 0, B.depth + 0.003]} color="#ffffff" map={face.tex} />
    </group>
  )
}

// One basketball: an orange sphere with two seams.
function Basketball({ position }: { position: Vec3 }) {
  const R = G.rack
  return (
    <group position={position}>
      <mesh castShadow>
        <sphereGeometry args={[R.ballRadius, 28, 20]} />
        <meshStandardMaterial color={R.ball} roughness={0.55} transparent />
      </mesh>
      {[0, HALF_PI].map((a) => (
        <mesh key={a} rotation={[a === 0 ? HALF_PI : 0, a, 0]}>
          <torusGeometry args={[R.ballRadius * 1.002, R.ballRadius * 0.035, 6, 40]} />
          <meshStandardMaterial color={R.seam} roughness={0.7} transparent />
        </mesh>
      ))}
    </group>
  )
}

// A low rack against the back wall with a few balls on its rails.
export function BallRack() {
  const R = G.rack
  const [x, y0, z] = R.position
  const leg = 0.05
  const pitch = R.length / R.balls
  return (
    <group name="gym-rack" position={[x, y0, z]}>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Block key={`${sx}${sz}`} size={[leg, R.height, leg]} position={[(sx * R.length) / 2, R.height / 2, (sz * R.depth) / 2]} color={R.frame} lit castShadow />
        )),
      )}
      {[-1, 1].map((sz) => (
        <Block key={sz} size={[R.length + leg, leg, leg]} position={[0, R.height, (sz * R.depth) / 2]} color={R.frame} lit />
      ))}
      <Block size={[R.length + leg, leg, R.depth]} position={[0, R.height * 0.35, 0]} color={R.frame} lit />
      {Array.from({ length: R.balls }, (_, i) => (
        <Basketball key={i} position={[-R.length / 2 + pitch * (i + 0.5), R.height + R.ballRadius * 0.62, 0]} />
      ))}
    </group>
  )
}
