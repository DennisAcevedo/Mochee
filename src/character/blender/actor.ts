// Which character is on the lesson stage, for the code that frames or drives
// him without rendering him (the intro's camera push, the roaming scheduler).
// BlenderTutorSafe sets `classic` while the classic code character stands in
// for a missing or broken GLB. `roam` is the scheduler's live readout
// (CharacterDirector writes it), for the checks.
export const tutorActor = {
  classic: false,
  // The lesson tutor's walk from where his feet now are (world x, z): the
  // physics body hands him over here after a fling, so he waddles back to his
  // spot instead of gliding. Null while no Blender tutor is on the stage.
  relocate: null as ((x: number, z: number) => void) | null,
  roam: {
    enabled: false,
    busy: false,
    moving: false,
    aside: null as string | null,
    nextAt: null as number | null, // seconds, performance.now() / 1000
    log: [] as { t: number; kind: string; x?: number; clip?: string }[], // recent actions, newest last
  },
}

export const ROAM_LOG_CAP = 50

// Dev-only: hang a live readout on window.__gg (installed by GGHooks, which
// this module must not edit) under `key`. Cheap enough to call every frame.
export function exposeDev(key: string, value: unknown): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return
  const gg = window.__gg as unknown as Record<string, unknown> | undefined
  if (gg && gg[key] !== value) gg[key] = value
}
