import { useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { openBoss } from '../boss'
import { CurrentTutorContext } from '../state/currentTutor'
import { useDrawers } from '../state/drawers'
import { useLibrary, type Tutor } from '../state/library'
import { ChatPane } from '../ui/Drawers/ChatPane'
import { useDocs } from '../ui/Drawers/docsStore'
import { QuizPane } from '../ui/Drawers/QuizPane'
import s from './Hub.module.css'
import { useHub, useStudyDebug, type HubView } from './hubStore'
import { MiniApps } from './MiniApps'
import { RecordPane } from './RecordPane'
import { SessionPane } from './SessionPane'

// The Learning drawer's home: a class switcher, the Beat the Boss hero card
// and six tool cards. A card opens its pane; the back button returns here.

const ICON = {
  upload: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
  quiz: 'M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9',
  chat: 'M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zM8 12h.01M12 12h.01M16 12h.01',
  tutor: 'M9 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8zM2 21c0-4 3.1-7 7-7s7 3 7 7M17 5.5a4 4 0 0 1 0 5M19.5 3.5a7 7 0 0 1 0 9',
  mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  apps: 'M5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11A2.5 2.5 0 0 1 5.5 4zM3 9h18M6.5 6.5h.01M9 6.5h.01',
} as const

type CardId = Exclude<HubView, 'home'>

const CARDS: { id: CardId; testId: string; label: string; short: string; grad: [string, string]; d: string }[] = [
  { id: 'upload', testId: 'hub-card-upload', label: 'Upload Materials', short: 'PDFs he reads and sorts into topics.', grad: ['#dbeafe', '#bfdbfe'], d: ICON.upload },
  { id: 'quiz', testId: 'hub-card-quiz', label: 'Create Quiz', short: 'Questions from your material.', grad: ['#ccfbf1', '#99f6e4'], d: ICON.quiz },
  { id: 'chat', testId: 'hub-card-chat', label: 'Chat with Gemini Guy', short: 'Answers that cite the page.', grad: ['#f3e8ff', '#e9d5ff'], d: ICON.chat },
  { id: 'tutor', testId: 'hub-card-tutor', label: 'Start Tutor Session', short: 'He walks you through a PDF.', grad: ['#dcfce7', '#bbf7d0'], d: ICON.tutor },
  { id: 'record', testId: 'hub-card-record', label: 'Record a Lecture', short: 'Class audio to quizzable notes.', grad: ['#fef3c7', '#fde68a'], d: ICON.mic },
  { id: 'mini', testId: 'hub-card-mini', label: 'Mini Apps', short: 'Flashcards, timer, key terms.', grad: ['#fee2e2', '#fecaca'], d: ICON.apps },
]

const TITLE: Record<CardId, string> = Object.fromEntries(CARDS.map((c) => [c.id, c.label])) as Record<CardId, string>

// Cap colour per class; the default cap is '' so it falls back to a palette colour.
const DOT_FALLBACK = ['#7c5cf2', '#12a4b4', '#ff6b5b', '#3d5ad6', '#4cc76a', '#ff6fae']
const dotColor = (t: Tutor, i: number) => t.cap || DOT_FALLBACK[i % DOT_FALLBACK.length]

export function StudyHub({ upload }: { upload: ReactNode }) {
  useStudyDebug()
  const tutor = useContext(CurrentTutorContext)
  const view = useHub((h) => h.view)
  const go = useHub((h) => h.go)
  const setTutor = useDocs((d) => d.setTutor)

  // The drawer's material follows the class of this lesson page.
  useEffect(() => {
    setTutor(tutor?.id ?? null)
  }, [tutor?.id, setTutor])

  // A new lesson page starts on the cards.
  useEffect(() => go('home'), [tutor?.id, go])

  // A citation chip (in chat or the quiz) opens its page in the reader, which
  // lives in the Upload Materials view.
  useEffect(
    () =>
      useDrawers.subscribe((d, prev) => {
        if (d.citation && d.citation !== prev.citation) go('upload')
      }),
    [go],
  )

  return (
    <div className={s.hub}>
      <div className={s.bar}>
        {view === 'home' ? (
          <ClassSwitcher current={tutor} />
        ) : (
          <>
            <button type="button" className={s.back} onClick={() => go('home')} aria-label="Back to study tools" data-testid="hub-back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <h3 className={s.viewTitle}>{TITLE[view]}</h3>
          </>
        )}
      </div>
      {view === 'home' && <Home />}
      {view === 'upload' && <div className={s.view}>{upload}</div>}
      {view === 'quiz' && (
        <div className={s.view}>
          <QuizPane />
        </div>
      )}
      {view === 'chat' && (
        <div className={s.view}>
          <ChatPane />
        </div>
      )}
      {view === 'tutor' && <SessionPane tutorId={tutor?.id ?? null} />}
      {view === 'record' && <RecordPane tutorId={tutor?.id ?? null} />}
      {view === 'mini' && <MiniApps />}
    </div>
  )
}

function ClassSwitcher({ current }: { current: Tutor | null }) {
  const tutors = useLibrary((l) => l.tutors)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const idx = Math.max(0, tutors.findIndex((t) => t.id === current?.id))

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault() // the drawer's own Esc handler skips prevented events
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const pick = (id: string) => {
    setOpen(false)
    if (id !== current?.id) navigate(`/tutor/${id}`)
  }

  const onMenuKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={s.switcher}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Class: ${current?.name ?? 'none'}. Switch class`}
        onClick={() => setOpen((o) => !o)}
        data-testid="class-switcher"
      >
        <span className={s.dot} style={{ '--c': current ? dotColor(current, idx) : '#b7b3c6', '--size': '20px' } as CSSProperties} aria-hidden />
        <span className={s.switcherName}>{current?.name ?? 'Pick a class'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label="Your classes" className={s.menu} onKeyDown={onMenuKey}>
          <span className={s.kicker} style={{ padding: '6px 10px 4px' }}>
            Your classes
          </span>
          {tutors.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={t.id === current?.id}
              className={s.menuItem}
              onClick={() => pick(t.id)}
              data-testid={`class-option-${t.id}`}
            >
              <span className={s.dot} style={{ '--c': dotColor(t, i) } as CSSProperties} aria-hidden />
              <span className={s.menuMain}>
                <span className={s.menuName}>{t.name}</span>
                <span className={s.rowMeta}>
                  {t.files.length} file{t.files.length === 1 ? '' : 's'} · {t.subject}
                </span>
              </span>
              {t.id === current?.id && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3d5ad6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>
          ))}
          <p className={s.menuHint}>Material, chat, quizzes, bosses and the tutor session all follow the class you pick.</p>
        </div>
      )}
    </>
  )
}

// Fades the cards up (staggered) the first time the grid scrolls into view.
function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, inView] as const
}

function Home() {
  const go = useHub((h) => h.go)
  const documents = useDocs((d) => d.documents)
  const tutorId = useDocs((d) => d.tutorId)
  const documentId = useDrawers((d) => d.documentId)
  const [ref, inView] = useInView<HTMLDivElement>()
  const target = documents.find((d) => d.id === documentId) ?? documents[0]
  const topics = target?.topics ?? []

  return (
    <div className={s.view} ref={ref} data-testid="hub-home">
      <h3 className={s.kicker}>What do you want to do?</h3>
      <span className={s.up} data-in={inView} style={{ '--i': 0 } as CSSProperties}>
        <button type="button" className={s.boss} onClick={() => openBoss(target?.id, tutorId ?? undefined)} data-testid="hub-boss">
          <span className={s.bossMain}>
            <span className={s.num}>( BOSS )</span>
            <span className={s.bossTitle}>Beat the Boss</span>
            <span className={s.bossLine}>
              {topics.length > 0 ? (
                <>
                  A boss guards <b>{topics[0].title}</b>. Answer right to hit it.
                </>
              ) : (
                'Upload a PDF to start. Each topic in it spawns a boss.'
              )}
            </span>
            <span className={s.pill}>
              {topics.length} boss{topics.length === 1 ? '' : 'es'}
            </span>
          </span>
          <BossArt />
        </button>
      </span>
      <div className={s.grid}>
        {CARDS.map((c, i) => (
          <span key={c.id} className={s.up} data-in={inView} style={{ '--i': i + 1 } as CSSProperties}>
            <button
              type="button"
              className={s.card}
              onClick={() => go(c.id)}
              data-testid={c.testId}
              style={{ '--g1': c.grad[0], '--g2': c.grad[1] } as CSSProperties}
            >
              <span className={s.num}>{String(i + 1).padStart(2, '0')}</span>
              <svg className={s.cardIcon} width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1d1b24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={c.d} />
              </svg>
              <span className={s.cardText}>
                <span className={s.cardLabel}>{c.label}</span>
                <span className={s.cardShort}>{c.short}</span>
              </span>
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

function BossArt() {
  return (
    <svg className={s.bossArt} viewBox="0 0 260 200" width="132" aria-hidden>
      <ellipse cx="130" cy="186" rx="104" ry="9" fill="rgba(60,40,80,0.18)" />
      <rect x="34" y="40" width="172" height="124" rx="34" fill="#55597a" />
      <rect x="34" y="40" width="172" height="58" rx="30" fill="#6b6f92" />
      <path d="M58 64 L96 76" stroke="#1d1b24" strokeWidth="7" strokeLinecap="round" />
      <path d="M150 64 L112 76" stroke="#1d1b24" strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="80" cy="90" rx="13" ry="11" fill="#ffffff" />
      <circle cx="84" cy="92" r="6" fill="#1d1b24" />
      <ellipse cx="128" cy="90" rx="13" ry="11" fill="#ffffff" />
      <circle cx="124" cy="92" r="6" fill="#1d1b24" />
      <rect x="66" y="114" width="76" height="24" rx="8" fill="#ffffff" />
      <path d="M85 114v24M104 114v24M123 114v24" stroke="#55597a" strokeWidth="3" />
      <circle cx="74" cy="168" r="16" fill="#2b2d3d" />
      <circle cx="74" cy="168" r="6" fill="#9a9db8" />
      <circle cx="168" cy="168" r="16" fill="#2b2d3d" />
      <circle cx="168" cy="168" r="6" fill="#9a9db8" />
    </svg>
  )
}
