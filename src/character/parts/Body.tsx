import { useEffect, useMemo, type ReactNode, type RefObject } from 'react'
import type { Group } from 'three'
import { buildBodyGeometry } from '../geometry'
import type { Materials } from '../materials'

interface Props {
  groupRef: RefObject<Group | null>
  materials: Materials
  children?: ReactNode
}

// The gumdrop body. The face and cap are children so they share its squash.
export function Body({ groupRef, materials, children }: Props) {
  const geometry = useMemo(buildBodyGeometry, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <group ref={groupRef} name="body">
      <mesh geometry={geometry} material={materials.white} castShadow receiveShadow />
      {children}
    </group>
  )
}
