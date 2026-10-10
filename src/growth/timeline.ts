// A cancellable list of timed callbacks: the scripted beats of an ability or
// a return experiment. Times are seconds from the start; the same script
// always fires the same beats in the same order.

export type Step = [number, () => void]

export function runTimeline(steps: Step[]): () => void {
  const timers = [...steps]
    .sort((a, b) => a[0] - b[0])
    .map(([at, fn]) => window.setTimeout(fn, Math.max(0, at * 1000)))
  return () => timers.forEach((t) => window.clearTimeout(t))
}

// Seconds since a performance.now() timestamp, for frame-driven props that
// must stay in step with the timeline.
export function secondsSince(startedAt: number): number {
  return (performance.now() - startedAt) / 1000
}
