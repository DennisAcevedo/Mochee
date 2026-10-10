import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Color, Object3D, type Group, type InstancedMesh } from 'three'
import { PALETTE } from '../layout3d'
import { EVOLUTION } from './config'

// Pop-in for the room's new items: a damped spring on scale, and a small
// sparkle burst that flies out from the item and fades. Both run from the
// frame clock, so nothing re-renders while they play.

const P = EVOLUTION.pop

// 0 at t = 0, overshoots past 1, settles at 1.
export function springIn(t: number): number {
  if (t <= 0) return 0
  return 1 - Math.exp(-P.damping * P.stiffness * t) * Math.cos(P.stiffness * t)
}

// Scales its children in with springIn, starting `delay` seconds after mount.
export function PopIn({ delay = 0, children, position }: { delay?: number; children: ReactNode; position?: [number, number, number] }) {
  const ref = useRef<Group>(null)
  const born = useRef<number | null>(null)
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    if (born.current === null) born.current = clock.elapsedTime
    const s = springIn(clock.elapsedTime - born.current - delay)
    g.scale.setScalar(Math.max(s, 0.0001))
  })
  return (
    <group ref={ref} position={position} scale={0.0001}>
      {children}
    </group>
  )
}

const SPARK_COLORS = [PALETTE.sun, PALETTE.violet, PALETTE.teal, PALETTE.coral, PALETTE.pink]
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

// A one-off sparkle burst at the parent's origin.
export function SparkleBurst({ delay = 0 }: { delay?: number }) {
  const ref = useRef<InstancedMesh>(null)
  const born = useRef<number | null>(null)
  const dirs = useRef(
    Array.from({ length: P.sparkles }, (_, i) => {
      // Even spread over a sphere, biased upward and toward the camera.
      const y = 1 - (i / (P.sparkles - 1)) * 1.4
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const a = i * GOLDEN
      return [Math.cos(a) * r, y + 0.35, Math.abs(Math.sin(a) * r) + 0.2] as const
    }),
  )
  const tmp = useRef(new Object3D())

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const c = new Color()
    for (let i = 0; i < P.sparkles; i++) mesh.setColorAt(i, c.set(SPARK_COLORS[i % SPARK_COLORS.length]))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    if (born.current === null) born.current = clock.elapsedTime
    const t = clock.elapsedTime - born.current - delay
    const life = Math.min(Math.max(t / P.sparkleLife, 0), 1)
    mesh.visible = t > 0 && life < 1
    if (!mesh.visible) return
    const o = tmp.current
    dirs.current.forEach(([x, y, z], i) => {
      const d = P.sparkleSpeed * t * (1 - life * 0.45)
      o.position.set(x * d, y * d - 0.9 * t * t, z * d)
      o.rotation.set(t * 6 + i, t * 4, 0)
      o.scale.setScalar(P.sparkleSize * (1 - life) * (i % 3 === 0 ? 1.4 : 1))
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, P.sparkles]} frustumCulled={false} visible={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
