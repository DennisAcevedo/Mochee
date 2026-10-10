import { useEffect, useLayoutEffect } from 'react'
import { useTutorStore, type SessionConfig } from '../state/store'
import { disposeIntro, playIntro, replayIntro, showStartScreen, skipIntro } from './intro'

const isField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

// Owns the intro's lifecycle and keys: Enter/Space starts, Esc skips,
// R (dev builds only) replays from the start screen. Renders nothing.
// Every visit to a lesson starts a fresh session on the start screen.
export function IntroDirector({ session }: { session: SessionConfig }) {
  // Before first paint, so the lesson UI never flashes.
  useLayoutEffect(() => {
    useTutorStore.getState().resetSession(session)
    showStartScreen()
    return disposeIntro
  }, [session])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const phase = useTutorStore.getState().phase
      if (phase === 'start' && (e.key === 'Enter' || e.key === ' ')) {
        // A focused button (the start button included) handles these itself.
        if (isField(e.target) || (e.target instanceof HTMLElement && e.target.tagName === 'BUTTON')) return
        e.preventDefault()
        playIntro()
      } else if (phase === 'intro' && e.key === 'Escape') {
        skipIntro()
      } else if (
        import.meta.env.DEV &&
        (e.key === 'r' || e.key === 'R') &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isField(e.target)
      ) {
        replayIntro()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}
