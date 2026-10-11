import { useEffect } from 'react'
import { useDirector } from '../state/director'
import { shopItem, useProgress } from '../state/progress'
import { PLAY } from './config'
import { usePlay } from './playStore'
import { usePlayGreeting } from './playGreeting'
import { useLessonMode } from './useLessonMode'

// Celebrates every purchase exactly once: his 'equip' clip, a sparkle burst
// and the "Unlocked: ..." banner. Mount it once, anywhere in the React tree;
// it renders nothing. Purchases restored from storage are not replayed. It
// also keeps the guided lesson quiet in play mode (useLessonMode), since the
// lesson page mounts it for as long as the lesson is open, and has him
// welcome the student into the play room (usePlayGreeting).
export function UnlockWatcher() {
  useLessonMode()
  usePlayGreeting()

  useEffect(
    () =>
      useProgress.subscribe((s, prev) => {
        const p = s.lastPurchase
        if (!p || p.id === prev.lastPurchase?.id) return
        const d = useDirector.getState()
        d.play('equip')
        d.burst('sparkles')
        usePlay.getState().showBanner({ item: shopItem(p.item) })
      }),
    [],
  )

  // The banner hides itself after a while.
  const bannerId = usePlay((s) => s.banner?.id)
  useEffect(() => {
    if (bannerId === undefined) return
    const t = window.setTimeout(() => {
      if (usePlay.getState().banner?.id === bannerId) usePlay.getState().hideBanner()
    }, PLAY.bannerMs)
    return () => window.clearTimeout(t)
  }, [bannerId])

  return null
}
