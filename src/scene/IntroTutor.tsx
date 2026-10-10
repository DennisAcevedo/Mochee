import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Matrix4, type Group } from 'three'
import { INTRO } from '../animation/config'
import { intro } from '../animation/introState'
import { BlenderTutorSafe } from '../character/blender/BlenderTutorSafe'
import type { TutorLook } from '../character/look'
import type { Gesture, LoopClip } from '../state/director'
import { useTutorStore } from '../state/store'

// The Blender tutor on the start screen and through the intro's wake, spin and
// launch. The classic character still runs there as a hidden ghost: its tick
// owns the start-screen framing and the intro's hop, spin and launch. This
// follows the ghost's root every frame, so that motion is unchanged, while the
// GLB clips do the acting: asleep, then the wake one-shot when the intro wakes him.

const FOLLOW = {
  bodyY: 1.0, // body centre above the GLB origin (tutor.manifest.json bodyCenterY); the ghost's root sits at its body centre
} as const

interface Props {
  rootRef: RefObject<Group | null> // the ghost character's root
  look: TutorLook
}

export function IntroTutor({ rootRef, look }: Props) {
  const asleep = useTutorStore((s) => s.introPose === 'sleep')
  const [wakeId, setWakeId] = useState(0)
  const wasAsleep = useRef(asleep)
  useEffect(() => {
    if (wasAsleep.current && !asleep) setWakeId((n) => n + 1)
    wasAsleep.current = asleep
  }, [asleep])
  const control = useMemo(() => {
    const loop: LoopClip = asleep ? 'sleep' : 'idle'
    const gesture: Gesture | null = wakeId ? { id: wakeId, clip: 'wake' } : null
    return { loop, gesture }
  }, [asleep, wakeId])

  const follow = useRef<Group>(null)
  const m = useMemo(() => ({ offset: new Matrix4().makeTranslation(0, -FOLLOW.bodyY, 0), squash: new Matrix4(), parentInv: new Matrix4() }), [])

  useFrame(() => {
    const root = rootRef.current
    const g = follow.current
    if (!root || !g) return
    // The squash and stretch the ghost puts on its body (useTick): the spin's
    // stretch minus intro.squash. Here it pivots on his feet.
    const sp = INTRO.spin.rise ? intro.out.rise / INTRO.spin.rise : 0
    const ki = INTRO.spin.stretch * sp * sp - intro.squash
    m.squash.makeScale(1 - ki * 0.5, 1 + ki, 1 - ki * 0.5)
    m.parentInv.copy(g.parent?.matrixWorld ?? m.parentInv.identity()).invert()
    g.matrix.copy(m.parentInv).multiply(root.matrixWorld).multiply(m.offset).multiply(m.squash)
    g.matrixWorldNeedsUpdate = true
  })

  return (
    <group ref={follow} matrixAutoUpdate={false}>
      <BlenderTutorSafe
        standalone
        bare
        control={control}
        capColor={look.cap || undefined}
        accessory={look.accessory}
        accColor={look.accColor}
        fallback={null}
      />
    </group>
  )
}
