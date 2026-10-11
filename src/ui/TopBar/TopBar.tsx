import type { ReactNode } from 'react'
import { introRef } from '../../intro/targets'
import { useCurrentTutor } from '../../state/currentTutor'
import { selectSection, useTutorStore } from '../../state/store'
import { BackButton } from '../BackButton/BackButton'
import styles from './TopBar.module.css'

// The lesson header, in its own row above the stage: All tutors, the one-line
// heading (course and current section, ellipsized rather than wrapped), and
// on the right `extra` (the Study / Play pill) beside the section counter.
// On narrow screens the right group wraps to a second row.
export function TopBar({ extra }: { extra?: ReactNode }) {
  const section = useTutorStore(selectSection)
  const tutor = useCurrentTutor()
  const outline = tutor.outline

  return (
    <header ref={introRef('topBar')} className={styles.bar} data-gg-part="header">
      <div className={styles.left}>
        <BackButton />
        <h1 className={styles.crumb} data-gg-part="heading" title={`${tutor.name} · ${outline[section]?.title ?? ''}`}>
          {tutor.name} · <span className={styles.crumbStrong}>{outline[section]?.title}</span>
        </h1>
      </div>

      <div className={styles.right}>
        {extra}
        <div className={styles.progress} data-gg-part="section">
          Section {section + 1} of {outline.length}
          <div className={styles.pips}>
            {outline.map((o, i) => (
              <div
                key={o.title}
                className={styles.pip}
                data-state={i === section ? 'current' : i < section ? 'done' : 'todo'}
              />
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
