// DOM elements the intro animates, registered by the components that own them.

export type IntroTargetName =
  | 'stage'
  | 'scene'
  | 'backdrop'
  | 'slot'
  | 'overlay'
  | 'title'
  | 'subtitle'
  | 'zs'
  | 'startCta'
  | 'startButton'
  | 'topBar'
  | 'board'
  | 'sidebar'
  | 'inputBar'
  | 'dock' // walkthrough bar + ask box

export const introTargets: Partial<Record<IntroTargetName, HTMLElement>> = {}

const refs = new Map<IntroTargetName, (el: HTMLElement | null) => void>()

// Stable callback ref per name, so React doesn't detach and reattach every render.
export function introRef(name: IntroTargetName) {
  let ref = refs.get(name)
  if (!ref) {
    ref = (el) => {
      if (el) introTargets[name] = el
      else if (introTargets[name]) delete introTargets[name]
    }
    refs.set(name, ref)
  }
  return ref
}
