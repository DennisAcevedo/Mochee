import { useDrawers } from '../../state/drawers'
import s from './Drawers.module.css'
import { BookIcon, QuestIcon } from './icons'
import { LearningDrawer } from './LearningDrawer'
import { useSheetModeSync } from './Panel'
import { QuestDrawer } from './QuestDrawer'

// The app shell's two drawers, mounted once over the stage (fixed position,
// they never take layout space). On narrow screens a scrim sits behind the
// open sheet and a dock at the bottom opens either one.

export function Drawers() {
  useSheetModeSync()
  const sheet = useDrawers((d) => d.sheetMode)
  const learningOpen = useDrawers((d) => d.learningOpen)
  const questOpen = useDrawers((d) => d.questOpen)
  const open = useDrawers((d) => d.open)
  const close = useDrawers((d) => d.close)
  const anyOpen = learningOpen || questOpen

  return (
    <>
      {sheet && (
        <div
          className={s.scrim}
          data-show={anyOpen}
          aria-hidden
          onClick={() => {
            close('learning')
            close('quest')
          }}
        />
      )}
      <LearningDrawer />
      <QuestDrawer />
      {sheet && (
        <nav className={s.dock} data-hidden={anyOpen} aria-label="Drawers" inert={anyOpen}>
          <button id="drawer-dock-learning" type="button" className={s.dockBtn} data-tone="violet" onClick={() => open('learning')}>
            <BookIcon />
            Learning
          </button>
          <button id="drawer-dock-quest" type="button" className={s.dockBtn} data-tone="cobalt" onClick={() => open('quest')}>
            <QuestIcon />
            Quest
          </button>
        </nav>
      )}
    </>
  )
}

export { LearningDrawer } from './LearningDrawer'
export { QuestDrawer } from './QuestDrawer'
