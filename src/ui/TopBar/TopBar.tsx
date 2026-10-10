import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { introRef } from '../../intro/targets'
import { useCurrentTutor } from '../../state/currentTutor'
import { useLayout } from '../../state/layout'
import { selectSection, useTutorStore } from '../../state/store'
import styles from './TopBar.module.css'

// `extra` (the lesson's mode switch) sits on top of the right-hand group,
// above the section progress, so the row stays clear of the centred play HUD.
export function TopBar({ extra }: { extra?: ReactNode }) {
  const { topBarRight } = useLayout()
  const section = useTutorStore(selectSection)
  const tutor = useCurrentTutor()
  const outline = tutor.outline

  return (
    <div ref={introRef('topBar')} className={styles.bar} style={{ right: topBarRight }}>
      <div className={styles.left}>
        <Link to="/" className={styles.logo} aria-label="Home">
          <div className={styles.logoDot} />
          Tutor
        </Link>
        <div className={styles.divider} />
        <div className={styles.crumb}>
          {tutor.name} · <span className={styles.crumbStrong}>{outline[section]?.title}</span>
        </div>
      </div>

      <div className={styles.right} data-stack={extra ? true : undefined}>
        {extra}
        <div className={styles.progress}>
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
    </div>
  )
}
