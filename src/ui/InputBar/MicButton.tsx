import { selectListening, selectSpeaking, useTutorStore } from '../../state/store'
import styles from './InputBar.module.css'

export function MicButton() {
  const listening = useTutorStore(selectListening)
  const speaking = useTutorStore(selectSpeaking)
  const startListening = useTutorStore((s) => s.startListening)
  const finishListening = useTutorStore((s) => s.finishListening)

  const onTap = () => (listening ? finishListening() : startListening())

  return (
    <div className={styles.micWrap}>
      {listening && (
        <>
          <div className={styles.ring} />
          <div className={styles.ring} style={{ animationDelay: '.8s' }} />
        </>
      )}
      <button
        type="button"
        className={styles.mic}
        data-speaking={speaking}
        onClick={onTap}
        aria-label={listening ? 'Stop listening' : 'Talk to the tutor'}
      >
        <div className={styles.micGlyph}>
          <div className={styles.capsule} />
          <div className={styles.cup} />
          <div className={styles.stem} />
        </div>
      </button>
    </div>
  )
}
