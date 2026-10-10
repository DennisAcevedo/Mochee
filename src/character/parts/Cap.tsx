import { useEffect, useMemo, type ReactNode, type RefObject } from 'react'
import type { Group } from 'three'
import { CAP } from '../../animation/config'
import { buildBoardGeometry, buildSkullGeometry, buildSparkleGeometry } from '../geometry'
import { capColors } from '../look'
import type { Materials } from '../materials'

interface Props {
  capRef: RefObject<Group | null>
  tasselRef: RefObject<Group | null>
  materials: Materials
  color: string // '' = default indigo gradient
  children?: ReactNode // cap-mounted accessories (the leaf)
}

// Graduation cap: tinted skull and board, button, cord, swinging tassel, pearl sparkle.
export function Cap({ capRef, tasselRef, materials, color, children }: Props) {
  const tints = useMemo(() => capColors(color), [color])
  const skull = useMemo(() => buildSkullGeometry(...tints.skull), [tints])
  const board = useMemo(() => buildBoardGeometry(...tints.board), [tints])
  const spark = useMemo(buildSparkleGeometry, [])
  useEffect(() => () => skull.dispose(), [skull])
  useEffect(() => () => board.dispose(), [board])
  useEffect(() => () => spark.dispose(), [spark])

  return (
    <group ref={capRef} name="cap" position={CAP.position} rotation={CAP.rotation}>
      <mesh geometry={skull} material={materials.cap} position-y={0.77} castShadow />
      <mesh geometry={board} material={materials.cap} position-y={0.91} rotation-y={Math.PI / 4} castShadow />

      <mesh material={materials.gold} position-y={0.945} scale-y={0.6}>
        <sphereGeometry args={[0.045, 20, 12]} />
      </mesh>
      <mesh material={materials.gold} rotation-z={Math.PI / 2} position={[0.26, 0.945, 0]}>
        <cylinderGeometry args={[0.011, 0.011, 0.52, 8]} />
      </mesh>

      <group ref={tasselRef} name="tassel" position={[0.52, 0.945, 0]}>
        <mesh material={materials.gold} position-y={-0.13}>
          <cylinderGeometry args={[0.011, 0.011, 0.26, 8]} />
        </mesh>
        <mesh material={materials.gold} position-y={-0.32}>
          <cylinderGeometry args={[0.03, 0.05, 0.13, 16]} />
        </mesh>
      </group>

      <mesh geometry={spark} material={materials.spark} position={[0, 0.77, 0.5]} rotation-x={-0.1} />
      {children}
    </group>
  )
}
