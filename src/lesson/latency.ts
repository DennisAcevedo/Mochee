// Bounded, local-only diagnostics. Never store prompts, answers, or document text.
export interface LatencySample {
  id: number
  kind: 'question' | 'document' | 'speech'
  startedAt: number
  marks: Record<string, number>
  outcome?: 'complete' | 'cancelled' | 'fallback' | 'muted' | 'error'
}
export interface LatencyTrace {
  mark: (name: string) => void
  finish: (outcome: NonNullable<LatencySample['outcome']>) => void
}
const samples: LatencySample[] = []
let nextId = 0
export function startLatency(kind: LatencySample['kind']): LatencyTrace {
  const start = performance.now()
  const sample: LatencySample = { id: ++nextId, kind, startedAt: Date.now(), marks: {} }
  samples.push(sample)
  if (samples.length > 100) samples.shift()
  return {
    mark(name) {
      if (!sample.outcome && sample.marks[name] === undefined) sample.marks[name] = Math.round(performance.now() - start)
    },
    finish(outcome) {
      if (sample.outcome) return
      sample.marks.finished = Math.round(performance.now() - start)
      sample.outcome = outcome
    },
  }
}
export const latencyDiagnostics = {
  samples: () => samples.map((s) => ({ ...s, marks: { ...s.marks } })),
  clear: () => { samples.length = 0 },
}
declare global {
  interface Window { __GG_LATENCY__: typeof latencyDiagnostics }
}
if (typeof window !== 'undefined') window.__GG_LATENCY__ = latencyDiagnostics
