import { useEffect, useMemo, type CSSProperties } from 'react'
import { Navigate, useParams } from 'react-router'
import styles from '../App.module.css'
import { preloadBlenderTutor } from '../character/blender/BlenderTutor'
import { MasteryInvite, refreshDocuments } from '../growth'
import { IntroDirector } from '../intro/IntroDirector'
import { introRef } from '../intro/targets'
import { StageDirector } from '../lesson/StageDirector'
import { LevelWatcher } from '../play/LevelWatcher'
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
import { InputBar } from '../ui/InputBar/InputBar'
import { ModeSwitch } from '../ui/ModeSwitch/ModeSwitch'
import { PlayHud } from '../ui/PlayHud/PlayHud'
import { SkipButton } from '../ui/Start/SkipButton'
import { StartScreen } from '../ui/Start/StartScreen'
import { Toast } from '../ui/Toast/Toast'
import { TopBar } from '../ui/TopBar/TopBar'
import { WalkthroughBar } from '../ui/Walkthrough/WalkthroughBar'
import lesson from './LessonPage.module.css'

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

// The lesson: the 3D room (notes + board windows, the Blender tutor, effects)
// fills the stage; the play HUD floats over the ceiling band, the caption
// over the floor, and the walkthrough bar docks above the ask box. Once live,
// the Study / Play switch joins the header and the Learning (left) and Quest
// (right) drawers fold out from the sides.
function Lesson({ tutor, steps }: { tutor: Tutor; steps: LessonStep[] | undefined }) {
  const touchStudied = useLibrary((s) => s.touchStudied)
  const phase = useTutorStore((s) => s.phase)
  const live = phase === 'live'
  // Cards the learner closed for now; each leaves a chip that reopens it.
  const hudHidden = useIsHidden('hud')
  const captionHidden = useIsHidden('caption')
  const walkHidden = useIsHidden('walkthrough')
  const greeting = steps?.[0]?.say ?? fallbackGreeting(tutor)
  const sectionCount = tutor.outline.length
  const session = useMemo(() => ({ greeting, sectionCount }), [greeting, sectionCount])

  useEffect(() => {
    if (phase === 'intro') touchStudied(tutor.id)
  }, [phase, tutor.id, touchStudied])

  // Fetch the GLB while the start screen and the intro play. The old lesson
  // panel is gone (notes and board live in the room), so nothing reserves its
  // width; the drawers start folded to their handles so both windows show.
  useEffect(() => {
    preloadBlenderTutor()
    useTutorStore.setState({ panelOpen: false })
    useDrawers.setState({ learningOpen: false, questOpen: false })
    useMode.setState({ mode: 'study' }) // a mastery celebration or play mode must not carry into the next lesson
  }, [])

  // A finished upload puts the new document's book and posters in the room now
  // (the room otherwise re-reads the list on a slow poll).
  useEffect(
    () =>
      useDocs.subscribe((s, prev) => {
        if (prev.upload && !s.upload) void refreshDocuments()
      }),
    [],
  )

  return (
    <CurrentTutorContext.Provider value={tutor}>
      <div className={styles.page}>
        <div className={styles.main}>
          <Stage>
            {/* Each live piece animates in as it mounts (LessonPage.module.css);
                the intro animates the top bar and the dock itself. */}
            <TopBar
              extra={
                live ? (
                  <div className={lesson.enter} data-enter="down" style={{ '--enter-delay': '80ms' } as CSSProperties}>
                    <ModeSwitch />
                  </div>
                ) : null
              }
            />
            {live && (
              <div className={lesson.hud}>
                <div className={lesson.enter} data-enter="drop" style={{ '--enter-delay': '160ms' } as CSSProperties}>
                  {hudHidden ? <ReopenChip id="hud" label="Play" icon="🎮" /> : <PlayHud closeable />}
                </div>
              </div>
            )}
            {live && (
              <div className={lesson.layer} data-enter="up" style={{ '--enter-delay': '420ms' } as CSSProperties}>
                {captionHidden ? (
                  <ReopenChip id="caption" label="Captions" icon="💬" className={lesson.captionChip} />
                ) : (
                  <Caption className={lesson.caption} closeable />
                )}
              </div>
            )}
            {live && (
              <div className={lesson.invite}>
                <MasteryInvite />
              </div>
            )}
            {live && <Drawers />}
          </Stage>
          <div ref={introRef('dock')} className={lesson.dock} data-live={live || undefined}>
            {/* Closed, the bar stays mounted (display: none) so its arrow keys still step the lesson. */}
            <WalkthroughBar className={`${lesson.walk} ${walkHidden ? lesson.gone : ''}`} closeable />
            {live && walkHidden && <ReopenChip id="walkthrough" label="Lesson controls" icon="▶" />}
            <InputBar />
          </div>
        </div>
        <StartScreen />
        <SkipButton />
        <Toast />
        <IntroDirector session={session} />
        <StageDirector />
        <LevelWatcher />
      </div>
    </CurrentTutorContext.Provider>
  )
}
