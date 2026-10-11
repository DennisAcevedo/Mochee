import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { Group } from 'three'
import { useMode } from '../../state/mode'
import { ease, setFade } from './fade'
import { PlayWorld } from './PlayWorld'
import { StudyWorld } from './StudyWorld'
import { WORLD, type HoopDraw, type WorldId } from './worldConfig'

// The full-screen backdrop of the lesson stage: the Study classroom in study
// mode, the Play gym in play and celebrate mode, cross-faded (fade.ts) over
// WORLD.fade.ms when the mode flips. Flipping back mid-fade reverses it from
// where it is.

interface Shown {
  current: WorldId
  previous: WorldId | null
  since: number // performance.now() when the current fade started (at its own progress 0)
}

const worldOf = (mode: string): WorldId => (mode === 'study' ? 'study' : 'play')
const now = () => performance.now()

export interface WorldSwitchProps {
  hoop?: HoopDraw // passed to PlayWorld (see WORLD.play.hoop)
}

export function WorldSwitch({ hoop }: WorldSwitchProps) {
  const target = useMode((s) => worldOf(s.mode))
  const [shown, setShown] = useState<Shown>(() => ({ current: target, previous: null, since: 0 }))
  const groups = { study: useRef<Group>(null), play: useRef<Group>(null) }
  const progress = useRef(1)

  // A flip starts a fade; a flip back while one runs reverses it from the same picture
  // (the fade is symmetric, so progress x shown one way is 1 - x the other).
  if (target !== shown.current) {
    const reverse = shown.previous === target
    const x = reverse ? 1 - progress.current : 0
    setShown({ current: target, previous: shown.current, since: now() - x * WORLD.fade.ms })
  }

  // The incoming world keeps its fade settings (it wins the shared shell's
  // depth test) until the outgoing one has unmounted, then settles.
  const settle = useRef(false)
  useFrame(() => {
    const { current, previous, since } = shown
    const incoming = groups[current].current
    if (!previous) {
      if (settle.current && incoming) setFade(incoming, 'rest', 1)
      settle.current = false
      return
    }
    const x = Math.min(1, (now() - since) / WORLD.fade.ms)
    progress.current = x
    const k = ease(x)
    const outgoing = groups[previous].current
    if (incoming) setFade(incoming, 'in', k)
    if (outgoing) setFade(outgoing, 'out', k)
    if (x >= 1) {
      settle.current = true
      setShown((s) => (s.previous ? { ...s, previous: null } : s))
    }
  })

  const on = (id: WorldId) => shown.current === id || shown.previous === id
  return (
    <group name="stage-worlds">
      {on('study') && (
        <group ref={groups.study}>
          <StudyWorld />
        </group>
      )}
      {on('play') && (
        <group ref={groups.play}>
          <PlayWorld hoop={hoop} />
        </group>
      )}
    </group>
  )
}
