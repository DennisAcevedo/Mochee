import { create } from 'zustand'

// The stage contract: everything the 3D room, the windows, the Blender tutor
// and the effects layer read, and everything the walkthrough, the Q&A flow and
// the play system write. Components never talk to each other directly; they
// go through this store.

// Where he stands on the floor. left = in front of the notes window (viewer's
// left), right = in front of the board window (viewer's right).
export type Spot = 'left' | 'center' | 'right'

// Which window is "on": it tilts toward the camera, glows, and the camera eases toward it.
export type Focus = 'none' | 'notes' | 'board'

// Animation clip names baked into public/models/tutor.glb. Keep in sync with
// blender/tutor/clips.json; the character component plays these by name.
// dragged / tumble (loops) and recover / surprise / hint / equip (one-shots)
// are the v2 clips: physics holds dragged while he is grabbed and tumble while
// he flies, then plays recover. An older GLB without them degrades through
// CLIP_FALLBACK (src/character/blender/config.ts).
export const LOOP_CLIPS = ['idle', 'talk', 'think', 'listen', 'point_left', 'point_right', 'walk', 'sleep', 'dragged', 'tumble'] as const
export const ONESHOT_CLIPS = [
  'wave',
  'hop',
  'shrug',
  'celebrate',
  'dance_bounce',
  'dance_spin',
  'dance_robot',
  'giggle',
  'highfive',
  'catch',
  'yum',
  'levelup',
  'wake',
  'recover',
  'surprise',
  'hint',
  'equip',
] as const
export type LoopClip = (typeof LOOP_CLIPS)[number]
export type OneShotClip = (typeof ONESHOT_CLIPS)[number]
export type Clip = LoopClip | OneShotClip

export type FxKind = 'confetti' | 'sparkles' | 'hearts' | 'stars' | 'ring' | 'levelup'
export type FxTarget = 'tutor' | 'notes' | 'board'

export interface FxEvent {
  id: number
  kind: FxKind
  at: FxTarget
}

// A one-shot request. `id` changes on every request so the same clip can replay.
export interface Gesture {
  id: number
  clip: OneShotClip
}

export interface DirectorState {
  spot: Spot
  focus: Focus
  loop: LoopClip // what he does when no one-shot is playing
  gesture: Gesture | null
  fx: FxEvent[]
  notesTab: number // index into the notes window's tabs
  highlight: string | null // id of the highlighted line in the notes window
  boardReveal: number // how many board elements are shown, for step-by-step reveals
  caption: string | null // what he is saying right now, shown as a caption

  walkTo: (spot: Spot) => void
  setFocus: (focus: Focus) => void
  setLoop: (loop: LoopClip) => void
  play: (clip: OneShotClip) => void
  burst: (kind: FxKind, at?: FxTarget) => void
  clearFx: (id: number) => void
  setNotesTab: (index: number) => void
  setHighlight: (id: string | null) => void
  setBoardReveal: (n: number) => void
  setCaption: (text: string | null) => void
  resetStage: () => void
}

let nextId = 1

const initialStage = () => ({
  spot: 'center' as Spot,
  focus: 'none' as Focus,
  loop: 'idle' as LoopClip,
  gesture: null as Gesture | null,
  fx: [] as FxEvent[],
  notesTab: 0,
  highlight: null as string | null,
  boardReveal: Number.POSITIVE_INFINITY,
  caption: null as string | null,
})

export const useDirector = create<DirectorState>((set) => ({
  ...initialStage(),

  walkTo: (spot) => set({ spot }),
  setFocus: (focus) => set({ focus }),
  setLoop: (loop) => set({ loop }),
  play: (clip) => set({ gesture: { id: nextId++, clip } }),
  burst: (kind, at = 'tutor') => set((s) => ({ fx: [...s.fx.slice(-11), { id: nextId++, kind, at }] })),
  clearFx: (id) => set((s) => ({ fx: s.fx.filter((f) => f.id !== id) })),
  setNotesTab: (notesTab) => set({ notesTab }),
  setHighlight: (highlight) => set({ highlight }),
  setBoardReveal: (boardReveal) => set({ boardReveal }),
  setCaption: (caption) => set({ caption }),
  resetStage: () => set(initialStage()),
}))
