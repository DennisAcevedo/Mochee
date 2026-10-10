import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { LessonPack } from '../../shared/lessonPack'
import type { DocumentInfo } from '../../shared/docsTypes'
import { useLessonPack } from '../lesson/packSession'
import { useDrawers } from '../state/drawers'
import { errorText, fetchLessonPack, type DocsErrorCode } from '../ui/Drawers/docsClient'
import { useDocs } from '../ui/Drawers/docsStore'
import s from './Hub.module.css'
import { isNewThisVisit } from './hubStore'

// Start Tutor Session: pick one of this class's documents, the server writes
// (or returns the cached) lesson pack, then pick a section and start.

const SESSION = {
  stageMs: 900, // building indicator: time per stage while the pack is pending
  badgeColors: ['#7c5cf2', '#12a4b4', '#ff6b5b', '#3d5ad6', '#4cc76a', '#ff6fae'],
} as const

type Build = { phase: 'idle' } | { phase: 'building'; doc: DocumentInfo } | { phase: 'ready'; pack: LessonPack } | { phase: 'error'; error: DocsErrorCode }

const newestFirst = (a: DocumentInfo, b: DocumentInfo) => Date.parse(b.createdAt) - Date.parse(a.createdAt)

export function SessionPane({ tutorId }: { tutorId: string | null }) {
  const documents = useDocs((d) => d.documents)
  const status = useDocs((d) => d.status)
  const close = useDrawers((d) => d.close)
  const [docId, setDocId] = useState<string | null>(null)
  const [build, setBuild] = useState<Build>({ phase: 'idle' })
  const [section, setSection] = useState(0)
  const live = useRef(0) // the latest pick wins if the student clicks another doc mid-build
  const docs = [...documents].sort(newestFirst)
  const packHead = useRef<HTMLHeadingElement>(null)

  // Bring the sections into view once the pack lands (the doc list can be long).
  useEffect(() => {
    if (build.phase === 'ready') packHead.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [build.phase])

  useEffect(
    () => () => {
      live.current++
    },
    [],
  )

  const pick = async (doc: DocumentInfo) => {
    const ticket = ++live.current
    setDocId(doc.id)
    setSection(0)
    setBuild({ phase: 'building', doc })
    const res = await fetchLessonPack(doc.id)
    if (ticket !== live.current) return
    setBuild(res.ok ? { phase: 'ready', pack: res.data } : { phase: 'error', error: res.error })
  }

  const start = () => {
    if (build.phase !== 'ready') return
    useLessonPack.getState().start(build.pack, section)
    close()
  }

  if (!tutorId) return <p className={s.empty}>Open a class to start a session.</p>

  return (
    <div className={s.view}>
      <h3 className={s.kicker}>Lesson from</h3>
      {status === 'ready' && docs.length === 0 && <p className={s.empty}>Upload a PDF to start. He builds the lesson from its pages.</p>}
      {status === 'loading' && docs.length === 0 && <p className={s.muted}>Loading your material…</p>}
      {docs.length > 0 && (
        <ul className={s.rows}>
          {docs.map((d) => (
            <li key={d.id}>
              <button type="button" className={s.row} aria-pressed={d.id === docId} onClick={() => void pick(d)} data-testid={`session-doc-${d.id}`}>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>{d.title}</span>
                  <span className={s.rowMeta}>
                    {d.pageCount} page{d.pageCount === 1 ? '' : 's'} · {d.topics.length} topic{d.topics.length === 1 ? '' : 's'} ·{' '}
                    {new Date(d.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </span>
                {isNewThisVisit(d.createdAt) && <span className={s.newChip}>NEW</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {build.phase === 'building' && <Building doc={build.doc} />}
      {build.phase === 'error' && (
        <p className={s.error} role="alert">
          {errorText(build.error)}
        </p>
      )}
      {build.phase === 'ready' && (
        <>
          <h3 className={s.kicker} ref={packHead}>
            {build.pack.title}
          </h3>
          <ul className={s.rows}>
            {build.pack.sections.map((sec, i) => (
              <li key={`${i}-${sec.title}`}>
                <button type="button" className={s.row} aria-pressed={i === section} onClick={() => setSection(i)} data-testid={`session-section-${i}`}>
                  <span className={s.badge} style={{ '--c': SESSION.badgeColors[i % SESSION.badgeColors.length] } as CSSProperties} aria-hidden>
                    {i + 1}
                  </span>
                  <span className={s.rowMain}>
                    <span className={s.rowTitle}>{sec.title}</span>
                    <span className={s.rowMeta}>{sec.mins} min</span>
                  </span>
                  <span className={s.chip}>p. {sec.page}</span>
                </button>
              </li>
            ))}
            {build.pack.checkQuestionIds.length > 0 && (
              <li className={s.row} style={{ cursor: 'default' }}>
                <span className={s.badge} style={{ '--c': '#e0a100' } as CSSProperties} aria-hidden>
                  ?
                </span>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>Quick check</span>
                  <span className={s.rowMeta}>
                    {build.pack.checkQuestionIds.length} question{build.pack.checkQuestionIds.length === 1 ? '' : 's'} from your material
                  </span>
                </span>
              </li>
            )}
          </ul>
          {build.pack.sections.length === 0 ? (
            <p className={s.empty}>No topics were found in this document, so there is nothing to teach yet.</p>
          ) : (
            <button type="button" className={s.primary} onClick={start} data-testid="session-start">
              Start at section {section + 1}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function Building({ doc }: { doc: DocumentInfo }) {
  const [step, setStep] = useState(0)
  const stages = [
    `Reading all ${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'}`,
    `Finding the ${doc.topics.length} topic${doc.topics.length === 1 ? '' : 's'}`,
    'Writing the walkthrough',
    'Writing the quick check',
  ]
  useEffect(() => {
    const id = window.setInterval(() => setStep((n) => Math.min(n + 1, stages.length - 1)), SESSION.stageMs)
    return () => window.clearInterval(id)
  }, [stages.length])
  return (
    <div className={s.building} aria-live="polite" data-testid="session-building">
      <h3 className={s.kicker}>Writing a lesson from {doc.title}</h3>
      {stages.map((t, i) => (
        <span key={t} className={s.stage} data-state={i < step ? 'done' : i === step ? 'now' : 'todo'}>
          <span className={s.stageMark} aria-hidden />
          {t}
        </span>
      ))}
    </div>
  )
}
