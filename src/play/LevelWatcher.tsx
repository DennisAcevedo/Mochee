import { useEffect } from 'react'
import { useDirector } from '../state/director'
import { levelTitle, unlocksBetween, useProgress } from '../state/progress'
import { PLAY } from './config'
import { usePlay } from './playStore'
import { useLessonMode } from './useLessonMode'

// Celebrates every level-up exactly once: the levelup clip, the big burst and
// the banner (new level + what it unlocked). Mount it once, anywhere in the
// React tree; it renders nothing. Level-ups that happened before it mounted
// (or that were restored from storage) are not replayed. It also keeps the
// guided lesson quiet in play mode (useLessonMode), since the lesson page
// mounts it for as long as the lesson is open.
export function LevelWatcher() {
  useLessonMode()

  useEffect(() => {
    let timer = 0
    const unsubscribe = useProgress.subscribe((s, prev) => {
      if (s.levelUpId === prev.levelUpId || s.levelUpId === 0) return
      const { level, levelFrom } = s
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const d = useDirector.getState()
        d.play('levelup')
        d.burst('levelup')
        usePlay.getState().showBanner({ level, title: levelTitle(level), unlocks: unlocksBetween(levelFrom, level) })
      }, PLAY.levelUpDelayMs)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])

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
