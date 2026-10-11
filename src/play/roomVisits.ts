export type WelcomeRoom = 'study' | 'play'
const KEY = 'geminiguy-room-visits-v1'
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

// Claim on entry, so interrupting a welcome does not replay it on a return.
// Memory still works when browser storage is blocked.
export function createRoomVisits(storage: () => Storage | null) {
  const visited = new Set<string>()
  return {
    enter(tutorId: string, room: WelcomeRoom): boolean {
      try {
        const saved: unknown = JSON.parse(storage()?.getItem(KEY) ?? '[]')
        if (Array.isArray(saved)) for (const key of saved) if (typeof key === 'string') visited.add(key)
      } catch { /* storage unavailable or an old damaged value */ }
      const key = JSON.stringify([tutorId, room])
      if (visited.has(key)) return false
      visited.add(key)
      try { storage()?.setItem(KEY, JSON.stringify([...visited])) } catch { /* session memory remains */ }
      return true
    },
  }
}

export const roomVisits = createRoomVisits(() => typeof window === 'undefined' ? null : window.localStorage)
