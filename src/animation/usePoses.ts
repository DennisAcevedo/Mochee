import { useEffect } from 'react'
import type { Pose } from './config'
import { subscribeCharacter, type Command } from '../character/controller'
import type { RigState } from '../character/rig'

function setPose(state: RigState, next: Pose) {
  // Entering celebrate triggers the one-time 360° spin.
  if (next === 'celebrate' && state.pose !== 'celebrate') state.spinT = 0
  state.pose = next
}

// Writes pose / speaking / expression into the rig state. tutor-3d.js blends
// everything inside its tick, so there are no tweens here; the tick damps
// toward whatever these values say.
//
// With `controlled` set (Home cards, the Create preview) the props drive the
// character. Otherwise it follows the shared controller (the lesson).
export function usePoses(state: RigState, controlled?: { pose: Pose; speaking: boolean }) {
  const isControlled = !!controlled
  useEffect(() => {
    if (isControlled) return
    const apply = (cmd: Command) => {
      if (cmd.kind === 'expression') {
        state.happyOverride = cmd.name === 'happy'
        return
      }
      if (cmd.name === 'speak') {
        state.speaking = cmd.params.on
        return
      }
      setPose(state, cmd.params.pose)
    }
    return subscribeCharacter(apply)
  }, [state, isControlled])

  const pose = controlled?.pose
  const speaking = controlled?.speaking
  useEffect(() => {
    if (pose === undefined) return
    setPose(state, pose)
    state.speaking = !!speaking
  }, [state, pose, speaking])
}
