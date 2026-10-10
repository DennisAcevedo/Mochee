import { create } from 'zustand'
import { CELEBRATIONS } from '../character/blender/config.ts'

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
// A new dance only needs its line in CELEBRATIONS (src/character/blender/config.ts):
// it joins the one-shot clips here from there.
// play_* are the play tab's ball clips (BLENDER/tutor/author_play.py): src/scene/hoops moves the ball.
export const LOOP_CLIPS = [
  'idle',
  'talk',
  'think',
  'listen',
  'point_left',
  'point_right',
  'walk',
  'sleep',
  'dragged',
  'tumble',
  'play_dribble',
  'play_juggle',
  'play_jumprope',
] as const
const BASE_ONESHOT_CLIPS = [
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
  // v4 tumbles (BLENDER/tutor/author_tumbles.py): one per TumbleCause, _l = the fall to his left.
  // Each ends on the 'tumble' loop's first frame so 'recover' follows (tumbleLayer.ts).
  'tumble_knockback',
  'tumble_spin',
  'tumble_spin_l',
  'tumble_splat',
  'tumble_bonk',
  'tumble_dizzy',
  'tumble_dizzy_l',
  'tumble_faceplant',
  // v4 emotes (BLENDER/tutor/author_emotes.py): rest to rest, played as variants (CLIP_VARIANTS).
  'emote_laugh',
  'emote_shy',
  'emote_doubletake',
  'emote_fistpump',
  'emote_facepalm',
  'emote_nod',
  'emote_headshake',
  'emote_love',
  'emote_salute',
  'emote_thumbsup',
  // Play-tab ball one-shots (BLENDER/tutor/author_play.py).
  'play_shoot',
  'play_dunk',
  'play_kick',
  'play_catch_throw',
] as const
export type LoopClip = (typeof LOOP_CLIPS)[number]
export type OneShotClip = (typeof BASE_ONESHOT_CLIPS)[number] | (typeof CELEBRATIONS)[number]
export const ONESHOT_CLIPS: readonly OneShotClip[] = [
  ...BASE_ONESHOT_CLIPS,
  ...CELEBRATIONS.filter((c) => !(BASE_ONESHOT_CLIPS as readonly string[]).includes(c)),
]
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
  // The student's answer (a quiz shrug): takes the animation queue's one slot
  // even from a higher-priority request still waiting there, so a stale step
  // gesture queued during a walk can't play in its place (animController.ts).
  urgent?: boolean
  // Asks for variety: the tutor plays the clip's next CLIP_VARIANTS entry
  // (src/character/blender/config.ts) instead of the same clip every time.
  // Choreography (ability beats, lesson steps) leaves it off and gets the exact clip.
  vary?: boolean
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
  // Roaming (src/lesson/roam.ts): a free x in the lane between the windows,
  // standing in for `spot` until the next walkTo. null = stand on `spot`.
  roamX: number | null
  // Stepped aside from a maximized window: wins over roamX and `spot` until cleared.
  asideX: number | null
  // The yaw he turns to when standing (radians, 0 = the camera); null = face the camera.
  // The Play tab's ball moves (src/scene/hoops) turn him to the hoop with it.
  faceYaw: number | null

  walkTo: (spot: Spot) => void // also ends roaming: the lesson's spot wins at once
  setFocus: (focus: Focus) => void
  setLoop: (loop: LoopClip) => void
  play: (clip: OneShotClip, opts?: { urgent?: boolean; vary?: boolean }) => void
  burst: (kind: FxKind, at?: FxTarget) => void
  clearFx: (id: number) => void
  setNotesTab: (index: number) => void
  setHighlight: (id: string | null) => void
  setBoardReveal: (n: number) => void
  setCaption: (text: string | null) => void
  resetStage: () => void
  roamTo: (x: number | null) => void
  stepAside: (x: number | null) => void
  faceTo: (yaw: number | null) => void
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
  roamX: null as number | null,
  asideX: null as number | null,
  faceYaw: null as number | null,
})

export const useDirector = create<DirectorState>((set) => ({
  ...initialStage(),

  walkTo: (spot) => set({ spot, roamX: null }),
  setFocus: (focus) => set({ focus }),
  setLoop: (loop) => set({ loop }),
  play: (clip, opts) =>
    set({ gesture: { id: nextId++, clip, ...(opts?.urgent ? { urgent: true } : {}), ...(opts?.vary ? { vary: true } : {}) } }),
  burst: (kind, at = 'tutor') => set((s) => ({ fx: [...s.fx.slice(-11), { id: nextId++, kind, at }] })),
  clearFx: (id) => set((s) => ({ fx: s.fx.filter((f) => f.id !== id) })),
  setNotesTab: (notesTab) => set({ notesTab }),
  setHighlight: (highlight) => set({ highlight }),
  setBoardReveal: (boardReveal) => set({ boardReveal }),
  setCaption: (caption) => set({ caption }),
  resetStage: () => set(initialStage()),
  roamTo: (roamX) => set({ roamX }),
  stepAside: (asideX) => set({ asideX }),
  faceTo: (faceYaw) => set({ faceYaw }),
}))
