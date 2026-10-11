// Tuning for the growth system: the mastery rule, persistence, return
// experiments and the scripted stage beats. Every number lives here; the
// 3D placements of the room's new items live in src/scene/evolution/config.ts.

export const GROWTH = {
  storageKey: 'geminiguy-growth',
  storageVersion: 1,

  // A topic is mastered by a first-try correct answer, or by `need` correct
  // answers among the last `window` attempts.
  mastery: { window: 3, need: 2 },

  // Return experiments become eligible at the start of the next local
  // calendar day. This query flag makes them eligible right away (dev, e2e).
  returnFlag: 'return',

  // How often the room re-reads GET /api/documents while it is mounted (ms),
  // so the books for a fresh upload appear without a reload.
  documentsPollMs: 15000,
  documentsTimeoutMs: 4000,

  // New-mastery celebration (the stage beats; the invite card waits for the student).
  celebrate: { clip: 'celebrate', fx: 'sparkles', captionMs: 3200 },
} as const

// The return experiment: he shows off the ability he learned from a topic.
export const SHOWCASE = {
  walkSeconds: 0.9,
  holdAfterSeconds: 1.2,
} as const
