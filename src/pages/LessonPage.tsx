import { useEffect, useMemo } from 'react'
import { Navigate, useParams } from 'react-router'
import styles from '../App.module.css'
import { IntroDirector } from '../intro/IntroDirector'
import { Stage } from '../scene/Stage'
import { CurrentTutorContext } from '../state/currentTutor'
import { useLibrary, useTutor, type LessonStep, type Tutor } from '../state/library'
import { useTutorStore } from '../state/store'
import { Board } from '../ui/Board/Board'
import { InputBar } from '../ui/InputBar/InputBar'
import { Sidebar } from '../ui/Sidebar/Sidebar'
import { SkipButton } from '../ui/Start/SkipButton'
import { StartScreen } from '../ui/Start/StartScreen'
import { Toast } from '../ui/Toast/Toast'
import { TopBar } from '../ui/TopBar/TopBar'

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

function Lesson({ tutor, steps }: { tutor: Tutor; steps: LessonStep[] | undefined }) {
  const touchStudied = useLibrary((s) => s.touchStudied)
  const phase = useTutorStore((s) => s.phase)
  const greeting = steps?.[0]?.say ?? fallbackGreeting(tutor)
  const sectionCount = tutor.outline.length
  const session = useMemo(() => ({ greeting, sectionCount }), [greeting, sectionCount])

  useEffect(() => {
    if (phase === 'intro') touchStudied(tutor.id)
  }, [phase, tutor.id, touchStudied])

  return (
    <CurrentTutorContext.Provider value={tutor}>
      <div className={styles.page}>
        <div className={styles.main}>
          <Stage>
            <TopBar />
            <Board />
            <Sidebar />
          </Stage>
          <InputBar />
        </div>
        <StartScreen />
        <SkipButton />
        <Toast />
        <IntroDirector session={session} />
      </div>
    </CurrentTutorContext.Provider>
  )
}
