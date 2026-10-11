import { useEffect, useReducer, useState } from 'react'
import { COIN_COLOR, PLAY, type PlayAction } from '../../play/config'
import { usePlay } from '../../play/playStore'
import { COIN_LABEL, useProgress } from '../../state/progress'

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

export interface CoinToast {
  id: number
  coins: number
  label: string
  color: string
}

let toastSeq = 0

// One floating "+N coins" toast per award (the lesson, the drawer's quiz, the boss).
export function useCoinToasts(): CoinToast[] {
  const [toasts, setToasts] = useState<CoinToast[]>([])
  useEffect(() => {
    const timers = new Set<number>()
    const unsubscribe = useProgress.subscribe((s, prev) => {
      const a = s.lastAward
      if (!a || a.id === prev.lastAward?.id) return
      const toast = { id: ++toastSeq, coins: a.coins, label: COIN_LABEL[a.reason], color: COIN_COLOR[a.reason] }
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
