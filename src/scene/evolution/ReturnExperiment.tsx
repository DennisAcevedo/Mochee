import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { MathUtils, type Group, type Mesh } from 'three'
import { RACE } from '../../growth/config'
import { pendingFromEarlierVisit, skipExperiment, startExperiment, useExperimentRun, type ExperimentRun } from '../../growth/experiment'
import { formatMs, LANES, type Lane } from '../../growth/race'
import { RACE_KIND } from '../../growth/schedule'
import { secondsSince } from '../../growth/timeline'
import { useGrowth } from '../../state/growth'
import { useTutorStore } from '../../state/store'
import { PALETTE } from '../layout3d'
import { Flat } from '../windows/primitives'
import { Text as Label } from './Text'
import { FONTS } from '../windows/windowStyle'
import { RACE_SCENE as R } from './config'

// "While you were away I built a scheduler race!" Starts a pending return
// experiment once the lesson is live (once per experiment), and draws the
// race: FCFS and SJF lanes run the lesson's three jobs, a running clock, and
// each lane's waits and average wait. Esc or the Skip pill ends it early;
// replayExperiment(id) runs one again. Mount once inside the Canvas.

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

const heightOf = (burst: number) => Math.max(R.minHeight, burst * R.unit)

// Simulated ms at real seconds `t` into the run.
const simAt = (run: ExperimentRun, t: number) => MathUtils.clamp((t - run.raceStartAt) * RACE.msPerSecond, 0, Math.max(LANES[0].total, LANES[1].total))

function LaneView({ lane, x, color, sim }: { lane: Lane; x: number; color: string; sim: { ms: number } }) {
  const blocks = useRef<(Group | null)[]>([])
  const bodies = useRef<(Mesh | null)[]>([])
  const labels = useRef<(Group | null)[]>([])
  const panelH = R.panel.height
  const panelW = R.width + R.panel.pad * 2
  const railH = R.waits.y - R.baseY - panelH / 2 + 0.1

  // The queue stacks up from the CPU plate in run order; the running job
  // drains from the top, so everything above it drops as it runs.
  useFrame(() => {
    let y = R.baseY
    lane.jobs.forEach((job, i) => {
      const g = blocks.current[i]
      const body = bodies.current[i]
      const label = labels.current[i]
      if (!g || !body || !label) return
      const left = MathUtils.clamp((job.end - sim.ms) / job.burst, 0, 1)
      const h = heightOf(job.burst) * left
      g.visible = h > 0.002
      body.scale.set(1, Math.max(h, 0.001), 1)
      body.position.y = h / 2
      label.position.y = h / 2
      label.visible = h > R.label * 1.4
      g.position.y = y
      if (g.visible) y += h + R.gap
    })
  })

  const shownWaits = lane.jobs.filter((j) => j.start <= sim.ms)
  const allStarted = shownWaits.length === lane.jobs.length
  return (
    <group position={[x, 0, R.z]}>
      <Flat w={panelW} h={panelH} r={R.panel.radius} color="#ffffff" opacity={R.panel.opacity} position={[0, (R.title.y + R.waits.y) / 2 - 0.02, -0.2]} />
      {/* Rails either side of the lane, from the CPU up to the header card. */}
      {[-1, 1].map((side) => (
        <Flat
          key={side}
          w={R.rail.width}
          h={railH}
          color={PALETTE[R.rail.color]}
          opacity={R.rail.opacity}
          position={[side * (R.width / 2 + 0.05), R.baseY + railH / 2, -0.16]}
        />
      ))}
      <Flat w={panelW * 0.62} h={R.title.size * 1.6} r={R.title.size * 0.8} color={color} position={[0, R.title.y, -0.19]} />
      <Label size={R.title.size} color="#ffffff" anchorX="center" position={[0, R.title.y, -0.185]}>
        {lane.policy}
      </Label>
      <Label size={R.avg.size} font={FONTS.bold} color={PALETTE.ink} anchorX="center" position={[0, R.avg.y, -0.185]}>
        {allStarted ? `avg wait ${formatMs(lane.avgWait)}` : 'avg wait …'}
      </Label>
      <Label size={R.waits.size} font={FONTS.mono} color="#6b6776" anchorX="center" position={[0, R.waits.y, -0.185]}>
        {`waits ${shownWaits.map((j) => j.wait).join(' + ') || '…'}`}
      </Label>
      {/* CPU plate */}
      <mesh position={[0, R.baseY - R.cpu.height / 2, 0]}>
        <boxGeometry args={[R.width + 0.08, R.cpu.height, 0.34]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={0.5} />
      </mesh>
      <Label size={0.05} color="#ffffff" anchorX="center" letterSpacing={0.15} position={[0, R.baseY - R.cpu.height / 2, 0.172]}>
        CPU
      </Label>
      {lane.jobs.map((job, i) => (
        <group key={job.id} ref={(g) => void (blocks.current[i] = g)}>
          <mesh ref={(m) => void (bodies.current[i] = m)} castShadow>
            <boxGeometry args={[R.width, 1, 0.3]} />
            <meshStandardMaterial color={PALETTE[job.color]} roughness={0.4} />
          </mesh>
          <group ref={(g) => void (labels.current[i] = g)}>
            <Label size={R.label} color={job.color === 'sun' ? PALETTE.ink : '#ffffff'} anchorX="center" position={[0, 0, 0.152]}>
              {`${job.id} · ${job.burst}`}
            </Label>
          </group>
        </group>
      ))}
    </group>
  )
}

function RaceScene({ run }: { run: ExperimentRun }) {
  const root = useRef<Group>(null)
  const sim = useRef({ ms: 0 }).current
  const [ms, setMs] = useState(0)

  useFrame(() => {
    const t = secondsSince(run.startedAt)
    sim.ms = simAt(run, t)
    const whole = Math.floor(sim.ms)
    if (whole !== ms) setMs(whole)
    const inK = MathUtils.clamp((t - RACE.beats.sceneIn) / R.inFor, 0, 1)
    const outK = MathUtils.clamp((run.endsAt - t) / R.outFor, 0, 1)
    const s = Math.min(1 - (1 - inK) ** 3 * Math.cos(inK * 3), outK)
    root.current?.scale.setScalar(Math.max(s, 0.0001))
  }, -1)

  return (
    <group ref={root} scale={0.0001}>
      {LANES.map((lane, i) => (
        <LaneView key={lane.policy} lane={lane} x={R.lanes[i].x} color={PALETTE[R.lanes[i].color]} sim={sim} />
      ))}
      <group position={[0, R.clock.y, R.z - 0.2]}>
        <Flat w={1.05} h={R.clock.size * 2} r={R.clock.size} color={PALETTE.indigo} />
        <Label size={R.clock.size} font={FONTS.monoBold} color="#ffffff" anchorX="center" position={[0, 0, 0.004]}>
          {`t = ${ms} ms`}
        </Label>
      </group>
    </group>
  )
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
      {run.experiment.kind === RACE_KIND && <RaceScene key={run.runId} run={run} />}
      <SkipPill />
    </Suspense>
  )
}
