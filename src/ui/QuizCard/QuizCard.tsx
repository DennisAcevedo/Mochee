import { feedback, quiz, quizBoard } from '../../data/mockLesson'
import { useTutorStore } from '../../state/store'
import styles from './QuizCard.module.css'

export function QuizCard() {
  const answer = useTutorStore((s) => s.answer)
  const pick = useTutorStore((s) => s.pick)

  const message =
    answer === null ? feedback.idle : answer === quiz.correctIndex ? feedback.correct : feedback.wrong

  return (
    <>
      <div className={styles.heading}>{quizBoard.heading}</div>
      <div className={styles.question}>
        {quiz.prompt}
        <b>{quiz.bold}</b>
        {quiz.promptTail}
      </div>
      <div className={styles.grid}>
        {quiz.options.map((label, i) => {
          const chosen = answer === i
          const state = chosen ? (i === quiz.correctIndex ? 'right' : 'wrong') : 'idle'
          return (
            <button key={label} type="button" className={styles.option} data-state={state} onClick={() => pick(i)}>
              {label}
            </button>
          )
        })}
      </div>
      <div className={styles.feedback}>{message}</div>
    </>
  )
}
