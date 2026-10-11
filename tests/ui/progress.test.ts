import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { COIN_REWARD, migrateXp, PROGRESS_STORAGE_KEY, SHOP, shopItem, useProgress, type UnlockId } from '../../src/state/progress.ts'

// Coins: only learning earns them (award), the shop spends them (spend), and
// saves from the XP/level system carry over (migrateXp, persist version 2).

const store = () => useProgress.getState()

describe('coins', () => {
  beforeEach(() => store().resetProgress())

  it('pays the learning rewards and toasts each one', () => {
    assert.deepEqual(COIN_REWARD, { sectionDone: 25, quizCorrect: 15, bossWin: 100, lessonDone: 50, teachBack: 50 })
    store().award('sectionDone')
    store().award('quizCorrect')
    store().award('bossWin')
    store().award('lessonDone')
    assert.equal(store().coins, 190)
    assert.deepEqual(store().lastAward, { id: 4, reason: 'lessonDone', coins: 50 })
    store().award('bossWin', 7) // an explicit amount overrides the table
    assert.equal(store().coins, 197)
    store().award('quizCorrect', -3) // a bad amount falls back to the table
    assert.equal(store().coins, 212)
  })

  it('prices the shop as specified, cheapest first', () => {
    const prices = Object.fromEntries(SHOP.map((i) => [i.id, i.price]))
    assert.deepEqual(prices, {
      dance_spin: 30,
      dance_shuffle: 30,
      dance_robot: 50,
      dance_wave: 50,
      dance_floss: 60,
      dance_disco: 80,
      dance_twist: 80,
      rainbow_cap: 100,
      party_lights: 150,
    })
    for (let i = 1; i < SHOP.length; i++) assert.ok(SHOP[i].price >= SHOP[i - 1].price)
  })

  it('rewards teach-back improvements once per topic, capped at 50 coins', () => {
    const topic = 'aaaaaaaaaaaaaaaa-t1'
    assert.equal(store().awardTeachBack(topic, 50), 25)
    assert.equal(store().awardTeachBack(topic, 50), 0)
    assert.equal(store().awardTeachBack(topic, 25), 0)
    assert.equal(store().awardTeachBack(topic, 75), 13)
    assert.equal(store().awardTeachBack(topic, 100), 12)
    assert.equal(store().coins, 50)
    assert.equal(store().awardTeachBack('aaaaaaaaaaaaaaaa-t2', 100), 50)
    assert.equal(store().coins, 100)
    assert.equal(store().lastAward?.reason, 'teachBack')
    for (const score of [-1, 101, Infinity, NaN]) assert.equal(store().awardTeachBack(topic, score), 0)
    assert.equal(store().awardTeachBack('__proto__', 100), 0)
    assert.equal(store().coins, 100)
  })

  it('spends only what he has, once per item', () => {
    store().award('quizCorrect') // 15
    assert.equal(store().spend('dance_spin'), false) // 30: short
    assert.equal(store().coins, 15)
    assert.deepEqual(store().owned, [])
    assert.equal(store().lastPurchase, null)

    store().award('lessonDone') // 65
    assert.equal(store().spend('dance_spin'), true)
    assert.equal(store().coins, 35)
    assert.deepEqual(store().owned, ['dance_spin'])
    assert.deepEqual(store().lastPurchase, { id: 1, item: 'dance_spin' })

    assert.equal(store().spend('dance_spin'), false) // already his
    assert.equal(store().spend('dance_bounce' as UnlockId), false) // free, not for sale
    assert.equal(store().coins, 35)

    store().award('bossWin') // 135
    assert.equal(store().spend('rainbow_cap'), true)
    assert.equal(store().coins, 35)
    assert.deepEqual(store().owned, ['dance_spin', 'rainbow_cap'])
    assert.equal(store().lastPurchase?.id, 2)
    assert.equal(shopItem('rainbow_cap').label, 'Rainbow cap')
  })
})

describe('old XP saves', () => {
  it('turns XP into coins (xp / 10, rounded) and keeps what the old level had unlocked', () => {
    assert.deepEqual(migrateXp(0), { coins: 0, owned: [] })
    assert.deepEqual(migrateXp(59), { coins: 6, owned: [] }) // level 1
    assert.deepEqual(migrateXp(60), { coins: 6, owned: ['dance_spin', 'dance_shuffle'] }) // level 2
    assert.deepEqual(migrateXp(300), { coins: 30, owned: ['dance_spin', 'dance_shuffle', 'dance_robot', 'dance_wave', 'dance_floss'] }) // level 3
    assert.deepEqual(migrateXp(312).owned.slice(-3), ['dance_disco', 'dance_twist', 'rainbow_cap']) // level 4
    assert.deepEqual(migrateXp(480), { coins: 48, owned: SHOP.map((i) => i.id) }) // level 5: everything
    assert.deepEqual(migrateXp(Number.NaN), { coins: 0, owned: [] })
    assert.deepEqual(migrateXp(-20), { coins: 0, owned: [] })
  })

  // A localStorage stand-in, so the store's own persist path runs as in the browser.
  function withStorage(saved: unknown) {
    const data = new Map<string, string>([[PROGRESS_STORAGE_KEY, JSON.stringify(saved)]])
    const localStorage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    }
    ;(globalThis as { window?: unknown }).window = { localStorage }
    return data
  }

  it('migrates a stored version-1 save when the store loads it', async () => {
    const data = withStorage({ state: { xp: 330 }, version: 1 }) // level 4
    await useProgress.persist.rehydrate()
    assert.equal(store().coins, 33)
    assert.deepEqual(store().owned, ['dance_spin', 'dance_shuffle', 'dance_robot', 'dance_wave', 'dance_floss', 'dance_disco', 'dance_twist', 'rainbow_cap'])
    store().award('sectionDone') // a change saves the new shape
    const saved = JSON.parse(data.get(PROGRESS_STORAGE_KEY)!)
    assert.equal(saved.version, 2)
    assert.deepEqual(Object.keys(saved.state).sort(), ['coins', 'owned', 'teachBackRewards'])
    assert.equal(saved.state.coins, 58)
  })

  it('cleans a damaged save instead of trusting it', async () => {
    withStorage({ state: { coins: -5, owned: ['dance_spin', 'bogus', 'dance_spin', 7] }, version: 2 })
    await useProgress.persist.rehydrate()
    assert.equal(store().coins, 0)
    assert.deepEqual(store().owned, ['dance_spin'])
    withStorage({ state: { coins: 41.6, owned: 'dance_spin' }, version: 2 })
    await useProgress.persist.rehydrate()
    assert.equal(store().coins, 42)
    assert.deepEqual(store().owned, [])
  })

  it('keeps the teach-back reward ledger across reloads and cleans invalid entries', async () => {
    const topic = 'aaaaaaaaaaaaaaaa-t1'
    withStorage({ state: { coins: 25, owned: [], teachBackRewards: { [topic]: 25, invalid: 999, 'aaaaaaaaaaaaaaaa-t2': -10 } }, version: 2 })
    await useProgress.persist.rehydrate()
    assert.deepEqual(store().teachBackRewards, { [topic]: 25 })
    assert.equal(store().awardTeachBack(topic, 50), 0)
    assert.equal(store().awardTeachBack(topic, 100), 25)
    assert.equal(store().coins, 50)
    await useProgress.persist.rehydrate()
    assert.equal(store().awardTeachBack(topic, 100), 0)
    assert.equal(store().coins, 50)
  })
})
