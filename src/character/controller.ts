import type { Expression, Pose } from '../animation/config'

// The only public surface for driving the character.
// UI and state never touch the rig directly; they call these two functions.

export interface ActionParams {
  pose: { pose: Pose }
  speak: { on: boolean }
}

export type Command =
  | { kind: 'action'; name: 'pose'; params: ActionParams['pose'] }
  | { kind: 'action'; name: 'speak'; params: ActionParams['speak'] }
  | { kind: 'expression'; name: Expression }

type Listener = (command: Command) => void

const listeners = new Set<Listener>()
const current: { pose: Pose; speaking: boolean; expression: Expression } = {
  pose: 'explain',
  speaking: false,
  expression: 'neutral',
}

function emit(command: Command) {
  listeners.forEach((l) => l(command))
}

export function performAction<K extends keyof ActionParams>(name: K, params: ActionParams[K]): void {
  if (name === 'pose') {
    const p = params as ActionParams['pose']
    current.pose = p.pose
    emit({ kind: 'action', name: 'pose', params: p })
  } else if (name === 'speak') {
    const p = params as ActionParams['speak']
    current.speaking = p.on
    emit({ kind: 'action', name: 'speak', params: p })
  }
}

export function setExpression(name: Expression): void {
  current.expression = name
  emit({ kind: 'expression', name })
}

// Subscribers get a replay of the current state so a late-mounting rig syncs up.
export function subscribeCharacter(listener: Listener): () => void {
  listeners.add(listener)
  listener({ kind: 'action', name: 'pose', params: { pose: current.pose } })
  listener({ kind: 'action', name: 'speak', params: { on: current.speaking } })
  listener({ kind: 'expression', name: current.expression })
  return () => {
    listeners.delete(listener)
  }
}
