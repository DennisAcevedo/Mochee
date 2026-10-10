import { lectureBoard, quizBoard } from '../../data/mockLesson'
import { introRef } from '../../intro/targets'
import { useLayout } from '../../state/layout'
import { selectIsQuiz, useTutorStore } from '../../state/store'
import { QuizCard } from '../QuizCard/QuizCard'
import styles from './Board.module.css'
import { LectureContent } from './LectureContent'

export function Board() {
  const { boardW, boardRight } = useLayout()
  const isQuiz = useTutorStore(selectIsQuiz)
  const sectionLabel = isQuiz ? quizBoard.sectionLabel : lectureBoard.sectionLabel

  return (
    <div ref={introRef('board')} className={styles.wrap} style={{ width: boardW, right: boardRight }}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span>Board</span>
          <span className={styles.headerSection}>{sectionLabel}</span>
        </div>
        {isQuiz ? <QuizCard /> : <LectureContent />}
      </div>
    </div>
  )
}
