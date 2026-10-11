import { useEffect, useState } from 'react'
import { useDocs } from '../ui/Drawers/docsStore'
import s from './Hub.module.css'

// Mini Apps, all built from this class's real topics: flashcards (topic ->
// key terms), a 25/5 focus timer, and a key-terms sheet with page chips.

const MINI = {
  focusMin: 25,
  breakMin: 5,
} as const

type Tab = 'flash' | 'timer' | 'terms'

const TABS: { id: Tab; label: string; testId: string }[] = [
  { id: 'flash', label: 'Flashcards', testId: 'mini-flash' },
  { id: 'timer', label: 'Focus timer', testId: 'mini-timer' },
  { id: 'terms', label: 'Key terms', testId: 'mini-terms' },
]

export function MiniApps() {
  const [tab, setTab] = useState<Tab>('flash')
  return (
    <div className={s.view}>
      <div className={s.tabs} role="tablist" aria-label="Mini apps">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={s.tab} onClick={() => setTab(t.id)} data-testid={t.testId}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'flash' && <Flashcards />}
      {tab === 'timer' && <FocusTimer />}
      {tab === 'terms' && <KeyTerms />}
    </div>
  )
}

function useTopics() {
  const documents = useDocs((d) => d.documents)
  return documents.flatMap((d) => d.topics)
}

function Flashcards() {
  const topics = useTopics()
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  if (topics.length === 0) return <p className={s.empty}>Upload a PDF to start. Each topic becomes a card.</p>
  const card = topics[i % topics.length]
  return (
    <>
      <button type="button" className={s.flash} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? 'Show the topic' : 'Show the key terms'} style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
        <span className={s.flashInner} data-flipped={flipped}>
          <span className={s.face} aria-hidden={flipped}>
            {card.title}
            <span className={s.chip}>p. {card.firstPage}</span>
          </span>
          <span className={`${s.face} ${s.back3d}`} aria-hidden={!flipped}>
            {card.keywords.length > 0 ? card.keywords.join(' · ') : 'No key terms for this topic.'}
          </span>
        </span>
      </button>
      <div className={s.btnRow}>
        <span className={s.muted}>
          {(i % topics.length) + 1} / {topics.length}
        </span>
        <button type="button" className={s.ghost} onClick={() => setFlipped((f) => !f)}>
          Flip
        </button>
        <button
          type="button"
          className={s.ghost}
          onClick={() => {
            setFlipped(false)
            setI((n) => (n + 1) % topics.length)
          }}
        >
          Next
        </button>
      </div>
    </>
  )
}

function FocusTimer() {
  const [mode, setMode] = useState<'focus' | 'break'>('focus')
  const [left, setLeft] = useState<number>(MINI.focusMin * 60)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => window.clearInterval(id)
  }, [running])

  // Time up: switch focus <-> break and stop.
  useEffect(() => {
    if (left > 0 || !running) return
    setRunning(false)
    const next = mode === 'focus' ? 'break' : 'focus'
    setMode(next)
    setLeft((next === 'focus' ? MINI.focusMin : MINI.breakMin) * 60)
  }, [left, running, mode])

  const reset = () => {
    setRunning(false)
    setLeft((mode === 'focus' ? MINI.focusMin : MINI.breakMin) * 60)
  }

  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <div className={s.timer}>
      <span className={s.kicker}>{mode === 'focus' ? `Focus · ${MINI.focusMin} min` : `Break · ${MINI.breakMin} min`}</span>
      <span className={s.timerClock} role="timer" aria-live="off">
        {mm}:{ss}
      </span>
      <div className={s.btnRow}>
        <button type="button" className={s.ghost} onClick={() => setRunning((r) => !r)}>
          {running ? 'Pause' : 'Start'}
        </button>
        <button type="button" className={s.ghost} onClick={reset}>
          Reset
        </button>
      </div>
    </div>
  )
}

function KeyTerms() {
  const topics = useTopics()
  const terms = topics.flatMap((t) => t.keywords.map((k) => ({ k, page: t.firstPage, topic: t.title, id: `${t.id}:${k}` })))
  if (terms.length === 0) return <p className={s.empty}>Upload a PDF to start. Key terms come from its topics.</p>
  return (
    <ul className={s.rows}>
      {terms.map((t) => (
        <li key={t.id} className={s.row} style={{ cursor: 'default' }}>
          <span className={s.rowMain}>
            <span className={s.rowTitle}>{t.k}</span>
            <span className={s.rowMeta}>{t.topic}</span>
          </span>
          <span className={s.chip}>p. {t.page}</span>
        </li>
      ))}
    </ul>
  )
}
