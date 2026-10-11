import { useDrawers } from '../../state/drawers'
import s from './Drawers.module.css'
import { BookIcon } from './icons'
import { LearningDrawer } from './LearningDrawer'
import { useSheetModeSync } from './Panel'

// The app shell's Learning drawer, mounted once over the stage (fixed
// position, it never takes layout space). On narrow screens a scrim sits
// behind the open sheet and a dock at the bottom opens it.

export function Drawers() {
  useSheetModeSync()
  const sheet = useDrawers((d) => d.sheetMode)
  const learningOpen = useDrawers((d) => d.learningOpen)
  const open = useDrawers((d) => d.open)
  const close = useDrawers((d) => d.close)

  return (
    <>
      {sheet && <div className={s.scrim} data-show={learningOpen} aria-hidden onClick={close} />}
      <LearningDrawer />
      {sheet && (
        <nav className={s.dock} data-hidden={learningOpen} aria-label="Drawers" inert={learningOpen}>
          <button id="drawer-dock-learning" type="button" className={s.dockBtn} onClick={open}>
            <BookIcon />
            Learning
          </button>
        </nav>
      )}
    </>
  )
}
