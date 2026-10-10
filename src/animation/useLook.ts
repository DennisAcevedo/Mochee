import { useEffect, useRef } from 'react'
import type { RigState } from '../character/rig'
import { sceneFrame } from '../scene/sceneRig'
import { LOOK } from './config'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export interface FrameRect {
  x: number
  y: number
  w: number
  h: number
}

// Where the character's "screen" is in viewport px. The lesson uses the
// camera rig's frame; Home cards and the Create preview pass their own box.
export type FrameSource = () => FrameRect | null

const lessonFrame: FrameSource = () => sceneFrame

// Pointer tracking from tutor-3d.js: normalized coords in [-1.5, 1.5] of the
// frame, y positive downward. The tick damps `look.x/y` toward these targets.
export function useLook(state: RigState, frame: FrameSource = lessonFrame) {
  const source = useRef(frame)
  source.current = frame

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const f = source.current()
      if (!f || !f.w || !f.h) return
      state.look.tx = clamp(((e.clientX - f.x) / f.w) * 2 - 1, -LOOK.maxNorm, LOOK.maxNorm)
      state.look.ty = clamp(((e.clientY - f.y) / f.h) * 2 - 1, -LOOK.maxNorm, LOOK.maxNorm)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [state])
}
