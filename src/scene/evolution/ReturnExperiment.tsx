import { Html } from '@react-three/drei'
import { Suspense, useEffect } from 'react'
import { pendingFromEarlierVisit, skipExperiment, startExperiment, useExperimentRun } from '../../growth/experiment'
import { useGrowth } from '../../state/growth'
import { useTutorStore } from '../../state/store'
import { PALETTE } from '../layout3d'
import { EXPERIMENT_SCENE as R } from './config'

// "While you were away I practised my …!" Starts a pending return experiment
// (a showcase of an ability he learned) once the lesson is live, once per
// experiment. Esc or the Skip pill ends it early; replayExperiment(id) runs
// one again. Mount once inside the Canvas.

// At most one experiment auto-starts per page visit; the rest wait for the next.
let autoStarted = false

// Starts the pending experiment (from an earlier visit) when the tutor goes live.
function useAutoStart() {
  const live = useTutorStore((s) => s.phase === 'live')
  const pending = useGrowth(() => pendingFromEarlierVisit())
  const running = useExperimentRun((s) => s.run !== null)
  useEffect(() => {
    if (!live || !pending || running || autoStarted) return
    const timer = window.setTimeout(() => {
      autoStarted = true
      startExperiment(pending)
    }, R.startDelay * 1000)
    return () => window.clearTimeout(timer)
  }, [live, pending, running])
}

function useEscToSkip(active: boolean) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skipExperiment()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}

function SkipPill() {
  return (
    <Html position={[0, R.skip.y, R.z]} center zIndexRange={[20, 10]}>
      <button
        type="button"
        data-testid="experiment-skip"
        onClick={skipExperiment}
        style={{
          height: 32,
          padding: '0 16px',
          borderRadius: 999,
          border: '1px solid rgba(29,27,36,0.12)',
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 10px 24px -14px rgba(29,27,36,0.5)',
          color: PALETTE.ink,
          font: "800 13px 'Figtree', system-ui, sans-serif",
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Skip (Esc)
      </button>
    </Html>
  )
}

export function ReturnExperiment() {
  useAutoStart()
  const run = useExperimentRun((s) => s.run)
  useEscToSkip(run !== null)
  if (!run) return null
  return (
    <Suspense fallback={null}>
      <SkipPill />
    </Suspense>
  )
}
