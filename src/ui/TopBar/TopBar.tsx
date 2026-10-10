import { Link } from 'react-router'
import { introRef } from '../../intro/targets'
import { useCurrentTutor } from '../../state/currentTutor'
import { useLayout } from '../../state/layout'
import { selectSection, useTutorStore } from '../../state/store'
import styles from './TopBar.module.css'

export function TopBar() {
  const { topBarRight } = useLayout()
  const section = useTutorStore(selectSection)
  const panelOpen = useTutorStore((s) => s.panelOpen)
  const togglePanel = useTutorStore((s) => s.togglePanel)
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

      <div className={styles.right}>
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
        {!panelOpen && (
          <button type="button" className={styles.panelButton} onClick={togglePanel}>
            <span className={styles.chevron}>‹</span>Lesson panel
          </button>
        )}
      </div>
    </div>
  )
}
