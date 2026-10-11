import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type RefObject } from 'react'
import { Navigate, useParams } from 'react-router'
import { BossLayer } from '../boss'
import { preloadBlenderTutor } from '../character/blender/BlenderTutor'
import { MasteryInvite, refreshDocuments } from '../growth'
import { IntroDirector } from '../intro/IntroDirector'
import { introRef } from '../intro/targets'
import { PackDirector } from '../lesson/PackDirector'
import { StageDirector } from '../lesson/StageDirector'
import { LevelWatcher } from '../play/LevelWatcher'
import { LESSON_CAMERA } from '../scene/layout3d'
import { Stage } from '../scene/Stage'
import { CurrentTutorContext } from '../state/currentTutor'
import { useDrawers } from '../state/drawers'
import { useIsHidden } from '../state/hidden'
import { useMode } from '../state/mode'
import { useLibrary, useTutor, type LessonStep, type Tutor } from '../state/library'
import { useTutorStore } from '../state/store'
import { Caption } from '../ui/Caption/Caption'
import { ReopenChip } from '../ui/Closeable/Closeable'
import { Drawers } from '../ui/Drawers/Drawers'
import { useDocs } from '../ui/Drawers/docsStore'
import { PANEL } from '../ui/Drawers/Panel'
import { InputBar } from '../ui/InputBar/InputBar'
import { ModeSwitch } from '../ui/ModeSwitch/ModeSwitch'
import { LevelUpBanner } from '../ui/PlayHud/LevelUpBanner'
import { PlayHud } from '../ui/PlayHud/PlayHud'
import { SkipButton } from '../ui/Start/SkipButton'
import { StartScreen } from '../ui/Start/StartScreen'
import { Toast } from '../ui/Toast/Toast'
import { TopBar } from '../ui/TopBar/TopBar'
import { WalkthroughBar } from '../ui/Walkthrough/WalkthroughBar'
import lesson from './LessonPage.module.css'

// Stage frame sizing. The frame is letterboxed at the 3D camera's aspect into
// the space the header and the dock leave; maxWidth only stops it growing
// silly on very wide screens. It draws nothing (the scene is full-bleed): it
// is where the lesson shot lands, so the browser window and the tutor fit between
// the bars at any window size, and the scene carries on past it to the edges.
const FRAME = {
  aspect: LESSON_CAMERA.aspect,
  maxWidth: 1760,
} as const

// /tutor/:id: start screen, intro, lesson.
export function LessonPage() {
  const { id } = useParams()
  const tutor = useTutor(id)
  const steps = useLibrary((s) => (id ? s.steps[id] : undefined))
  if (!tutor) return <Navigate to="/" replace />
  return <Lesson key={tutor.id} tutor={tutor} steps={steps} />
}

// Tutors without a generated lesson yet still get a greeting that fits.
function fallbackGreeting(tutor: Tutor) {
  const topic = tutor.name.split(' · ')[1] ?? tutor.name
  const first = tutor.outline[Math.min(1, tutor.outline.length - 1)]?.title ?? 'the basics'
  return `Oh! Hi, I'm awake. Today is ${topic}, starting with ${first}.`
}

// Phones (the drawers' sheet breakpoint): the stage is too small to carry the
// HUD and caption inside it, so they flow below it instead.
const narrowQuery = typeof window === 'undefined' ? null : window.matchMedia(PANEL.sheetQuery)
const subscribeNarrow = (cb: () => void) => {
  narrowQuery?.addEventListener('change', cb)
  return () => narrowQuery?.removeEventListener('change', cb)
}
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => narrowQuery?.matches ?? false)

// Fits the frame to its row at the camera's aspect, and publishes where the
// stage sits as CSS variables on the page (the drawers dock their handles
// beside it; the header and dock match its width).
function useStageFrame(page: RefObject<HTMLDivElement | null>, row: RefObject<HTMLDivElement | null>, frame: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const p = page.current
    const r = row.current
    const f = frame.current
    if (!p || !r || !f) return
    let raf = 0
    const fit = () => {
      raf = 0
      if (!narrowQuery?.matches) {
        const cs = getComputedStyle(r)
        const w = r.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        const h = r.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
        const fw = Math.max(0, Math.floor(Math.min(w, h * FRAME.aspect, FRAME.maxWidth)))
        f.style.setProperty('--frame-w', `${fw}px`)
        f.style.setProperty('--frame-h', `${fw / FRAME.aspect}px`)
      }
      const b = f.getBoundingClientRect()
      p.style.setProperty('--stage-left', `${b.left}px`)
      p.style.setProperty('--stage-top', `${b.top}px`)
      p.style.setProperty('--stage-w', `${b.width}px`)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(fit)
    }
    fit()
    const ro = new ResizeObserver(schedule)
    ro.observe(p)
    ro.observe(r)
    ro.observe(f)
    window.addEventListener('resize', schedule)
    narrowQuery?.addEventListener('change', schedule)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      narrowQuery?.removeEventListener('change', schedule)
      cancelAnimationFrame(raf)
    }
  }, [page, row, frame])
}

// The lesson, top to bottom: the header row; the stage, a 16:9 frame
// letterboxed into the space left over, with the play HUD inside its top and
// the caption inside its bottom (both scale with it); then the dock (the
// walkthrough bar and the ask box). The scene itself fills the whole window
// behind all of them. The Learning drawer's handle sits beside the stage on
// the left. On phones the HUD and caption move below the stage and the
// drawer opens from a dock at the end of the page.
function Lesson({ tutor, steps }: { tutor: Tutor; steps: LessonStep[] | undefined }) {
  const touchStudied = useLibrary((s) => s.touchStudied)
  const phase = useTutorStore((s) => s.phase)
  const live = phase === 'live'
  const narrow = useNarrow()
  // Cards the learner closed for now; each leaves a chip that reopens it.
  const hudHidden = useIsHidden('hud')
  const captionHidden = useIsHidden('caption')
  const walkHidden = useIsHidden('walkthrough')
  const greeting = steps?.[0]?.say ?? fallbackGreeting(tutor)
  const sectionCount = tutor.outline.length
  const session = useMemo(() => ({ greeting, sectionCount }), [greeting, sectionCount])
  const pageRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  useStageFrame(pageRef, rowRef, frameRef)

  useEffect(() => {
    if (phase === 'intro') touchStudied(tutor.id)
  }, [phase, tutor.id, touchStudied])

  // Fetch the GLB while the start screen and the intro play. The drawer
  // starts folded to its handle so the browser window shows.
  useEffect(() => {
    preloadBlenderTutor()
    useTutorStore.setState({ panelOpen: false })
    useDrawers.setState({ learningOpen: false })
    useMode.setState({ mode: 'study' }) // a mastery celebration or play mode must not carry into the next lesson
  }, [])

  // A finished upload puts the new document's book and posters on the stage
  // now (the stage otherwise re-reads the list on a slow poll).
  useEffect(
    () =>
      useDocs.subscribe((s, prev) => {
        if (prev.upload && !s.upload) void refreshDocuments()
      }),
    [],
  )

  // The level-up banner is page-level (fixed, centred), so the HUD's own copy is off.
  // Each live piece animates in as it mounts (LessonPage.module.css); the intro
  // animates the top bar and the dock itself. A closed card leaves a chip that reopens it.
  const hud = live && (
    <div className={`${lesson.hud} ${lesson.enter}`} data-enter="drop" style={{ '--enter-delay': '160ms' } as CSSProperties}>
      {hudHidden ? <ReopenChip id="hud" label="Levels" /> : <PlayHud banner={false} closeable />}
    </div>
  )
  const caption = live && (
    <div className={`${lesson.caption} ${lesson.enter}`} data-gg-part="caption" data-enter="up" style={{ '--enter-delay': '420ms' } as CSSProperties}>
      {captionHidden ? <ReopenChip id="caption" label="Captions" icon="💬" /> : <Caption className={lesson.bubble} closeable />}
    </div>
  )

  return (
    <CurrentTutorContext.Provider value={tutor}>
      <div ref={pageRef} className={lesson.page} data-live={live || undefined}>
        <div className={lesson.header}>
          <TopBar
            extra={
              live ? (
                <div className={lesson.enter} data-enter="down" style={{ '--enter-delay': '80ms' } as CSSProperties}>
                  <ModeSwitch />
                </div>
              ) : null
            }
          />
        </div>
        <div ref={rowRef} className={lesson.row}>
          <div ref={frameRef} className={lesson.frame} data-gg-part="stage">
            <Stage>
              {!narrow && (hud || caption) && (
                <div className={lesson.overlay}>
                  {hud}
                  {caption}
                </div>
              )}
              {live && (
                <div className={lesson.invite}>
                  <MasteryInvite />
                </div>
              )}
            </Stage>
          </div>
        </div>
        {narrow && (hud || caption) && (
          <div className={lesson.below}>
            {hud}
            {caption}
          </div>
        )}
        <div ref={introRef('dock')} className={lesson.dock} data-live={live || undefined}>
          {/* Closed, the bar stays mounted (display: none) so its arrow keys still step the lesson. */}
          <WalkthroughBar className={`${lesson.walk} ${walkHidden ? lesson.gone : ''}`} closeable />
          {live && walkHidden && <ReopenChip id="walkthrough" label="Lesson controls" icon="▶" />}
          <div className={lesson.ask} data-gg-part="ask">
            <InputBar />
          </div>
        </div>
        {live && <Drawers />}
        {live && <LevelUpBanner />}
        <StartScreen />
        <SkipButton />
        <Toast />
        <IntroDirector session={session} />
        <StageDirector />
        <LevelWatcher />
        <PackDirector />
        <BossLayer tutorId={tutor.id} />
      </div>
    </CurrentTutorContext.Provider>
  )
}
