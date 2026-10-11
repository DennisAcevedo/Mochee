import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOSS_DIFFICULTIES, bossMatch, PLAYER_DAMAGE, PLAYER_HP, type BossDifficulty } from '../../src/boss/balance.ts'
import { ARCHETYPES, archetypeFor } from '../../src/boss/archetypes.ts'

test('tiers take 3/4/5 correct answers, allow 4/3/2 mistakes, and award 60/100/150 coins', () => {
  const tiers: BossDifficulty[] = ['easy', 'medium', 'hard']
  tiers.forEach((difficulty, i) => {
    const match = bossMatch(difficulty, 5)
    assert.equal(match.maxHp, [60, 80, 100][i])
    assert.equal(Math.ceil(match.maxHp / PLAYER_DAMAGE), [3, 4, 5][i])
    assert.equal(Math.ceil(PLAYER_HP / match.damage) - 1, [4, 3, 2][i])
    assert.equal(match.coins, [60, 100, 150][i])
    // A 75%-accurate run (one miss per three hits) is winnable in every tier.
    assert.ok(Math.floor((match.questions - 1) / 3) * match.damage < PLAYER_HP)
  })
})

test('short question banks reduce health and coins without repeating answered questions', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (let available = 0; available <= 7; available++) {
      const match = bossMatch(difficulty, available)
      assert.ok(match.questions <= available)
      assert.equal(match.maxHp, match.questions * PLAYER_DAMAGE)
      assert.equal(match.coins, match.questions * BOSS_DIFFICULTIES[difficulty].coinsPerAnswer)
      assert.ok(match.coins <= bossMatch(difficulty).coins)
    }
  }
})

test('each boss has a stable tier, with two bosses in each difficulty', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) assert.equal(ARCHETYPES.filter((a) => a.difficulty === difficulty).length, 2)
  const topic = { id: 'test-document-topic-1' }
  assert.deepEqual(archetypeFor(topic), archetypeFor(topic))
  assert.ok(archetypeFor(topic).difficulty in BOSS_DIFFICULTIES)
})
