import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ANIM_STATES, CELEBRATIONS, CLIP_FALLBACK, defaultFace } from '../../src/character/blender/config.ts'
import { DANCES as SHOP_DANCES, FREE_DANCE, SHOP, ownedDances, type Dance, type UnlockId } from '../../src/state/progress.ts'

// The dances the Play HUD can pick must exist as real one-shots in the built GLB,
// not only as names that fall back to dance_bounce.

interface ClipInfo {
  name: string
  duration: number
  loop: boolean
}
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const manifest: { clips: ClipInfo[] } = json('../../public/models/tutor.manifest.json')
const source: { clips: ClipInfo[] } = json('../../BLENDER/tutor/clips.json')

const DANCES: Dance[] = [...SHOP_DANCES]
const NEW_DANCES = ['dance_shuffle', 'dance_wave', 'dance_floss', 'dance_disco', 'dance_twist']
// The Dance button's cooldown (PLAY.cooldownMs.dance in src/play/config.ts), pinned here
// because that module pulls in the scene layout.
const DANCE_COOLDOWN_S = 2.9

describe('dances', () => {
  it('has the eight dances, the five new ones included', () => {
    assert.equal(DANCES.length, 8)
    for (const d of NEW_DANCES) assert.ok(DANCES.includes(d as Dance), d)
  })

  it('every dance is a celebration and a dance-state clip', () => {
    for (const d of DANCES) {
      assert.ok((CELEBRATIONS as readonly string[]).includes(d), d)
      assert.ok((ANIM_STATES.dance.clips as readonly string[]).includes(d), d)
    }
  })

  it('every dance is a one-shot in clips.json and in the built GLB manifest, shorter than the cooldown', () => {
    for (const d of DANCES) {
      for (const [where, list] of [['clips.json', source.clips], ['manifest', manifest.clips]] as const) {
        const c = list.find((x) => x.name === d)
        assert.ok(c, `${d} missing from ${where}`)
        assert.equal(c.loop, false, `${d} loops in ${where}`)
        assert.ok(c.duration > 1 && c.duration <= DANCE_COOLDOWN_S, `${d}: ${c.duration}s in ${where}`)
      }
    }
  })

  it('a new dance falls back to an original dance and smiles', () => {
    for (const d of NEW_DANCES) {
      assert.ok(['dance_bounce', 'dance_spin', 'dance_robot'].includes(CLIP_FALLBACK[d as Dance] ?? ''), d)
      assert.equal(defaultFace(d as Dance), 'happy')
    }
  })

  it('bounce is free and every other dance is for sale; owning one adds it to his dances', () => {
    assert.equal(FREE_DANCE, 'dance_bounce')
    assert.deepEqual(ownedDances([]), ['dance_bounce'])
    for (const d of DANCES) {
      if (d === FREE_DANCE) continue
      const item = SHOP.find((x) => x.id === d)
      assert.ok(item && item.price > 0, `${d} is not in the shop`)
    }
    const all = DANCES.filter((d) => d !== FREE_DANCE) as UnlockId[]
    assert.deepEqual(ownedDances(all), DANCES)
    assert.deepEqual(ownedDances(['dance_disco', 'rainbow_cap']), ['dance_bounce', 'dance_disco'])
  })
})
