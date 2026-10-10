import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { PALETTE } from '../../scene/layout3d'
import { useDrawers, type QuestTab } from '../../state/drawers'
import { ChatPane } from './ChatPane'
import { QuestIcon } from './icons'
import { Panel } from './Panel'
import s from './Quest.module.css'
import { QuestPane } from './QuestPane'
import { QuizPane } from './QuizPane'

// RIGHT drawer: what to do next. A pill switch picks Quest (lesson checklist,
// mastery, learned moves, next unlock), Chat (grounded answers about the
// selected document) or Quiz (one question at a time from it).

const TABS: { id: QuestTab; label: string }[] = [
  { id: 'quest', label: 'Quest' },
  { id: 'chat', label: 'Chat' },
  { id: 'quiz', label: 'Quiz' },
]

export function QuestDrawer() {
  const tab = useDrawers((d) => d.questTab)
  return (
    <Panel id="quest" side="right" title="Quest" accent={PALETTE.indigo} icon={<QuestIcon />}>
      <TabSwitch />
      <div role="tabpanel" id={`quest-panel-${tab}`} aria-labelledby={`quest-tab-${tab}`} className={s.tabPanel}>
        {tab === 'quest' && <QuestPane />}
        {tab === 'chat' && <ChatPane />}
        {tab === 'quiz' && <QuizPane />}
      </div>
    </Panel>
  )
}

function TabSwitch() {
  const tab = useDrawers((d) => d.questTab)
  const setTab = useDrawers((d) => d.setTab)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = TABS.findIndex((t) => t.id === tab)

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (index + step + TABS.length) % TABS.length
    if (!step && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    setTab(TABS[to].id)
    refs.current[to]?.focus()
  }

  return (
    <div className={s.tabs} role="tablist" aria-label="Quest views" onKeyDown={onKeyDown} style={{ '--i': index, '--n': TABS.length } as CSSProperties}>
      <span className={s.thumb} aria-hidden />
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          id={`quest-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={t.id === tab}
          aria-controls={`quest-panel-${t.id}`}
          tabIndex={t.id === tab ? 0 : -1}
          className={s.tabBtn}
          onClick={() => setTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
