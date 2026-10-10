import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

// Gemini Guy's XP and level. Playing with him and learning both feed it.
// XP persists in localStorage through a wrapper that swallows every storage
// error, so private windows and blocked site data just start fresh each visit.

export type XpReason = 'poke' | 'highfive' | 'catch' | 'snack' | 'dance' | 'stepDone' | 'quizCorrect' | 'lessonDone'

export const XP_REWARD: Record<XpReason, number> = {
  poke: 5,
  highfive: 10,
  catch: 15,
  snack: 10,
  dance: 10,
  stepDone: 20,
  quizCorrect: 50,
  lessonDone: 100,
}

// Short label for the floating "+N XP" toast, per reason.
export const XP_LABEL: Record<XpReason, string> = {
  poke: 'Tickle!',
  highfive: 'High five!',
  catch: 'Nice catch!',
  snack: 'Yum!',
  dance: 'Dance party!',
  stepDone: 'Step done',
  quizCorrect: 'Correct!',
  lessonDone: 'Lesson complete',
}

// Total XP needed to reach `level` (level 1 needs 0).
export function xpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(60 * (level - 1) ** 1.5)
}

export function levelForXp(xp: number): number {
  let level = 1
  while (xp >= xpForLevel(level + 1)) level++
  return level
}

// Level at which each dance unlocks. The quiz celebration and the dance party
// pick from the unlocked ones. Every dance is open by level 4.
export const DANCE_UNLOCKS = {
  dance_bounce: 1,
  dance_spin: 2,
  dance_shuffle: 2,
  dance_robot: 3,
  dance_wave: 3,
  dance_floss: 3,
  dance_disco: 4,
  dance_twist: 4,
} as const
export type Dance = keyof typeof DANCE_UNLOCKS

export function unlockedDances(level: number): Dance[] {
  return (Object.keys(DANCE_UNLOCKS) as Dance[]).filter((d) => DANCE_UNLOCKS[d] <= level)
}

// Everything a level unlocks, in level order. The HUD lists the next one as a
// goal and the level-up banner announces the new ones.
export type UnlockId = Exclude<Dance, 'dance_bounce'> | 'rainbow_cap' | 'party_lights'

export interface Unlock {
  id: UnlockId
  level: number
  label: string
  blurb: string
}

export const LEVEL_UNLOCKS: readonly Unlock[] = [
  { id: 'dance_spin', level: DANCE_UNLOCKS.dance_spin, label: 'Spin dance', blurb: 'He can twirl on the spot' },
  { id: 'dance_shuffle', level: DANCE_UNLOCKS.dance_shuffle, label: 'Shuffle dance', blurb: 'Side-step shuffle, fists pumping' },
  { id: 'dance_robot', level: DANCE_UNLOCKS.dance_robot, label: 'Robot dance', blurb: 'Beep boop, robot moves' },
  { id: 'dance_wave', level: DANCE_UNLOCKS.dance_wave, label: 'Wave dance', blurb: 'A ripple rolls from hand to hand' },
  { id: 'dance_floss', level: DANCE_UNLOCKS.dance_floss, label: 'Floss dance', blurb: 'Arms whip, hips swing the other way' },
  { id: 'dance_disco', level: DANCE_UNLOCKS.dance_disco, label: 'Disco dance', blurb: 'Point up, point down, disco fever' },
  { id: 'dance_twist', level: DANCE_UNLOCKS.dance_twist, label: 'Twist dance', blurb: 'Twist down low and back up' },
  { id: 'rainbow_cap', level: 4, label: 'Rainbow cap', blurb: 'Recolour his graduation cap' },
  { id: 'party_lights', level: 5, label: 'Party lights', blurb: 'Dance parties light up the room' },
]

export function isUnlocked(id: UnlockId, level: number): boolean {
  return LEVEL_UNLOCKS.some((u) => u.id === id && u.level <= level)
}

// Unlocks gained going from level `from` (exclusive) to `to` (inclusive).
export function unlocksBetween(from: number, to: number): Unlock[] {
  return LEVEL_UNLOCKS.filter((u) => u.level > from && u.level <= to)
}

export function nextUnlock(level: number): Unlock | null {
  return LEVEL_UNLOCKS.find((u) => u.level > level) ?? null
}

// Rank shown under the level badge. Past the end of the list he stays a legend.
const LEVEL_TITLES = ['Rookie', 'Buddy', 'Groover', 'Stylist', 'Party Star', 'Legend'] as const

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(Math.max(level, 1), LEVEL_TITLES.length) - 1]
}

// localStorage that never throws: storage can be blocked, full or missing.
export const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Blocked or full: progress just lives for this visit.
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Nothing stored to remove.
    }
  },
}

export const PROGRESS_STORAGE_KEY = 'geminiguy-progress'

// The most recent award, so the HUD can float a "+N XP" toast for every source
// (play actions and the lesson alike). `id` bumps on every award.
export interface XpAward {
  id: number
  reason: XpReason
  xp: number
}

export interface ProgressState {
  xp: number
  level: number
  levelUpId: number // bumps on every level-up, so the UI can celebrate once per bump
  levelFrom: number // level before the latest level-up, for the banner's unlock list
  lastAward: XpAward | null
  award: (reason: XpReason) => void
  resetProgress: () => void
}

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      xp: 0,
      level: 1,
      levelUpId: 0,
      levelFrom: 1,
      lastAward: null,
      award: (reason) =>
        set((s) => {
          const gained = XP_REWARD[reason]
          const xp = s.xp + gained
          const level = levelForXp(xp)
          const lastAward = { id: (s.lastAward?.id ?? 0) + 1, reason, xp: gained }
          if (level <= s.level) return { xp, level, lastAward }
          return { xp, level, lastAward, levelUpId: s.levelUpId + 1, levelFrom: s.level }
        }),
      resetProgress: () => set({ xp: 0, level: 1, levelUpId: 0, levelFrom: 1, lastAward: null }),
    }),
    {
      name: PROGRESS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      // Only XP is stored; the level is derived from it on load, so a changed
      // XP curve can never leave a stale level behind.
      partialize: (s) => ({ xp: s.xp }),
      merge: (persisted, current) => {
        const raw = (persisted as { xp?: unknown } | undefined)?.xp
        const xp = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0
        return { ...current, xp, level: levelForXp(xp) }
      },
    },
  ),
)
