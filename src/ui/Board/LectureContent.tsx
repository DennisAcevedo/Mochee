import { lectureBoard } from '../../data/mockLesson'
import styles from './Board.module.css'

export function LectureContent() {
  const { heading, gantt, ticks, workingLine, result, footnote } = lectureBoard
  return (
    <>
      <div className={styles.heading}>{heading}</div>

      <div className={styles.ganttBlock}>
        <div className={styles.gantt}>
          {gantt.map((seg) => (
            <div key={seg.label} className={styles.segment} data-tone={seg.tone} style={{ flex: seg.flex }}>
              {seg.label}
            </div>
          ))}
        </div>
        <div className={styles.ticks}>
          <span className={styles.tickStart}>{ticks.start}</span>
          <span className={styles.tickMid} style={{ left: `${ticks.midPercent}%` }}>
            {ticks.mid}
          </span>
          <span className={styles.tickEnd}>{ticks.end}</span>
        </div>
      </div>

      <div className={styles.working}>
        <div>{workingLine}</div>
        <div className={styles.resultLine}>
          = <span className={styles.circled}>{result}</span>
        </div>
      </div>

      <div className={styles.footnote}>{footnote}</div>
    </>
  )
}
