import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { TEACH_BACK_LIMITS } from '../../shared/teachBack.ts'

// Mochee's coins. Only learning earns them (a section finished, a right
// answer, the boss beaten, the lesson done); playing with him never does.
// Coins buy what levels used to unlock: the dances, the rainbow cap and the
// party lights. Coins and what he owns persist in localStorage through a
// wrapper that swallows every storage error, so private windows and blocked
// site data just start fresh each visit.

export type CoinReason = 'sectionDone' | 'quizCorrect' | 'bossWin' | 'lessonDone' | 'teachBack'

export const COIN_REWARD: Record<CoinReason, number> = {
  sectionDone: 25, // the lesson moves on a section: lecture to quick check (runner.ts, once per section per run)
  quizCorrect: 15, // a right answer: the lesson's quick check or the Learning drawer's quiz
  bossWin: 100, // Beat the Boss won (src/boss/bossStore.ts)
  lessonDone: 50, // the guided lesson's last step reached
  teachBack: TEACH_BACK_LIMITS.maxCoins, // per topic, earned as the explanation improves
}

// Short label for the floating "+N coins" toast, per reason.
export const COIN_LABEL: Record<CoinReason, string> = {
  sectionDone: 'Section done',
  quizCorrect: 'Correct!',
  bossWin: 'Boss beaten!',
  lessonDone: 'Lesson complete',
  teachBack: 'Topic taught!',
}

// Every dance, in shop order. Bounce is his from the start; the rest are bought.
export const DANCES = ['dance_bounce', 'dance_spin', 'dance_shuffle', 'dance_robot', 'dance_wave', 'dance_floss', 'dance_disco', 'dance_twist'] as const
export type Dance = (typeof DANCES)[number]
export const FREE_DANCE: Dance = 'dance_bounce'

export type UnlockId = Exclude<Dance, 'dance_bounce'> | 'rainbow_cap' | 'party_lights'

export interface ShopItem {
  id: UnlockId
  price: number // coins
  label: string
  blurb: string
}

// What coins buy, cheapest first. The dance menu sells the dances and the
// party lights, the cap button sells the cap (src/ui/PlayHud/PlayHud.tsx).
export const SHOP: readonly ShopItem[] = [
  { id: 'dance_spin', price: 30, label: 'Spin dance', blurb: 'He can twirl on the spot' },
  { id: 'dance_shuffle', price: 30, label: 'Shuffle dance', blurb: 'Side-step shuffle, fists pumping' },
  { id: 'dance_robot', price: 50, label: 'Robot dance', blurb: 'Beep boop, robot moves' },
  { id: 'dance_wave', price: 50, label: 'Wave dance', blurb: 'A ripple rolls from hand to hand' },
  { id: 'dance_floss', price: 60, label: 'Floss dance', blurb: 'Arms whip, hips swing the other way' },
  { id: 'dance_disco', price: 80, label: 'Disco dance', blurb: 'Point up, point down, disco fever' },
  { id: 'dance_twist', price: 80, label: 'Twist dance', blurb: 'Twist down low and back up' },
  { id: 'rainbow_cap', price: 100, label: 'Rainbow cap', blurb: 'Recolour his graduation cap' },
  { id: 'party_lights', price: 150, label: 'Party lights', blurb: 'Dance parties light up the room' },
]

const SHOP_IDS = new Set<string>(SHOP.map((i) => i.id))

export function shopItem(id: UnlockId): ShopItem {
  return SHOP.find((i) => i.id === id)!
}

export function owns(owned: readonly UnlockId[], id: UnlockId): boolean {
  return owned.includes(id)
}

// The dances he can do: bounce plus every one bought, in shop order. The quiz
// celebration and the dance party pick from these.
export function ownedDances(owned: readonly UnlockId[]): Dance[] {
  return DANCES.filter((d) => d === FREE_DANCE || owned.includes(d as UnlockId))
}

// Whether `clip` may be a right-answer celebration: any non-dance (celebrate,
// hop) always, a dance only once he owns it (runner.ts nextCelebration).
export function canCelebrate(owned: readonly UnlockId[], clip: string): boolean {
  return !(DANCES as readonly string[]).includes(clip) || (ownedDances(owned) as readonly string[]).includes(clip)
}

// ---- Old saves. Persist version 1 stored { xp } under the XP/level system;
// these are its curve and unlock levels, kept only to carry those saves over.

const LEGACY = {
  coinsPerXp: 1 / 10, // an old save's XP becomes round(xp / 10) coins
  unlockLevel: {
    dance_spin: 2,
    dance_shuffle: 2,
    dance_robot: 3,
    dance_wave: 3,
    dance_floss: 3,
    dance_disco: 4,
    dance_twist: 4,
    rainbow_cap: 4,
    party_lights: 5,
  } as Record<UnlockId, number>,
}

// The old XP curve: total XP to reach `level` was 60 * (level - 1)^1.5.
function legacyLevel(xp: number): number {
  let level = 1
  while (xp >= Math.round(60 * level ** 1.5)) level++
  return level
}

// An old save's coins, and everything its level had unlocked, so nobody loses a dance or the cap.
export function migrateXp(xp: number): { coins: number; owned: UnlockId[] } {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0
  const level = legacyLevel(safe)
  return {
    coins: Math.round(safe * LEGACY.coinsPerXp),
    owned: SHOP.map((i) => i.id).filter((id) => LEGACY.unlockLevel[id] <= level),
  }
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

// The most recent award, so the HUD can float a "+N coins" toast for every
// source. `id` bumps on every award.
export interface CoinAward {
  id: number
  reason: CoinReason
  coins: number
}

// The most recent purchase, so the page can celebrate it once. `id` bumps on every buy.
export interface Purchase {
  id: number
  item: UnlockId
}

export interface ProgressState {
  coins: number
  owned: UnlockId[]
  teachBackRewards: Record<string, number>
  awardTeachBack: (topicId: string, score: number) => number
  lastAward: CoinAward | null
  lastPurchase: Purchase | null
  // `coins` overrides the reason's COIN_REWARD.
  award: (reason: CoinReason, coins?: number) => void
  // Buys `id` if he can afford it and does not own it yet; false otherwise.
  spend: (id: UnlockId) => boolean
  resetProgress: () => void
}

interface Saved {
  coins: number
  owned: UnlockId[]
  teachBackRewards: Record<string, number>
}

// A stored save as it can be trusted: whole, non-negative coins and known items, once each.
function cleanSave(raw: unknown): Saved {
  const r = (raw ?? {}) as { coins?: unknown; owned?: unknown; teachBackRewards?: unknown }
  const coins = typeof r.coins === 'number' && Number.isFinite(r.coins) && r.coins >= 0 ? Math.round(r.coins) : 0
  const owned = Array.isArray(r.owned) ? [...new Set(r.owned.filter((id): id is UnlockId => typeof id === 'string' && SHOP_IDS.has(id)))] : []
  const teachBackRewards = Object.fromEntries(Object.entries(r.teachBackRewards && typeof r.teachBackRewards === 'object' ? r.teachBackRewards : {})
    .filter(([id, amount]) => /^[a-f0-9]{16}-t\d{1,2}$/.test(id) && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && amount <= TEACH_BACK_LIMITS.maxCoins)
    .map(([id, amount]) => [id, Math.round(amount as number)]))
  return { coins, owned, teachBackRewards }
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      coins: 0,
      owned: [],
      teachBackRewards: {},
      lastAward: null,
      lastPurchase: null,
      award: (reason, amount) =>
        set((s) => {
          const gained = amount !== undefined && Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : COIN_REWARD[reason]
          return { coins: s.coins + gained, lastAward: { id: (s.lastAward?.id ?? 0) + 1, reason, coins: gained } }
        }),
      awardTeachBack: (topicId, score) => {
        if (!/^[a-f0-9]{16}-t\d{1,2}$/.test(topicId) || !Number.isFinite(score) || score < 0 || score > 100) return 0
        const s = get()
        const earned = Math.round(score / 100 * TEACH_BACK_LIMITS.maxCoins)
        const gained = Math.max(0, earned - (s.teachBackRewards[topicId] ?? 0))
        if (gained > 0) set({
          coins: s.coins + gained,
          teachBackRewards: { ...s.teachBackRewards, [topicId]: earned },
          lastAward: { id: (s.lastAward?.id ?? 0) + 1, reason: 'teachBack', coins: gained },
        })
        return gained
      },
      spend: (id) => {
        const s = get()
        const item = SHOP.find((i) => i.id === id)
        if (!item || s.owned.includes(id) || s.coins < item.price) return false
        set({ coins: s.coins - item.price, owned: [...s.owned, id], lastPurchase: { id: (s.lastPurchase?.id ?? 0) + 1, item: id } })
        return true
      },
      resetProgress: () => set({ coins: 0, owned: [], teachBackRewards: {}, lastAward: null, lastPurchase: null }),
    }),
    {
      name: PROGRESS_STORAGE_KEY,
      // 1: { xp } (levels). 2: { coins, owned }.
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): Saved => ({ coins: s.coins, owned: s.owned, teachBackRewards: s.teachBackRewards }),
      migrate: (persisted, version) => {
        if (version < 2) return migrateXp(Number((persisted as { xp?: unknown } | undefined)?.xp))
        return persisted
      },
      merge: (persisted, current) => ({ ...current, ...cleanSave(persisted) }),
    },
  ),
)
