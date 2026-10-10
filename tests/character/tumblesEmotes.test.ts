import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { AnimationController, stateOfClip, type AnimSyncInput } from '../../src/character/blender/animController.ts'
import {
  ANIM_STATES,
  CLIP_FALLBACK,
  CLIP_VARIANTS,
  DEFAULT_FACE,
  TUMBLE_CLIPS,
  TUMBLE_CLIPS_LEFT,
  TUMBLE_FOLLOW_UP,
  fallbackOf,
} from '../../src/character/blender/config.ts'
import { TUMBLE, tumbleClip } from '../../src/character/blender/tumbleLayer.ts'
import { ONESHOT_CLIPS, type Clip, type OneShotClip } from '../../src/state/director.ts'
import type { TumbleCause } from '../../src/state/tumbles.ts'

// The v4 tumble and emote clips (BLENDER/tutor/author_tumbles.py, author_emotes.py):
// built into the GLB, wired into the director, the state machine and the knock.

interface ClipInfo {
  name: string
  duration: number
  loop: boolean
  face: string
}
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const manifest: { clips: ClipInfo[] } = json('../../public/models/tutor.manifest.json')
const byName = new Map(manifest.clips.map((c) => [c.name, c]))

const CAUSES: TumbleCause[] = ['boss', 'thrown', 'dropped', 'bonk', 'shaken', 'flicked']
const TUMBLES = ['tumble_knockback', 'tumble_spin', 'tumble_spin_l', 'tumble_splat', 'tumble_bonk', 'tumble_dizzy', 'tumble_dizzy_l', 'tumble_faceplant']
const EMOTES = [
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
]

let gid = 0
const frame = (over: Partial<AnimSyncInput> = {}): AnimSyncInput => ({ loop: 'idle', speaking: false, gesture: null, moving: false, ...over })
const play = (clip: OneShotClip, opts: { urgent?: boolean; vary?: boolean } = {}) => ({ id: ++gid, clip, ...opts })
const seconds = (c: string) => byName.get(c)?.duration ?? null

describe('v4 tumble and emote clips', () => {
  it('are one-shots in the built GLB manifest and in the director contract', () => {
    for (const c of [...TUMBLES, ...EMOTES]) {
      const m = byName.get(c)
      assert.ok(m, `${c} missing from tutor.manifest.json`)
      assert.equal(m.loop, false, `${c} loops`)
      assert.ok((ONESHOT_CLIPS as readonly string[]).includes(c), `${c} not a director one-shot`)
    }
  })

  it('fall back to a clip an older GLB has, and set a face the manifest agrees with', () => {
    for (const c of TUMBLES) assert.equal(CLIP_FALLBACK[c as Clip], 'tumble', c)
    for (const c of [...TUMBLES, ...EMOTES]) {
      const fb = fallbackOf(c as Clip)
      assert.ok(fb && byName.has(fb), `${c} -> ${fb}`)
      assert.equal(DEFAULT_FACE[c as Clip], byName.get(c)?.face, `${c} face`)
    }
  })
})

describe('tumble clips per cause', () => {
  it('maps every cause to its clip, and thrown / shaken to a mirrored clip for dir = -1', () => {
    assert.deepEqual(Object.keys(TUMBLE_CLIPS).sort(), [...CAUSES].sort())
    for (const c of CAUSES) {
      assert.equal(tumbleClip(c, 1), TUMBLE_CLIPS[c])
      assert.equal(tumbleClip(c, -1), TUMBLE_CLIPS_LEFT[c] ?? TUMBLE_CLIPS[c])
    }
    assert.equal(tumbleClip('thrown', -1), 'tumble_spin_l')
    assert.equal(tumbleClip('shaken', -1), 'tumble_dizzy_l')
    assert.equal(tumbleClip('boss', -1), 'tumble_knockback')
  })

  it('times each cause to its clip length in the GLB, mirrors included', () => {
    for (const c of CAUSES) {
      for (const dir of [1, -1] as const) {
        const clip = tumbleClip(c, dir)
        assert.ok(Math.abs((seconds(clip) ?? -1) - TUMBLE.seconds[c]) < 1e-6, `${c}/${dir}: ${clip} is ${seconds(clip)}s, TUMBLE says ${TUMBLE.seconds[c]}`)
      }
    }
    assert.equal(TUMBLE.recoverAt, 1)
    assert.ok(TUMBLE.clipLead > 0.18 && TUMBLE.clipLead < 0.3)
  })

  it('every tumble clip is a knocked one-shot at the recover priority, so recover can take over and a new knock can restart', () => {
    assert.equal(ANIM_STATES.knocked.kind, 'oneshot')
    assert.ok(ANIM_STATES.knocked.priority >= 90)
    assert.equal(ANIM_STATES.knocked.priority, ANIM_STATES.recover.priority)
    for (const c of TUMBLES) assert.equal(stateOfClip(c as Clip, 'oneshot'), 'knocked', c)
  })

  it('plays the clip over the lesson loop, hands off to recover, then queues the boss follow-up', () => {
    const c = new AnimationController(seconds, 'talk', 0, 0)
    let out = c.sync(0, frame({ loop: 'talk', gesture: play('tumble_knockback', { urgent: true }) }))
    assert.equal(out.gesture?.clip, 'tumble_knockback')
    out = c.sync(0.5, frame({ loop: 'point_left' })) // the lesson's loop changes underneath: no cut
    assert.equal(c.state, 'knocked')
    assert.equal(out.cut, false)
    out = c.sync(1.4 - TUMBLE.clipLead, frame({ loop: 'point_left', gesture: play('recover') }))
    assert.equal(out.gesture?.clip, 'recover')
    assert.equal(c.state, 'recover')
    const follow = TUMBLE_FOLLOW_UP.boss
    assert.ok(follow)
    c.sync(1.2, frame({ loop: 'point_left', gesture: play(follow) }))
    assert.equal(c.snapshot().queued, follow)
    out = c.sync(1.17 + 0.9 + 0.01, frame({ loop: 'point_left' }))
    assert.equal(out.gesture?.clip, follow)
  })

  it('a pick-up (dragged loop) cuts a tumble clip', () => {
    const c = new AnimationController(seconds, 'idle', 0, 0)
    c.sync(0, frame({ gesture: play('tumble_spin') }))
    const out = c.sync(0.3, frame({ loop: 'dragged' }))
    assert.equal(out.cut, true)
    assert.equal(c.state, 'dragged')
  })
})

describe('emote variants', () => {
  it('every variant list starts with its own clip and stays at that clip priority', () => {
    for (const [clip, list] of Object.entries(CLIP_VARIANTS) as [OneShotClip, readonly OneShotClip[]][]) {
      assert.equal(list[0], clip)
      const p = ANIM_STATES[stateOfClip(clip, 'oneshot')].priority
      for (const v of list) {
        assert.equal(ANIM_STATES[stateOfClip(v, 'oneshot')].priority, p, `${clip} -> ${v}`)
        assert.ok(byName.has(v), `${v} not in the GLB`)
      }
    }
    for (const e of EMOTES) assert.ok(Object.values(CLIP_VARIANTS).some((l) => l?.includes(e as OneShotClip)), `${e} is never played`)
  })

  it('tickle (vary) rotates giggle -> laugh -> shy -> giggle', () => {
    const c = new AnimationController(seconds, 'idle', 0, 0)
    const got: (string | undefined)[] = []
    for (let i = 0; i < 4; i++) got.push(c.sync(i * 3, frame({ gesture: play('giggle', { vary: true }) })).gesture?.clip)
    assert.deepEqual(got, ['giggle', 'emote_laugh', 'emote_shy', 'giggle'])
  })

  it('without vary (choreography) the exact clip plays every time', () => {
    const c = new AnimationController(seconds, 'idle', 0, 0)
    const got = [0, 3, 6].map((t) => c.sync(t, frame({ gesture: play('hop') })).gesture?.clip)
    assert.deepEqual(got, ['hop', 'hop', 'hop'])
    assert.equal(c.sync(9, frame({ gesture: play('hop', { vary: true }) })).gesture?.clip, 'hop') // the turn is only used by vary
    assert.equal(c.sync(12, frame({ gesture: play('hop', { vary: true }) })).gesture?.clip, 'emote_fistpump')
  })

  it('a wrong answer rotates shrug -> facepalm -> headshake, a right hop through the cheers', () => {
    const c = new AnimationController(seconds, 'idle', 0, 0)
    const wrong = [0, 3, 6].map((t) => c.sync(t, frame({ gesture: play('shrug', { urgent: true, vary: true }) })).gesture?.clip)
    assert.deepEqual(wrong, ['shrug', 'emote_facepalm', 'emote_headshake'])
    const right = [10, 13, 16, 19].map((t) => c.sync(t, frame({ gesture: play('hop', { vary: true }) })).gesture?.clip)
    assert.deepEqual(right, ['hop', 'emote_fistpump', 'emote_thumbsup', 'emote_nod'])
    assert.equal(c.sync(22, frame({ gesture: play('surprise', { vary: true }) })).gesture?.clip, 'surprise')
    assert.equal(c.sync(25, frame({ gesture: play('surprise', { vary: true }) })).gesture?.clip, 'emote_doubletake')
  })

  it('a request dropped inside the cooldown does not use up a variant', () => {
    const c = new AnimationController(seconds, 'idle', 0, 0)
    assert.equal(c.sync(0, frame({ gesture: play('giggle', { vary: true }) })).gesture?.clip, 'giggle')
    c.sync(0.1, frame({ gesture: play('giggle', { vary: true }) })) // play state cooldown 0.35 s: dropped
    assert.equal(c.last?.reason, 'cooldown')
    c.sync(2, frame())
    assert.equal(c.sync(2.1, frame({ gesture: play('giggle', { vary: true }) })).gesture?.clip, 'emote_laugh')
  })
})
