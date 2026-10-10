import { useEffect, useReducer, useState } from 'react'
import { PLAY, XP_COLOR, type PlayAction } from '../../play/config'
import { usePlay } from '../../play/playStore'
import { XP_LABEL, useProgress } from '../../state/progress'

// Whether `action` is cooling down, re-rendering once when it is ready again.
export function useCooldown(action: PlayAction) {
  const until = usePlay((s) => s.cooldownUntil[action])
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const left = until - performance.now()
  useEffect(() => {
    if (left <= 0) return
    const t = window.setTimeout(tick, left + 16)
    return () => window.clearTimeout(t)
  }, [until, left])
  return { cooling: left > 0, until, ms: PLAY.cooldownMs[action] }
}

export interface XpToast {
  id: number
  xp: number
  label: string
  color: string
}

let toastSeq = 0

// One floating "+N XP" toast per award, from any source (play or lesson).
export function useXpToasts(): XpToast[] {
  const [toasts, setToasts] = useState<XpToast[]>([])
  useEffect(() => {
    const timers = new Set<number>()
    const unsubscribe = useProgress.subscribe((s, prev) => {
      const a = s.lastAward
      if (!a || a.id === prev.lastAward?.id) return
      const toast = { id: ++toastSeq, xp: a.xp, label: XP_LABEL[a.reason], color: XP_COLOR[a.reason] }
      setToasts((list) => [...list.slice(-(PLAY.maxToasts - 1)), toast])
      const t = window.setTimeout(() => {
        timers.delete(t)
        setToasts((list) => list.filter((x) => x.id !== toast.id))
      }, PLAY.toastMs)
      timers.add(t)
    })
    return () => {
      unsubscribe()
      for (const t of timers) window.clearTimeout(t)
    }
  }, [])
  return toasts
}
