// Tuning for the growth system: the mastery rule, persistence and the
// mastery cheer. Every number lives here; the
// 3D placements of the room's new items live in src/scene/evolution/config.ts.

export const GROWTH = {
  storageKey: 'geminiguy-growth',
  storageVersion: 1,

  // A topic is mastered by a first-try correct answer, or by `need` correct
  // answers among the last `window` attempts.
  mastery: { window: 3, need: 2 },

  // How often the room re-reads GET /api/documents while it is mounted (ms),
  // so the books for a fresh upload appear without a reload.
  documentsPollMs: 15000,
  documentsTimeoutMs: 4000,

  // The cheer when a topic is mastered (celebrate.ts).
  celebrate: { clip: 'celebrate', fx: 'sparkles', captionMs: 3200 },
} as const

