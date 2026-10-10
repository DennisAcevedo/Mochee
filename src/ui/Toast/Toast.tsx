import { useTutorStore } from '../../state/store'
import styles from './Toast.module.css'

// Replaces browser alert(): a short-lived pill at the bottom of the viewport.
export function Toast() {
  const message = useTutorStore((s) => s.toast)
  const hide = useTutorStore((s) => s.hideToast)
  if (!message) return null
  return (
    <div className={styles.toast} role="status" onClick={hide}>
      {message}
    </div>
  )
}
