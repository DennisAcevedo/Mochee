import { PerspectiveCamera } from '@react-three/drei'
import { useLayoutEffect, useRef } from 'react'
import type { PerspectiveCamera as Camera } from 'three'
import { CAMERA } from '../animation/config'

interface Props {
  // Shifts the picture down by this share of the view's height, as if the
  // view extended past its bottom edge (the export's `top:38%; bottom:-38%`),
  // without drawing outside the card.
  offsetY?: number
}

// tutor-3d.js's camera, as the default camera of a drei <View>.
export function ViewCamera({ offsetY = 0 }: Props) {
  const ref = useRef<Camera>(null)

  useLayoutEffect(() => {
    const cam = ref.current
    if (!cam) return
    cam.lookAt(...CAMERA.lookAt)
    if (offsetY) cam.setViewOffset(1, 1, 0, -offsetY, 1, 1)
    else cam.clearViewOffset()
  }, [offsetY])

  return <PerspectiveCamera ref={ref} makeDefault fov={CAMERA.fov} near={CAMERA.near} far={CAMERA.far} position={CAMERA.position} />
}
