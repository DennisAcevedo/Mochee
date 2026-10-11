export type BossDifficulty = 'easy' | 'medium' | 'hard'
export const PLAYER_HP = 100
export const PLAYER_DAMAGE = 20
// Each tier asks for one more correct answer and allows one fewer mistake.
// Coins per answer rise modestly with risk: 20 / 25 / 30.
export const BOSS_DIFFICULTIES = {
  easy: { label: 'Easy', rank: 0, questions: 3, damage: 20, coinsPerAnswer: 20 },
  medium: { label: 'Medium', rank: 1, questions: 4, damage: 25, coinsPerAnswer: 25 },
  hard: { label: 'Hard', rank: 2, questions: 5, damage: 34, coinsPerAnswer: 30 },
} as const

export function bossMatch(difficulty: BossDifficulty, available: number = BOSS_DIFFICULTIES[difficulty].questions) {
  const tier = BOSS_DIFFICULTIES[difficulty]
  const questions = Math.min(tier.questions, Math.max(0, Math.floor(available)))
  return { difficulty, questions, maxHp: questions * PLAYER_DAMAGE, damage: tier.damage, coins: questions * tier.coinsPerAnswer }
}
