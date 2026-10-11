import { useDirector } from '../state/director'
import { GROWTH } from './config'

// A topic just got mastered: a cheer, a burst and "I mastered …!" for a
// moment. The trophy for it appears on the shelf (RoomEvolution).

let ownCaption: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined

export function celebrateMastery(topicTitle: string) {
  const d = useDirector.getState()
  d.play(GROWTH.celebrate.clip)
  d.burst(GROWTH.celebrate.fx)
  const line = `I mastered **${topicTitle}**!`
  ownCaption = line
  d.setCaption(line)
  clearTimeout(timer)
  timer = setTimeout(() => {
    // Only if nothing else has taken the caption since.
    if (useDirector.getState().caption === ownCaption) useDirector.getState().setCaption(null)
    ownCaption = null
  }, GROWTH.celebrate.captionMs)
}
