import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Vector3 } from 'three'
import { useDirector, type FxEvent } from '../../state/director'
import { anchors } from '../anchors'
import { FX } from './config'
import { FxSystem } from './fxSystem'

// Renders every director.fx event as a burst at its anchor (the tutor's head,
// or a window centre), then clears the event once its particles are done.
// Reads the store inside the frame loop, so bursts never re-render React.
// A repeat of the same kind at the same anchor within FX.dedupeSeconds is
// skipped (an action and the clip it plays often fire the same burst).

const origin = new Vector3()

function originOf(event: FxEvent, out: Vector3): Vector3 {
  if (event.at !== 'tutor') return out.copy(anchors[event.at]).add(new Vector3(...FX.origin.window))
  const offset = event.kind === 'hearts' ? FX.origin.face : FX.origin.tutor
  return out.copy(anchors.tutor).add(new Vector3(...offset))
}

export function FxLayer() {
  const system = useMemo(() => new FxSystem(), [])
  useEffect(() => () => system.dispose(), [system])

  // Event id -> seconds left before it is cleared from the store.
  const pending = useMemo(() => new Map<number, number>(), [])
  // `${kind}@${target}` -> clock time it last played.
  const lastPlayed = useMemo(() => new Map<string, number>(), [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, FX.maxDt)
    const { fx, clearFx } = useDirector.getState()

    const now = state.clock.elapsedTime
    for (const event of fx) {
      if (pending.has(event.id)) continue
      pending.set(event.id, FX.holdSeconds[event.kind])
      const key = `${event.kind}@${event.at}`
      if (now - (lastPlayed.get(key) ?? -Infinity) < FX.dedupeSeconds) continue
      lastPlayed.set(key, now)
      system.emit(event.kind, originOf(event, origin))
    }
    for (const [id, left] of pending) {
      const next = left - dt
      if (next > 0) {
        pending.set(id, next)
        continue
      }
      pending.delete(id)
      clearFx(id)
    }

    system.update(dt, state.camera.quaternion)
  })

  return <primitive object={system.group} />
}
