import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import { useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { openBoss } from '../boss'
import { CurrentTutorContext } from '../state/currentTutor'
import { useDrawers } from '../state/drawers'
import { useLibrary, type Tutor } from '../state/library'
import { useDocs } from '../ui/Drawers/docsStore'
import { QuizPane } from '../ui/Drawers/QuizPane'
import bossArt from './boss.png'
import s from './Hub.module.css'
import { useHub, useStudyDebug, type HubView } from './hubStore'
import { RecordPane } from './RecordPane'
import { SessionPane } from './SessionPane'
import { TeachBackPane } from './TeachBackPane'

// The Learning drawer's home (design: learning-panel.html): the Beat the boss
// card, then "or pick one" and tool rows. A row opens its pane; the back
// button returns here. The class switcher sits in the drawer's header.

type CardId = Exclude<HubView, 'home'>

const CARDS: { id: CardId; testId: string; label: string; short: string; color: string; icon: ReactNode }[] = [
  {
    id: 'teachBack',
    testId: 'hub-card-teach-back',
    label: 'Teach it back',
    short: 'Explain it to Mochee. See what clicked.',
    color: '#C4ACEB',
    icon: <path d="M5 4h14v11H9l-4 4V4ZM9 8h6M9 11h4" />,
  },
  {
    id: 'upload',
    testId: 'hub-card-upload',
    label: 'Upload materials',
    short: 'Notes, slides or papers he reads into topics.',
    color: '#8E97F0',
    icon: <path d="M12 15V4M7 9l5-5 5 5M5 15v4h14v-4" />,
  },
  {
    id: 'quiz',
    testId: 'hub-card-quiz',
    label: 'Create quiz',
    short: 'Questions from your material.',
    color: '#9FDCE5',
    icon: <path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9" />,
  },
  {
    id: 'record',
    testId: 'hub-card-record',
    label: 'Record a lecture',
    short: 'Class audio to quizzable notes.',
    color: '#FCC934',
    icon: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </>
    ),
  },
  {
    id: 'tutor',
    testId: 'hub-card-tutor',
    label: 'Start tutor session',
    short: 'He walks you through a file.',
    color: '#7FD88A',
    icon: (
      <>
        <circle cx="10" cy="8" r="3.5" />
        <path d="M3.5 20a6.5 6.5 0 0 1 13 0M18 6a4 4 0 0 1 0 5" />
      </>
    ),
  },
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
  const hub = useRef<HTMLDivElement>(null)

  // Tool cards can be below the fold; a new pane should start at its heading.
  useLayoutEffect(() => {
    const body = hub.current?.closest('#drawer-body-learning')
    if (body) body.scrollTop = 0
  }, [view])

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
    <div className={s.hub} ref={hub}>
      {view !== 'home' && (
        <div className={s.bar}>
          <button type="button" className={s.back} onClick={() => go('home')} aria-label="Back to study tools" data-testid="hub-back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <h3 className={s.viewTitle}>{TITLE[view]}</h3>
        </div>
      )}
      {view === 'home' && <Home />}
      {view === 'upload' && <div className={s.view}>{upload}</div>}
      {view === 'quiz' && (
        <div className={s.view}>
          <QuizPane />
        </div>
      )}
      {view === 'tutor' && <SessionPane tutorId={tutor?.id ?? null} />}
      {view === 'record' && <RecordPane tutorId={tutor?.id ?? null} />}
      {view === 'teachBack' && <TeachBackPane />}
    </div>
  )
}

// The class picker in the drawer's header: a small pill with the class's dot
// and name; its menu switches the lesson page to another class.
export function ClassSwitcher() {
  const current = useContext(CurrentTutorContext)
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
    <span className={s.switchWrap}>
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
        <span className={s.dot} style={{ '--c': current ? dotColor(current, idx) : '#b7b3c6', '--size': '16px' } as CSSProperties} aria-hidden />
        {/* 'CS111 · Operating Systems' -> 'CS111': the header has room for the code only. */}
        <span className={s.switcherName}>{current ? current.name.split(' · ')[0] : 'Class'}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
          <p className={s.menuHint}>Material, quizzes, bosses and the tutor session all follow the class you pick.</p>
        </div>
      )}
    </span>
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
    <div className={`${s.view} ${s.home}`} ref={ref} data-testid="hub-home">
      <span className={s.up} data-in={inView} style={{ '--i': 0 } as CSSProperties}>
        <button type="button" className={s.boss} onClick={() => openBoss(target?.id, tutorId ?? undefined)} data-testid="hub-boss">
          <span className={s.bossTag}>BOSS</span>
          <span className={s.bossTitle}>Beat the boss</span>
          <span className={s.bossLine}>
            {topics.length > 0 ? (
              <>
                A boss guards <b>{topics[0].title}</b>. Answer right to hit it.
              </>
            ) : (
              'Upload a PDF to start. Each topic in it spawns a boss.'
            )}
          </span>
          <span className={s.bossChips}>
            <span className={s.bossChip}>
              {topics.length} boss{topics.length === 1 ? '' : 'es'}
            </span>
            <span className={`${s.bossChip} ${s.bossCta}`}>{topics.length > 0 ? 'Fight!' : 'Upload PDF'}</span>
          </span>
          <img className={s.bossImg} src={bossArt} alt="" />
        </button>
      </span>
      <h3 className={s.pickLabel}>OR PICK ONE</h3>
      <div className={s.list}>
        {CARDS.map((c, i) => (
          <span key={c.id} className={s.up} data-in={inView} style={{ '--i': i + 1 } as CSSProperties}>
            <button type="button" className={s.tool} onClick={() => go(c.id)} data-testid={c.testId}>
              <span className={s.toolIco} style={{ background: c.color }} aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  {c.icon}
                </svg>
              </span>
              <span className={s.toolTxt}>
                <b>{c.label}</b>
                <span>{c.short}</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
