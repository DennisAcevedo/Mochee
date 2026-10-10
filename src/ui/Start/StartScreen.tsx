import { playIntro } from '../../intro/intro'
import { introRef } from '../../intro/targets'
import { useCurrentTutor } from '../../state/currentTutor'
import { BackButton } from '../BackButton/BackButton'
import styles from './StartScreen.module.css'

// "Start screen" from design/Tutor.dc.html. Only the HTML lives here; the
// sleeping character behind the empty slot is the one shared 3D scene, framed
// onto the slot by CameraRig. The start gradient is the stage's backdrop layer.
export function StartScreen() {
  const tutor = useCurrentTutor()
  return (
    <div ref={introRef('overlay')} className={styles.overlay} data-screen-label="Start screen">
      <BackButton className={styles.back} />
      <div className={styles.head}>
        <div ref={introRef('title')} className={styles.logo}>
          <div className={styles.logoDot} />
          Tutor
        </div>
        <div ref={introRef('subtitle')} className={styles.subtitle}>
          Your 3D tutor for {tutor.name}
        </div>
      </div>

      <div ref={introRef('slot')} className={styles.slot}>
        <div ref={introRef('zs')} className={styles.zs} aria-hidden="true">
          <span className={styles.z} data-z="1">
            z
          </span>
          <span className={styles.z} data-z="2">
            z
          </span>
          <span className={styles.z} data-z="3">
            Z
          </span>
        </div>
      </div>

      <div ref={introRef('startCta')} className={styles.cta}>
        <div className={styles.ring} />
        <div className={styles.ring} data-late="true" />
        <button ref={introRef('startButton')} type="button" className={styles.button} onClick={playIntro} aria-label="Start lesson">
          <span className={styles.icon}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13l10.5-6.5z" fill="#ffffff" stroke="#ffffff" strokeWidth="3" strokeLinejoin="round" />
            </svg>
          </span>
          Start lesson
        </button>
      </div>
    </div>
  )
}
