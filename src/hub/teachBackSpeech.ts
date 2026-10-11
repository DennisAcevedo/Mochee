import type { TeachBackResult } from '../../shared/teachBack.ts'

// One paragraph, at most 75 words, and the score is always the server's score.
export function teachBackSpeech(result: TeachBackResult): string {
  const summary = result.summary.replace(/\s+/g, ' ').trim()
  const sentences = summary.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []
  let reason = ''
  for (const sentence of sentences) {
    if ((reason + sentence).split(/\s+/).filter(Boolean).length > 65) break
    reason += sentence
  }
  if (!reason.trim()) reason = summary.split(/\s+/).slice(0, 65).join(' ').replace(/[,:;]$/, '') + '.'
  return `You scored ${result.score} out of 100. ${reason.trim()}`
}
