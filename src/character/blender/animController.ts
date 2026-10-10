import type { Clip, Gesture, LoopClip, OneShotClip } from '../../state/director'
import { ANIM, ANIM_STATES, ANIM_STATE_NAMES, CLIP_VARIANTS, type AnimState } from './config.ts'

// The tutor's animation state machine. It sits between the director (which
// keeps its play / setLoop API) and TutorMotion (which crossfades the mixer):
// every request becomes a state with a priority, a cooldown and a fade.
//
// Rules, all deterministic in `now` (seconds on the caller's clock):
// - The base loop follows director.loop (idle while speaking reads as talk).
//   A loop holds for its state's cooldown before an equal-or-lower loop
//   replaces it (the change waits); a higher loop switches at once and cuts a
//   lower one-shot in progress (dragged / tumble cut a celebration).
// - A one-shot starts unless its state is cooling down (dropped) or something
//   of higher priority is in progress (the base loop or the current one-shot).
//   A blocked request is queued once: one slot, a higher-or-equal request
//   replaces it, it plays when the blocker ends if it is younger than
//   ANIM.queueTtl, else it is dropped. Equal priority replaces (latest wins).
//   An urgent request (the student's answer) takes the slot whatever waits
//   there: a stale step gesture must not play in place of a quiz shrug.
// - A one-shot ends after its clip length, then he returns to the current base.
// - While he walks, one-shots wait in the queue and a running one is cut
//   (TutorMotion does the same with the mixer).
// No three or React imports: tests/character/animController.test.ts runs it in node.

export type TransitionReason = 'loop' | 'start' | 'done' | 'interrupt' | 'queued' | 'dequeued' | 'cooldown' | 'blocked' | 'expired' | 'walk'

export interface Transition {
  from: AnimState
  to: AnimState
  clip: Clip
  at: number
  reason: TransitionReason
}

export interface AnimOutput {
  loop: LoopClip // the base loop to hold
  loopFade: number
  gesture: (Gesture & { fade: number }) | null // the active one-shot; a new id means start it
  cut: boolean // a one-shot in progress was cut this frame: drop it and fade to the loop
}

export interface AnimSnapshot {
  state: AnimState // the one-shot's state while one plays, else the base loop's
  base: AnimState
  loop: LoopClip
  oneShot: OneShotClip | null
  queued: OneShotClip | null
  last: Transition | null
  transitions: number
  dropped: number
}

export interface AnimSyncInput {
  loop: LoopClip
  speaking: boolean
  gesture: Gesture | null // director.gesture: a new id is a new request
  moving: boolean // walking between spots
}

const STATE_OF = new Map<Clip, AnimState>()
for (const s of ANIM_STATE_NAMES) for (const c of ANIM_STATES[s].clips) if (!STATE_OF.has(c)) STATE_OF.set(c, s)

// The state a director clip belongs to (clips no state lists count as play / idle).
export function stateOfClip(clip: Clip, kind: 'loop' | 'oneshot'): AnimState {
  return STATE_OF.get(clip) ?? (kind === 'loop' ? 'idle' : 'play')
}

interface OneShot {
  state: AnimState
  clip: OneShotClip
  id: number
  until: number
}

interface Queued {
  state: AnimState
  clip: OneShotClip
  at: number
}

export class AnimationController {
  private loopClip: LoopClip
  private baseState: AnimState
  private baseSince: number
  private pendingLoop: LoopClip | null = null
  private oneShot: OneShot | null = null
  private queued: Queued | null = null
  private readonly lastStart = new Map<AnimState, number>()
  private readonly rotation = new Map<AnimState, number>()
  private readonly variantTurn = new Map<OneShotClip, number>()
  private lastDirectorId: number
  private nextId = 1
  private cut = false
  private gestureOut: (Gesture & { fade: number }) | null = null
  last: Transition | null = null
  transitions = 0
  dropped = 0

  private readonly durationOf: (clip: OneShotClip) => number | null | undefined

  // durationOf: seconds the motion layer will play a one-shot (null = unknown).
  // lastDirectorId: director.gesture?.id at mount, so old requests do not replay.
  constructor(durationOf: (clip: OneShotClip) => number | null | undefined, start: LoopClip = 'idle', now = 0, lastDirectorId = 0) {
    this.durationOf = durationOf
    this.loopClip = start
    this.baseState = stateOfClip(start, 'loop')
    this.baseSince = now
    this.lastDirectorId = lastDirectorId
  }

  get state(): AnimState {
    return this.oneShot?.state ?? this.baseState
  }

  private prio(s: AnimState): number {
    return ANIM_STATES[s].priority
  }

  private record(from: AnimState, to: AnimState, clip: Clip, at: number, reason: TransitionReason): void {
    this.last = { from, to, clip, at, reason }
    this.transitions++
    if (reason === 'cooldown' || reason === 'blocked' || reason === 'expired') this.dropped++
  }

  // The loop the director asks for; higher priority switches now, the rest wait out the dwell.
  setLoop(clip: LoopClip, now: number): void {
    if (clip === this.loopClip) {
      this.pendingLoop = null
      return
    }
    const next = stateOfClip(clip, 'loop')
    const dwell = ANIM_STATES[this.baseState].cooldown
    if (this.prio(next) <= this.prio(this.baseState) && now - this.baseSince < dwell) {
      this.pendingLoop = clip
      return
    }
    this.applyLoop(clip, next, now)
  }

  private applyLoop(clip: LoopClip, next: AnimState, now: number): void {
    const from = this.state
    this.pendingLoop = null
    this.loopClip = clip
    this.baseState = next
    this.baseSince = now
    if (this.oneShot && this.prio(next) > this.prio(this.oneShot.state)) {
      this.oneShot = null
      this.queued = null
      this.cut = true
      this.record(from, next, clip, now, 'interrupt')
    } else if (!this.oneShot) {
      this.record(from, next, clip, now, 'loop')
    }
  }

  // A one-shot clip from the director (or any caller). With `vary`, a clip that
  // has variants (CLIP_VARIANTS) plays its next one; the turn only advances when
  // the request starts or waits in the queue, so a dropped one skips no variant.
  play(clip: OneShotClip, now: number, moving = false, urgent = false, vary = false): boolean {
    const list = vary ? CLIP_VARIANTS[clip] : undefined
    const turn = this.variantTurn.get(clip) ?? 0
    const pick = list?.length ? list[turn % list.length] : clip
    const started = this.requestOneShot(stateOfClip(pick, 'oneshot'), pick, now, moving, urgent)
    const waits = this.last?.reason === 'queued' || this.last?.reason === 'walk' // requestOneShot always records this call
    if (list?.length && (started || waits)) this.variantTurn.set(clip, turn + 1)
    return started
  }

  // An intent by state name: plays the state's clips in turn (deterministic rotation).
  request(state: AnimState, now: number, moving = false): boolean {
    const cfg = ANIM_STATES[state]
    if (cfg.kind === 'loop') {
      this.setLoop(cfg.clips[0] as LoopClip, now)
      return this.baseState === state
    }
    const i = this.rotation.get(state) ?? 0
    this.rotation.set(state, i + 1)
    return this.requestOneShot(state, cfg.clips[i % cfg.clips.length] as OneShotClip, now, moving)
  }

  private requestOneShot(state: AnimState, clip: OneShotClip, now: number, moving: boolean, urgent = false): boolean {
    const from = this.state
    const since = this.lastStart.get(state)
    if (since !== undefined && now - since < ANIM_STATES[state].cooldown) {
      this.record(from, from, clip, now, 'cooldown')
      return false
    }
    const blocker = this.oneShot ? Math.max(this.prio(this.oneShot.state), this.prio(this.baseState)) : this.prio(this.baseState)
    if (moving || this.prio(state) < blocker) {
      if (urgent || !this.queued || this.prio(state) >= this.prio(this.queued.state)) {
        this.queued = { state, clip, at: now }
        this.record(from, from, clip, now, moving ? 'walk' : 'queued')
      } else {
        this.record(from, from, clip, now, 'blocked')
      }
      return false
    }
    this.start(state, clip, now, 'start')
    return true
  }

  private start(state: AnimState, clip: OneShotClip, now: number, reason: TransitionReason): void {
    const from = this.state
    const seconds = this.durationOf(clip) ?? ANIM.defaultOneShotSeconds
    this.oneShot = { state, clip, id: this.nextId++, until: now + seconds }
    this.gestureOut = { id: this.oneShot.id, clip, fade: ANIM_STATES[state].fade }
    this.lastStart.set(state, now)
    this.record(from, state, clip, now, reason)
  }

  // Advance the clock: finish one-shots, apply a waiting loop, play the queue.
  tick(now: number, moving = false): void {
    if (this.pendingLoop && now - this.baseSince >= ANIM_STATES[this.baseState].cooldown) {
      this.applyLoop(this.pendingLoop, stateOfClip(this.pendingLoop, 'loop'), now)
    }
    if (this.oneShot && moving) {
      const { state } = this.oneShot
      this.oneShot = null
      this.cut = true
      this.record(state, this.baseState, this.loopClip, now, 'walk')
    }
    if (this.oneShot && now >= this.oneShot.until) {
      const { state } = this.oneShot
      this.oneShot = null
      this.record(state, this.baseState, this.loopClip, now, 'done')
    }
    if (this.queued && moving) this.queued.at = now // a request made mid-walk waits for arrival, then gets its full TTL
    if (this.queued && !this.oneShot && !moving) {
      const q = this.queued
      if (now - q.at > ANIM.queueTtl) {
        this.queued = null
        this.record(this.state, this.state, q.clip, now, 'expired')
      } else if (this.prio(q.state) >= this.prio(this.baseState)) {
        this.queued = null
        const since = this.lastStart.get(q.state)
        if (since !== undefined && now - since < ANIM_STATES[q.state].cooldown) this.record(this.state, this.state, q.clip, now, 'cooldown')
        else this.start(q.state, q.clip, now, 'dequeued')
      }
    }
  }

  // One call per frame from the component: director state in, what to play out.
  sync(now: number, input: AnimSyncInput): AnimOutput {
    this.cut = false
    // The loop first, so a physics hand-off (setLoop('idle') + play('recover')) lands in one frame.
    this.setLoop(input.loop === 'idle' && input.speaking ? 'talk' : input.loop, now)
    if (input.gesture && input.gesture.id !== this.lastDirectorId) {
      this.lastDirectorId = input.gesture.id
      this.play(input.gesture.clip, now, input.moving, !!input.gesture.urgent, !!input.gesture.vary)
    }
    this.tick(now, input.moving)
    return {
      loop: this.loopClip,
      loopFade: ANIM_STATES[this.baseState].fade,
      gesture: this.oneShot ? this.gestureOut : null,
      cut: this.cut,
    }
  }

  snapshot(): AnimSnapshot {
    return {
      state: this.state,
      base: this.baseState,
      loop: this.loopClip,
      oneShot: this.oneShot?.clip ?? null,
      queued: this.queued?.clip ?? null,
      last: this.last,
      transitions: this.transitions,
      dropped: this.dropped,
    }
  }
}
