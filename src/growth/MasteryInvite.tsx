import '@fontsource/figtree/600.css'
import '@fontsource/figtree/800.css'
import type { CSSProperties } from 'react'
import { PALETTE } from '../scene/layout3d'
import { useGrowth } from '../state/growth'
import { useMode } from '../state/mode'
import { abilityById } from './abilities'
import styles from './MasteryInvite.module.css'
import { performAbility } from './perform'

// The invitation after a new ability is learned: shown while the stage mode
// is 'celebrate'. Nothing is forced: the student picks Play, Keep studying,
// or asks to see the new move. Place it in a positioned parent over the stage.
export function MasteryInvite() {
  const mode = useMode((s) => s.mode)
  const setMode = useMode((s) => s.setMode)
  const last = useGrowth((s) => s.lastLearned)
  const spec = last ? abilityById(last.id) : null
  if (mode !== 'celebrate' || !spec) return null

  const vars = { '--violet': PALETTE.violet, '--indigo': PALETTE.indigo, '--coral': PALETTE.coral, '--teal': PALETTE.teal, '--ink': PALETTE.ink } as CSSProperties
  return (
    <div className={styles.card} style={vars} role="dialog" aria-label="New ability learned" data-testid="mastery-invite">
      <div className={styles.kicker}>New ability</div>
      <div className={styles.title}>{spec.label}</div>
      <div className={styles.blurb}>{spec.blurb}</div>
      <div className={styles.row}>
        <button type="button" className={styles.ghost} onClick={() => performAbility(spec.id)}>
          Show me
        </button>
        <button type="button" className={styles.secondary} onClick={() => setMode('study')}>
          Keep studying
        </button>
        <button type="button" className={styles.primary} onClick={() => setMode('play')}>
          Play
        </button>
      </div>
    </div>
  )
}
