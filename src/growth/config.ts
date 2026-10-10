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
  // so books and posters for a fresh upload appear without a reload.
  documentsPollMs: 15000,
  documentsTimeoutMs: 4000,

  // New-mastery celebration (the stage beats; the invite card waits for the student).
  celebrate: { clip: 'celebrate', fx: 'sparkles', captionMs: 3200 },
} as const

// The scheduler race: the real lesson's three jobs (mockLesson / stageContent:
// P1 = 24 ms, P2 = P3 = 3 ms, all arriving at 0) run under FCFS and SJF.
export const RACE = {
  jobs: [
    { id: 'P1', burst: 24, color: 'teal' },
    { id: 'P2', burst: 3, color: 'sun' },
    { id: 'P3', burst: 3, color: 'violet' },
  ] as const,
  msPerSecond: 6, // simulated ms per real second: 30 ms of work takes 5 s
  // Experiment timeline in real seconds from the start.
  beats: {
    sceneIn: 0.2,
    raceStart: 1.4,
    // raceEnd = raceStart + total burst / msPerSecond
    pointAfter: 0.3, // after the race ends, he points at the faster lane
    celebrateAfter: 1.6,
    outAfter: 3.6, // the mini scene leaves and the experiment is marked seen
  },
} as const

// The generic return experiment for topics with no purpose-built one: he
// shows off the ability he learned from that topic.
export const SHOWCASE = {
  walkSeconds: 0.9,
  holdAfterSeconds: 1.2,
} as const
