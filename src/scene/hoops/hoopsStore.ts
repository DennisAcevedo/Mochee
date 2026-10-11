import { create } from 'zustand'
import { useGym } from '../worlds/gymStore'
import type { MoveKind } from './config'
import type { Outcome } from './shot'

// The Play tab's ball moves: which move runs, which one the HUD asked for, and
// the jump-shot tally (makes / attempts). BallProp reads `request` and runs
// it; the HUD's score chip reads the tally. Every shot is mirrored into the
// gym's scoreboard store (src/scene/worlds/gymStore.ts) so the 3D SHOTS board
// and the chip always agree. Lives for the session, like the other play stores.

export interface HoopsState {
  move: MoveKind | null // the move in progress
  request: { kind: MoveKind; id: number } | null // asked for, not yet started
  attempts: number
  makes: number
  lastOutcome: Outcome | null
  lastShotId: number // bumps on every recorded shot

  ask: (kind: MoveKind) => boolean // false while a move runs or waits
  begin: (kind: MoveKind) => void
  finish: () => void
  recordShot: (outcome: Outcome) => void
}

let nextId = 1

export const useHoops = create<HoopsState>((set, get) => ({
  move: null,
  request: null,
  attempts: 0,
  makes: 0,
  lastOutcome: null,
  lastShotId: 0,

  ask: (kind) => {
    const s = get()
    if (s.move || s.request) return false
    set({ request: { kind, id: nextId++ } })
    return true
  },
  begin: (kind) => set({ move: kind, request: null }),
  finish: () => set({ move: null, request: null }),
  recordShot: (outcome) => {
    const made = outcome !== 'rimOut'
    set((s) => ({ attempts: s.attempts + 1, makes: s.makes + (made ? 1 : 0), lastOutcome: outcome, lastShotId: s.lastShotId + 1 }))
    useGym.getState().recordShot(made)
  },
}))
