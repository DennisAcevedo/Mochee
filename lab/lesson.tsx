import '@fontsource/figtree/700.css'
import '@fontsource/figtree/800.css'
import { StrictMode, useEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { useShallow } from 'zustand/react/shallow'
import { lectureBoard, quiz } from '../src/data/mockLesson'
import { boardShows, notesTabs, type BoardPart } from '../src/data/stageContent'
import { useAskStatus } from '../src/lesson/askFlow'
import { useWalkthrough } from '../src/lesson/runner'
import { StageDirector } from '../src/lesson/StageDirector'
import { PALETTE } from '../src/scene/layout3d'
import { useDirector } from '../src/state/director'
import { useProgress } from '../src/state/progress'
import { useTutorStore } from '../src/state/store'
import '../src/styles/global.css'
import { Caption } from '../src/ui/Caption/Caption'
import { WalkthroughBar } from '../src/ui/Walkthrough/WalkthroughBar'

// Dev-only lab for the lesson builder: a flat 2D stand-in for the 3D room
// (notes window, board window, a tutor token that walks between spots), the
// real WalkthroughBar + Caption, the real ask box wiring, and live JSON of
// every store involved. http://localhost:5176/lab/lesson.html

declare global {
  interface Window {
    __lesson?: Record<string, unknown>
  }
}
window.__lesson = { useWalkthrough, useDirector, useTutorStore, useProgress, useAskStatus }

const SPOT_X = { left: '22%', center: '50%', right: '78%' } as const

const BOARD_LABEL: Record<BoardPart, string> = {
  heading: lectureBoard.heading,
  p1: 'P1 · 24 ms   [0 → 24]',
  p2p3: 'P2 · 3 ms [24 → 27]   P3 · 3 ms [27 → 30]',
  ticks: '0 ········· 24 ··· 30',
  working: lectureBoard.workingLine,
  result: `= ${lectureBoard.result}`,
  footnote: lectureBoard.footnote,
}

const css: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: PALETTE.wall, padding: 20, fontFamily: 'Figtree, system-ui', color: PALETTE.ink },
  head: { display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 },
  h1: { margin: 0, fontWeight: 800, fontSize: 24 },
  stage: {
    position: 'relative',
    height: 470,
    borderRadius: 28,
    background: `linear-gradient(${PALETTE.wall}, ${PALETTE.floor})`,
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06)',
    overflow: 'hidden',
  },
  win: {
    position: 'absolute',
    top: 24,
    width: '30%',
    background: '#fff',
    borderRadius: 16,
    padding: 0,
    boxShadow: '0 18px 40px -22px rgba(0,0,0,.45)',
    transition: 'transform 300ms cubic-bezier(.2,1.3,.4,1), box-shadow 300ms',
    overflow: 'hidden',
  },
  tabs: { display: 'flex', gap: 4, padding: '8px 8px 0', background: '#ece9e3' },
  body: { padding: '10px 14px 14px', fontSize: 13, fontWeight: 600, lineHeight: 1.45 },
  bottom: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 },
  panel: { background: '#fff', borderRadius: 18, padding: 14, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  pre: { margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, lineHeight: 1.45, whiteSpace: 'pre-wrap' },
}

function NotesMock() {
  const { notesTab, highlight, focus } = useDirector(useShallow((s) => ({ notesTab: s.notesTab, highlight: s.highlight, focus: s.focus })))
  const tab = notesTabs[notesTab] ?? notesTabs[0]
  const on = focus === 'notes'
  return (
    <div
      data-testid="notes"
      style={{ ...css.win, left: 16, transform: on ? 'scale(1.04)' : 'none', boxShadow: on ? `0 0 0 3px ${PALETTE.teal}, 0 18px 40px -22px rgba(0,0,0,.45)` : css.win.boxShadow }}
    >
      <div style={css.tabs}>
        {notesTabs.map((t, i) => (
          <button
            key={t.title}
            type="button"
            onClick={() => useDirector.getState().setNotesTab(i)}
            style={{
              border: 'none',
              borderRadius: '9px 9px 0 0',
              padding: '5px 8px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              background: i === notesTab ? '#fff' : 'transparent',
              color: i === notesTab ? PALETTE.ink : '#777',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '33%',
            }}
          >
            {t.title}
          </button>
        ))}
      </div>
      <div style={css.body}>
        {tab.lines.map((l) => {
          const lit = l.id === highlight
          const color = l.color ? PALETTE[l.color] : PALETTE.sun
          return (
            <div
              key={l.id}
              data-line={l.id}
              data-lit={lit}
              style={{
                padding: '3px 6px',
                margin: '2px 0',
                borderRadius: 8,
                fontWeight: l.kind === 'title' ? 800 : l.kind === 'key' ? 700 : 600,
                fontSize: l.kind === 'title' ? 15 : 13,
                background: lit ? `color-mix(in srgb, ${color} 30%, white)` : 'transparent',
                outline: lit ? `2px solid ${color}` : 'none',
                transition: 'background 200ms',
              }}
            >
              {l.cells ? l.cells.join('  ·  ') : l.text}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BoardMock() {
  const { boardReveal, focus } = useDirector(useShallow((s) => ({ boardReveal: s.boardReveal, focus: s.focus })))
  const { mode, answer, pick, setMode } = useTutorStore(useShallow((s) => ({ mode: s.mode, answer: s.answer, pick: s.pick, setMode: s.setMode })))
  const on = focus === 'board'
  return (
    <div
      data-testid="board"
      style={{ ...css.win, right: 16, transform: on ? 'scale(1.04)' : 'none', boxShadow: on ? `0 0 0 3px ${PALETTE.coral}, 0 18px 40px -22px rgba(0,0,0,.45)` : css.win.boxShadow }}
    >
      <div style={css.tabs}>
        {(['lecture', 'quiz'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{ border: 'none', borderRadius: '9px 9px 0 0', padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: mode === m ? '#fff' : 'transparent' }}
          >
            {m === 'lecture' ? 'Lecture' : 'Quick check'}
          </button>
        ))}
      </div>
      <div style={css.body}>
        {mode === 'lecture' ? (
          (Object.keys(BOARD_LABEL) as BoardPart[]).map((p) => (
            <div key={p} data-part={p} style={{ opacity: boardShows(p, boardReveal) ? 1 : 0.08, transition: 'opacity 260ms', fontWeight: p === 'result' ? 800 : 600, fontSize: p === 'result' ? 20 : 13, color: p === 'result' ? PALETTE.coral : PALETTE.ink }}>
              {BOARD_LABEL[p]}
            </div>
          ))
        ) : (
          <>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {quiz.prompt}
              <b>{quiz.bold}</b>
              {quiz.promptTail}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {quiz.options.map((o, i) => (
                <button
                  key={o}
                  type="button"
                  data-option={i}
                  onClick={() => pick(i)}
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 0',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: answer === i ? (i === quiz.correctIndex ? PALETTE.lime : PALETTE.coral) : '#f1eee8',
                    color: answer === i ? '#fff' : PALETTE.ink,
                  }}
                >
                  {o}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TutorToken() {
  const { spot, loop, gesture, fx } = useDirector(useShallow((s) => ({ spot: s.spot, loop: s.loop, gesture: s.gesture, fx: s.fx })))
  const [shownGesture, setShownGesture] = useState<string | null>(null)
  useEffect(() => {
    if (!gesture) return
    setShownGesture(gesture.clip)
    const t = setTimeout(() => setShownGesture(null), 1400)
    return () => clearTimeout(t)
  }, [gesture])
  const last = fx[fx.length - 1]
  return (
    <div
      data-testid="tutor"
      style={{ position: 'absolute', top: 190, left: SPOT_X[spot], transform: 'translateX(-50%)', transition: 'left 900ms cubic-bezier(.45,0,.25,1)', textAlign: 'center' }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          margin: '0 auto',
          borderRadius: '50% 50% 44% 44%',
          background: '#fff',
          boxShadow: `0 14px 30px -14px rgba(0,0,0,.5), inset 0 -8px 0 ${PALETTE.floor}`,
          borderTop: `14px solid ${PALETTE.violet}`,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 12,
        }}
      >
        {loop}
      </div>
      <div style={{ marginTop: 6, height: 22, fontWeight: 800, fontSize: 13, color: PALETTE.pink }}>{shownGesture ? `* ${shownGesture} *` : ''}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#777' }}>{last ? `fx: ${last.kind} @ ${last.at} (#${last.id})` : ''}</div>
    </div>
  )
}

function AskRow() {
  const { draft, mic, awaitingReply } = useTutorStore(useShallow((s) => ({ draft: s.draft, mic: s.mic, awaitingReply: s.awaitingReply })))
  const ask = useAskStatus()
  const t = useTutorStore.getState()
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
      <button
        type="button"
        data-testid="mic"
        onClick={() => (mic === 'listening' ? t.finishListening() : t.startListening())}
        style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', fontWeight: 800, color: '#fff', cursor: 'pointer', background: mic === 'listening' ? PALETTE.coral : PALETTE.teal }}
      >
        {mic === 'listening' ? 'Stop' : 'Mic'}
      </button>
      <input
        data-testid="ask"
        value={draft}
        onChange={(e) => t.setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && t.sendDraft()}
        placeholder="Ask Gemini Guy anything about this lesson..."
        style={{ flex: 1, height: 48, borderRadius: 16, border: 'none', padding: '0 16px', font: 'inherit', fontWeight: 600, background: '#fff' }}
      />
      <button type="button" data-testid="send" onClick={t.sendDraft} style={{ height: 48, padding: '0 18px', borderRadius: 16, border: 'none', fontWeight: 800, background: PALETTE.ink, color: '#fff', cursor: 'pointer' }}>
        Ask
      </button>
      <span data-testid="ask-status" style={{ fontSize: 12, fontWeight: 700, color: '#666', minWidth: 170 }}>
        {awaitingReply ? 'thinking...' : ask.source ? `last answer: ${ask.source}${ask.model ? ` (${ask.model})` : ''}` : ''}
      </span>
    </div>
  )
}

function Json() {
  const director = useDirector()
  const run = useWalkthrough()
  const tutor = useTutorStore()
  const progress = useProgress()
  const view = {
    director: { spot: director.spot, focus: director.focus, loop: director.loop, gesture: director.gesture, notesTab: director.notesTab, highlight: director.highlight, boardReveal: director.boardReveal, caption: director.caption, fx: director.fx.map((f) => `${f.kind}@${f.at}`) },
    walkthrough: { index: run.index, step: run.steps[run.index]?.id, started: run.started, playing: run.playing, phase: run.phase, lineDone: run.lineDone, held: run.held, quizResult: run.quizResult, loopOverride: run.loopOverride, muted: run.muted, reached: run.reached },
    tutor: { phase: tutor.phase, mode: tutor.mode, mic: tutor.mic, answer: tutor.answer, awaitingReply: tutor.awaitingReply, lines: tutor.lines.length },
    progress: { xp: progress.xp, level: progress.level, levelUpId: progress.levelUpId },
  }
  return (
    <pre data-testid="json" style={css.pre}>
      {JSON.stringify(view, null, 1)}
    </pre>
  )
}

function Transcript() {
  const lines = useTutorStore((s) => s.lines)
  return (
    <div style={{ maxHeight: 300, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lines.slice(-12).map((l, i) => (
        <div key={i} style={{ fontSize: 13, fontWeight: l.who === 'student' ? 800 : 600, color: l.who === 'student' ? PALETTE.indigo : PALETTE.ink }}>
          {l.who === 'student' ? 'You: ' : 'Tutor: '}
          {l.text}
        </div>
      ))}
    </div>
  )
}

function Lab() {
  useEffect(() => {
    useTutorStore.setState({ phase: 'live', introPose: null })
  }, [])
  return (
    <div style={css.page}>
      <StageDirector autoStart={false} />
      <div style={css.head}>
        <h1 style={css.h1}>Lesson lab</h1>
        <span style={{ fontWeight: 700, color: '#777' }}>walkthrough runner + Gemini ask box + captions</span>
      </div>
      <div style={css.stage}>
        <NotesMock />
        <BoardMock />
        <TutorToken />
        <Caption />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
        <WalkthroughBar />
      </div>
      <AskRow />
      <div style={css.bottom}>
        <div style={css.panel}>
          <Json />
        </div>
        <div style={css.panel}>
          <Transcript />
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
)
