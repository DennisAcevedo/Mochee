import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useParams } from 'react-router'
import { BossLayer } from '../boss'
import { preloadBlenderTutor } from '../character/blender/BlenderTutor'
import { MasteryInvite, refreshDocuments } from '../growth'
import { IntroDirector } from '../intro/IntroDirector'
import { introRef } from '../intro/targets'
import { PackDirector } from '../lesson/PackDirector'
import { StageDirector } from '../lesson/StageDirector'
import { UnlockWatcher } from '../play/UnlockWatcher'
import { LESSON_CAMERA } from '../scene/layout3d'
import { Stage } from '../scene/Stage'
import { bringLessonControlsForward, bringTranscriptForward, registerLessonControls, registerPanel } from '../scene/windows/windowStack'
import { CurrentTutorContext } from '../state/currentTutor'
import { useDrawers } from '../state/drawers'
import { useHidden, useIsHidden } from '../state/hidden'
import { useMode } from '../state/mode'
import { useWindows } from '../state/windows'
import { useLibrary, useTutor, type LessonStep, type Tutor } from '../state/library'
import { useTutorStore } from '../state/store'
import { Caption } from '../ui/Caption/Caption'
import { ReopenChip } from '../ui/Closeable/Closeable'
import { Drawers } from '../ui/Drawers/Drawers'
import { useDocs } from '../ui/Drawers/docsStore'
import { PANEL } from '../ui/Drawers/Panel'
import { InputBar } from '../ui/InputBar/InputBar'
import { ModeSwitch } from '../ui/ModeSwitch/ModeSwitch'
import { UnlockBanner } from '../ui/PlayHud/UnlockBanner'
import { CoinPill, PlayHud } from '../ui/PlayHud/PlayHud'
import { SideTranscript } from '../ui/SideTranscript/SideTranscript'
import { FocusRail, type RailItem } from '../ui/FocusRail/FocusRail'
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
// The transcript card is cut by the browser; its side column carries the z-index.
const registerTranscript = (el: HTMLElement | null) => registerPanel('transcript', el, el?.parentElement ?? null)

function Lesson({ tutor, steps }: { tutor: Tutor; steps: LessonStep[] | undefined }) {
  const touchStudied = useLibrary((s) => s.touchStudied)
  const phase = useTutorStore((s) => s.phase)
  const live = phase === 'live'
  const narrow = useNarrow()
  // Cards the learner closed for now; each leaves a chip that reopens it.
  const captionHidden = useIsHidden('caption')
  const walkHidden = useIsHidden('walkthrough')
  // Study: the step bar takes the top of the stage and the level shrinks to a
  // pill in the header. Play: the full play HUD up there, the step bar in the dock.
  const study = useMode((m) => m.mode === 'study')
  // The red light closes the browser window with no chip of its own: this one brings it back.
  const browserClosed = useWindows((s) => s.closed)
  const transcriptHidden = useIsHidden('transcript')
  // Every tutor opens with the transcript closed, even if it was open on the last one.
  useEffect(() => useHidden.getState().hide('transcript'), [tutor.id])
  // Focus: a maximized browser window takes the stage. The cards fold into a
  // rail on the left (a button peeks one back out) and the dock's talk
  // control shrinks to the mic, so the window can be as big as it gets.
  const focus = useWindows((s) => s.maximized !== null) && live
  const [peek, setPeek] = useState<RailItem | null>(null)
  useEffect(() => {
    if (!focus) setPeek(null)
  }, [focus])
  const folded = (item: RailItem) => focus && peek !== item
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

  // The "Unlocked" banner is page-level (fixed, centred), so the HUD's own copy is off.
  // Each live piece animates in as it mounts (LessonPage.module.css); the intro
  // animates the top bar and the dock itself. A closed card leaves a chip that reopens it.
  // The top of the stage: the step bar in study (closed, a chip brings it
  // back), the play HUD in play. The step bar only exists in study: play
  // keeps the lesson silent, and its arrow keys go with it.
  // Folded into the focus rail, the step bar stays mounted (display: none) for its arrow keys.
  const hud =
    live &&
    (study ? (
      <div ref={registerLessonControls} className={`${lesson.hud} ${lesson.steps} ${lesson.enter}`} data-enter="drop" onPointerDownCapture={bringLessonControlsForward} onFocusCapture={bringLessonControlsForward} style={{ '--enter-delay': '160ms' } as CSSProperties}>
        {walkHidden && !folded('top') && <ReopenChip id="walkthrough" label="Lesson controls" icon="steps" />}
        <WalkthroughBar className={`${lesson.stepBar} ${walkHidden || folded('top') ? lesson.gone : ''}`} closeable />
      </div>
    ) : (
      !folded('top') && (
        <div className={`${lesson.hud} ${lesson.enter}`} data-enter="drop" style={{ '--enter-delay': '160ms' } as CSSProperties}>
          <PlayHud banner={false} />
        </div>
      )
    ))
  // The ways back for a closed browser and closed captions: small chips in a
  // row just above the talk bar, lined up with its left edge.
  const browserChip = live && browserClosed && <ReopenChip label="Browser" icon="browser" small onOpen={() => useWindows.getState().restore('notes')} />
  const captionChip = live && captionHidden && !folded('caption') && <ReopenChip id="caption" label="Captions" icon="caption" small />
  // The conversation so far, down the right side of the stage; the learner can
  // drag it about. Closed, its chip goes to the screen's top-right corner, not
  // wherever the card was dragged.
  const transcript = live && !folded('transcript') && (
    <div className={`${lesson.side} ${lesson.enter}`} data-enter="side" onPointerDownCapture={bringTranscriptForward} onFocusCapture={bringTranscriptForward} style={{ '--enter-delay': '300ms' } as CSSProperties}>
      {transcriptHidden ? (
        createPortal(
          <div className={lesson.transcriptChip}>
            <ReopenChip id="transcript" label="Transcript" icon="transcript" />
          </div>,
          document.body,
        )
      ) : (
        <SideTranscript className={lesson.sidePanel} closeable panelRef={registerTranscript} />
      )}
    </div>
  )
  const caption = live && !folded('caption') && !captionHidden && (
    <div className={`${lesson.caption} ${lesson.enter}`} data-gg-part="caption" data-enter="up" style={{ '--enter-delay': '420ms' } as CSSProperties}>
      <Caption className={lesson.bubble} closeable />
    </div>
  )

  return (
    <CurrentTutorContext.Provider value={tutor}>
      <div ref={pageRef} className={lesson.page} data-live={live || undefined}>
        <div className={lesson.header}>
          <TopBar
            extra={
              live ? (
                <div className={`${lesson.enter} ${lesson.headerTools}`} data-enter="down" style={{ '--enter-delay': '80ms' } as CSSProperties}>
                  <CoinPill />
                  <ModeSwitch />
                </div>
              ) : null
            }
          />
        </div>
        <div ref={rowRef} className={lesson.row}>
          <div ref={frameRef} className={lesson.frame} data-gg-part="stage">
            <Stage>
              {!narrow && (hud || caption || transcript || focus) && (
                <div className={lesson.overlay}>
                  {hud}
                  {transcript}
                  {caption}
                  {focus && (
                    <div className={lesson.rail}>
                      <FocusRail study={study} peek={peek} onPeek={setPeek} />
                    </div>
                  )}
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
        {narrow && (hud || caption || transcript) && (
          <div className={lesson.below}>
            {hud}
            {caption}
            {transcript}
          </div>
        )}
        <div ref={introRef('dock')} className={lesson.dock} data-live={live || undefined}>
          {(browserChip || captionChip) && (
            <div className={lesson.dockChips}>
              {browserChip}
              {captionChip}
            </div>
          )}
          <div className={lesson.ask} data-gg-part="ask">
            <InputBar compact={focus} />
          </div>
        </div>
        {live && <Drawers />}
        {live && <UnlockBanner />}
        <StartScreen />
        <SkipButton />
        <Toast />
        <IntroDirector session={session} />
        <StageDirector />
        <UnlockWatcher />
        <PackDirector />
        <BossLayer tutorId={tutor.id} />
      </div>
    </CurrentTutorContext.Provider>
  )
}
