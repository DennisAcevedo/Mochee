import { useCallback, useEffect, useRef, useState } from 'react'
import { speak, speakingText, stopSpeaking } from '../lesson/speech'
import { useDirector } from '../state/director'
import { stripMarks } from '../lesson/markup'

export function useTeachBackNarration(active: boolean, enabled: boolean, topicId?: string) {
  const [speaking, setSpeaking] = useState(false)
  const owned = useRef<string | null>(null)
  const generation = useRef(0)
  const stop = useCallback(() => {
    generation.current++
    if (owned.current && speakingText() === owned.current) stopSpeaking()
    if (owned.current && useDirector.getState().caption === owned.current) useDirector.getState().setCaption(null)
    owned.current = null; setSpeaking(false)
  }, [])
  const say = useCallback((text: string) => {
    stop()
    if (!active || !enabled) return
    const line = stripMarks(text).replace(/\s+/g, ' ').trim()
    const token = generation.current
    owned.current = line
    useDirector.getState().setCaption(line)
    setSpeaking(true)
    speak(line, () => {
      if (generation.current !== token) return
      if (useDirector.getState().caption === line) useDirector.getState().setCaption(null)
      owned.current = null; setSpeaking(false)
    }, undefined, { enabled: true })
  }, [active, enabled, stop])
  useEffect(() => { if (!active || !enabled) stop(); return stop }, [active, enabled, topicId, stop])
  return { speaking, say, stop }
}
