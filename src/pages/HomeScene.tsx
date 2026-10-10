import { View } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, type CSSProperties } from 'react'
import { ACESFilmicToneMapping } from 'three'
import type { Pose } from '../animation/config'
import { RENDER } from '../animation/config'
import type { FrameRect } from '../animation/useLook'
import { Character } from '../character/Character'
import type { TutorLook } from '../character/look'
import { Lights } from '../scene/Lights'
import { ViewCamera } from '../scene/ViewCamera'

// Every card's character draws through ONE fixed canvas: each card holds an
// empty <View> div, and drei scissors that rect out of the shared canvas.

// Views render with autoClear off; wipe the canvas once per frame before them.
function ClearEachFrame() {
  useFrame(({ gl }) => {
    gl.setScissorTest(false)
    gl.clear(true, true, true)
  }, 0.5)
  return null
}

export function HomeCanvas({ className }: { className: string }) {
  return (
    <Canvas
      className={className}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}
      dpr={[1, RENDER.maxDpr]}
      gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: RENDER.exposure }}
    >
      <ClearEachFrame />
      <View.Port />
    </Canvas>
  )
}

interface CardCharacterProps {
  className: string
  style?: CSSProperties
  pose: Pose
  look?: TutorLook
  active: boolean // the hovered card ticks every frame; the rest at LITE.tickHz
  size: number
  roam: number
  rleft: number
  rright: number
  offsetY?: number
}

export function CardCharacter({ className, style, pose, look, active, size, roam, rleft, rright, offsetY }: CardCharacterProps) {
  const el = useRef<HTMLDivElement>(null)
  const frame = (): FrameRect | null => {
    const r = el.current?.getBoundingClientRect()
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
  }
  return (
    <View ref={el} className={className} style={style}>
      <ViewCamera offsetY={offsetY} />
      <Lights shadows={false} />
      <Character pose={pose} look={look} size={size} roam={roam} rleft={rleft} rright={rright} frame={frame} lite={!active} />
    </View>
  )
}
