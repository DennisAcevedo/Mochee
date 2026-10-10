import '@fontsource/figtree/600.css'
import '@fontsource/figtree/800.css'
import { Canvas } from '@react-three/fiber'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ACESFilmicToneMapping } from 'three'
import { RENDER } from '../src/animation/config'
import { BlenderTutorSafe } from '../src/character/blender/BlenderTutorSafe'
import { ABILITIES } from '../src/growth/abilities'
import { replayExperiment, skipExperiment, useExperimentRun } from '../src/growth/experiment'
import { MasteryInvite } from '../src/growth/MasteryInvite'
import { performAbility, useAbilityRun } from '../src/growth/perform'
import { allTopics, BUILTIN_TOPIC_REF, sampleDocument, useRoomDocs } from '../src/growth/topics'
import { FxLayer } from '../src/scene/fx/FxLayer'
import { AbilityProps, ReturnExperiment, RoomEvolution } from '../src/scene/evolution'
import { LESSON_CAMERA, PALETTE } from '../src/scene/layout3d'
import { Lights } from '../src/scene/Lights'
import { LessonRoom } from '../src/scene/room/LessonRoom'
import { useDirector } from '../src/state/director'
import { useGrowth } from '../src/state/growth'
import { useMode } from '../src/state/mode'
import { useTutorStore } from '../src/state/store'
import '../src/styles/global.css'
import { Caption } from '../src/ui/Caption/Caption'

// Dev-only lab for the growth system (not in the production build): the
// white-box room, the room evolution, the Blender tutor, ability props and
// the return experiment, with buttons to answer, perform, add documents and
// come back with ?return=1. window.__growth / __director / __docs / __lab let
// scripts drive it.

declare global {
  interface Window {
    __growth: typeof useGrowth
    __director: typeof useDirector
    __docs: typeof useRoomDocs
    __lab: {
      performAbility: typeof performAbility
      replayExperiment: typeof replayExperiment
      skipExperiment: typeof skipExperiment
      addDoc: () => void
      abilityT: () => number // seconds into the running ability, -1 if none
      experimentT: () => number // seconds into the running experiment, -1 if none
    }
  }
}

let docCount = 0
const addDoc = () => useRoomDocs.getState().addLocalDocument(sampleDocument(docCount++))

window.__growth = useGrowth
window.__director = useDirector
window.__docs = useRoomDocs
const since = (run: { startedAt: number } | null) => (run ? (performance.now() - run.startedAt) / 1000 : -1)
window.__lab = {
  performAbility,
  replayExperiment,
  skipExperiment,
  addDoc,
  abilityT: () => since(useAbilityRun.getState().run),
  experimentT: () => since(useExperimentRun.getState().run),
}

const panel: CSSProperties = {
  position: 'fixed',
  left: 12,
  top: 12,
  width: 300,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '12px 14px',
  borderRadius: 18,
  background: 'rgba(255,255,255,0.86)',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 12px 30px -16px rgba(40,40,50,0.45)',
  font: "700 12px 'Figtree', system-ui, sans-serif",
  color: PALETTE.ink,
  zIndex: 9,
}

function Btn({ color = PALETTE.violet, onClick, children, id }: { color?: string; onClick: () => void; children: ReactNode; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      style={{ height: 28, padding: '0 11px', borderRadius: 999, border: `2px solid ${color}`, background: '#fff', color: PALETTE.ink, font: 'inherit', cursor: 'pointer' }}
    >
      {children}
    </button>
  )
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <div style={{ color: '#8a857d', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{children}</div>
  </div>
)

function Controls() {
  const docs = useRoomDocs()
  const topics = allTopics(docs)
  const growth = useGrowth()
  const mode = useMode((s) => s.mode)
  const running = useExperimentRun((s) => s.run?.experiment.title ?? null)
  const [topicId, setTopicId] = useState(BUILTIN_TOPIC_REF.id)
  const topic = topics.find((t) => t.id === topicId) ?? topics[0]
  const answer = (correct: boolean) => growth.recordAnswer({ id: topic.id, title: topic.title, documentId: topic.documentId }, correct)
  const pending = growth.pendingExperiment()
  const returnUrl = `${location.pathname}?return=1`

  return (
    <div style={panel}>
      <div style={{ font: "800 16px 'Figtree', system-ui" }}>Growth lab</div>
      <Row label="Topic">
        <select value={topic.id} onChange={(e) => setTopicId(e.target.value)} style={{ font: 'inherit', borderRadius: 8, padding: 3, maxWidth: 270 }}>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Quiz answer">
        <Btn id="answer-right" color={PALETTE.lime} onClick={() => answer(true)}>
          Right
        </Btn>
        <Btn id="answer-wrong" color={PALETTE.coral} onClick={() => answer(false)}>
          Wrong
        </Btn>
      </Row>
      <Row label="Perform ability">
        {ABILITIES.map((a) => (
          <Btn key={a.id} color={growth.abilities.some((l) => l.id === a.id) ? PALETTE.violet : '#c9c6cf'} onClick={() => performAbility(a.id)}>
            {a.label}
          </Btn>
        ))}
      </Row>
      <Row label="Documents">
        <Btn id="add-doc" color={PALETTE.teal} onClick={addDoc}>
          Add sample doc
        </Btn>
        <Btn color="#c9c6cf" onClick={() => useRoomDocs.getState().clearLocal()}>
          Clear
        </Btn>
      </Row>
      <Row label="Return">
        <Btn id="go-return" color={PALETTE.indigo} onClick={() => location.assign(returnUrl)}>
          Come back (?return=1)
        </Btn>
        {growth.experiments.map((e) => (
          <Btn key={e.id} color={PALETTE.sun} onClick={() => replayExperiment(e.id)}>
            Replay {e.topicTitle}
          </Btn>
        ))}
      </Row>
      <Row label="State">
        <span>
          mastered {Object.values(growth.topics).filter((t) => t.mastered).length} · abilities {growth.abilities.length} · experiments {growth.experiments.length}
          {pending ? ` · pending ${pending.kind}` : ''} · mode {mode} · docs {docs.status}
          {running ? ` · running "${running}"` : ''}
        </span>
      </Row>
      <Row label="Reset">
        <Btn
          color="#c9c6cf"
          onClick={() => {
            useGrowth.getState().resetGrowth()
            useMode.getState().setMode('study')
          }}
        >
          Reset growth
        </Btn>
      </Row>
    </div>
  )
}

function App() {
  // The return experiment waits for the lesson to be live.
  useEffect(() => useTutorStore.getState().setPhase('live'), [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#ece9e3' }}>
      <Canvas
        shadows="soft"
        dpr={[1, RENDER.maxDpr]}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: RENDER.exposure }}
        camera={{ fov: LESSON_CAMERA.fov, near: 0.1, far: 100, position: LESSON_CAMERA.position }}
        onCreated={({ camera }) => camera.lookAt(...LESSON_CAMERA.lookAt)}
      >
        <Lights />
        <LessonRoom />
        <RoomEvolution />
        <BlenderTutorSafe />
        <AbilityProps />
        <ReturnExperiment />
        <FxLayer />
      </Canvas>
      <Caption />
      <MasteryInvite />
      <Controls />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
