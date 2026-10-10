import { useBoss } from './bossStore'

// Beat the Boss public surface. Mount <BossLayer /> once (LessonPage) and
// <BossArena /> once inside the stage's canvas (Stage.tsx), and call openBoss()
// from the study hub's hero card. A documentId skips the doc pick.
export { BossLayer } from './BossLayer'
export { BossArena } from './arena/BossArena'
export { useBoss } from './bossStore'
export { useBossMastery } from './mastery'

export function openBoss(documentId?: string, tutorId?: string): void {
  void useBoss.getState().open(documentId, tutorId)
}
