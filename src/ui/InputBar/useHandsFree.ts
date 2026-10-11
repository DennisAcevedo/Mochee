import { useEffect, useState } from 'react'
import { useTutorStore } from '../../state/store'
import { useMode } from '../../state/mode'
import { useWalkthrough } from '../../lesson/runner'
import { cancelRecognition } from '../../lesson/speech'
import { handsFreeConstructor, listenHandsFree } from '../../lesson/handsFree'

export function useHandsFree(teaching: boolean) {
  const [enabled, setEnabled] = useState(false)
  const [paused, setPaused] = useState(false)
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(() => !document.hidden)
  const phase = useTutorStore((s) => s.phase)
  const speaking = useTutorStore((s) => s.mic === 'speaking')
  const pending = useTutorStore((s) => s.awaitingReply)
  const study = useMode((s) => s.mode === 'study')
  const playing = useWalkthrough((s) => s.playing)
  const blocked = paused || teaching || typing || !visible || phase !== 'live' || speaking || pending || !study || playing

  useEffect(() => {
    const changed = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', changed)
    return () => document.removeEventListener('visibilitychange', changed)
  }, [])

  useEffect(() => {
    if (!enabled || blocked) return
    const Ctor = handsFreeConstructor()
    if (!Ctor) {
      setError('Hands-free is unavailable in this browser. Try Chrome or Edge, or type your question.')
      setEnabled(false)
      return
    }
    let active = true
    const prefix = useTutorStore.getState().draft.trim()
    const combine = (text: string) => [prefix, text].filter(Boolean).join(' ')
    cancelRecognition()
    useTutorStore.setState({ mic: 'listening' })
    const cancel = listenHandsFree(Ctor, {
      onText: (text) => { if (active) useTutorStore.getState().setDraft(combine(text)) },
      onQuestion: (text) => {
        if (!active) return
        useTutorStore.getState().setDraft(combine(text))
        useTutorStore.getState().sendDraft()
      },
      onError: (message) => { if (active) { setError(message); setEnabled(false) } },
    })
    return () => {
      active = false; cancel()
      if (useTutorStore.getState().mic === 'listening') useTutorStore.setState({ mic: 'idle' })
    }
  }, [enabled, blocked])

  const choose = (handsFree: boolean) => {
    setError(''); setPaused(false)
    cancelRecognition()
    if (useTutorStore.getState().mic === 'listening') useTutorStore.setState({ mic: 'idle' })
    if (handsFree) {
      // Make room for a conversation; the lesson resumes with its Play button.
      useWalkthrough.getState().pause()
      useWalkthrough.getState().setMuted(false)
    }
    setEnabled(handsFree)
  }
  return { enabled, paused, blocked, error, choose, setTyping, togglePause: () => setPaused((p) => !p) }
}
