import { View } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ACESFilmicToneMapping, MeshBasicMaterial } from 'three'
import { RENDER } from '../animation/config'
import { BlenderTutorSafe } from '../character/blender/BlenderTutorSafe'
import { radialTexture } from '../character/geometry'
import type { TutorLook } from '../character/look'
import type { Gesture, LoopClip } from '../state/director'
import { FLOOR_Y } from '../scene/layout3d'
import { Lights } from '../scene/Lights'
import { ViewCamera } from '../scene/ViewCamera'

// Every card's tutor draws through ONE fixed canvas: each card holds an empty
// <View> div, and drei scissors that rect out of the shared canvas. The cards
// show the Blender tutor (the same model as the lesson) in standalone mode.

const CARD = {
  scale: 1.3, // he reads small at room scale; this matches the old card character's size
  lift: 0.55, // world units: raises him off the bottom of the card art
  waveEveryMs: 2600, // a hovered card waves again this often
  shadow: { size: 1.5, y: 0.002 },
} as const

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

// Soft contact shadow under his feet (the card has no room floor to catch one).
export function CardShadow() {
  const material = useMemo(
    () => new MeshBasicMaterial({ map: radialTexture('rgba(70,64,58,0.45)', 'rgba(70,64,58,0)'), transparent: true, depthWrite: false, toneMapped: false }),
    [],
  )
  useEffect(
    () => () => {
      material.map?.dispose()
      material.dispose()
    },
    [material],
  )
  return (
    <mesh material={material} rotation-x={-Math.PI / 2} position-y={FLOOR_Y + CARD.shadow.y}>
      <planeGeometry args={[CARD.shadow.size, CARD.shadow.size]} />
    </mesh>
  )
}

interface CardCharacterProps {
  className: string
  style?: CSSProperties
  awake: boolean // false: sleeping; true: awake and waving
  look?: TutorLook // cap colour and accessory
  offsetY?: number // see ViewCamera
}

export function CardCharacter({ className, style, awake, look, offsetY }: CardCharacterProps) {
  // Waving while awake: a fresh wave one-shot every few seconds.
  const [gesture, setGesture] = useState<Gesture | null>(null)
  useEffect(() => {
    if (!awake) {
      setGesture(null)
      return
    }
    let n = 0
    const wave = () => setGesture({ id: Date.now() * 10 + (n++ % 10), clip: 'wave' })
    wave()
    const t = setInterval(wave, CARD.waveEveryMs)
    return () => clearInterval(t)
  }, [awake])

  const loop: LoopClip = awake ? 'idle' : 'sleep'
  const control = useMemo(() => ({ loop, gesture }), [loop, gesture])

  return (
    <View className={className} style={style}>
      <ViewCamera offsetY={offsetY} />
      <Lights shadows={false} />
      <group position-y={CARD.lift} scale={CARD.scale}>
        <CardShadow />
        <Suspense fallback={null}>
          <BlenderTutorSafe
            standalone
            control={control}
            capColor={look?.cap || undefined}
            accessory={look?.accessory}
            accColor={look?.accColor}
          />
        </Suspense>
      </group>
    </View>
  )
}
