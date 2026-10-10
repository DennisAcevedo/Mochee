import { useState, type CSSProperties } from 'react'
import { abilityById } from '../../growth/abilities'
import { useWalkthrough } from '../../lesson/runner'
import { PALETTE } from '../../scene/layout3d'
import { useDrawers } from '../../state/drawers'
import { useGrowth, type TopicMastery } from '../../state/growth'
import { levelTitle, nextUnlock, useProgress, xpForLevel } from '../../state/progress'
import { useDocs } from './docsStore'
import { CheckIcon } from './icons'
import s from './Quest.module.css'

// Quest tab: his level and the next unlock, the guided lesson as a checklist
// (click a step to jump there), topic mastery bars and the moves he has
// learned from them, each with a "Do it" button.

const QUEST = {
  masteryNeed: 2, // right answers in the recent window that master a topic (growth.ts rule)
  stepsBefore: 1, // collapsed checklist: done steps kept above the current one
  stepsShown: 6, // collapsed checklist: rows in the window
  barColors: [PALETTE.violet, PALETTE.teal, PALETTE.coral, PALETTE.indigo, PALETTE.lime, PALETTE.pink],
} as const

export function QuestPane() {
  return (
    <div className={s.stack}>
      <LevelCard />
      <LessonChecklist />
      <Mastery />
      <Abilities />
    </div>
  )
}

function LevelCard() {
  const xp = useProgress((p) => p.xp)
  const level = useProgress((p) => p.level)
  const floor = xpForLevel(level)
  const ceil = xpForLevel(level + 1)
  const pct = Math.round(Math.min(1, (xp - floor) / Math.max(1, ceil - floor)) * 100)
  const next = nextUnlock(level)
  return (
    <section className={s.levelCard} aria-label="Level">
      <div className={s.levelTop}>
        <span className={s.levelBadge}>Lv {level}</span>
        <span className={s.levelName}>{levelTitle(level)}</span>
        <span className={s.levelXp}>
          {xp - floor} / {ceil - floor} XP
        </span>
      </div>
      <div className={s.bar} role="progressbar" aria-label="XP to next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className={s.unlock}>
        {next ? (
          <>
            <b>
              Next at Lv {next.level} &middot; {next.label}
            </b>
            <span className={s.unlockBlurb}>{next.blurb}</span>
          </>
        ) : (
          <b>Everything unlocked. He is a legend.</b>
        )}
      </p>
    </section>
  )
}

function LessonChecklist() {
  const steps = useWalkthrough((w) => w.steps)
  const index = useWalkthrough((w) => w.index)
  const started = useWalkthrough((w) => w.started)
  const phase = useWalkthrough((w) => w.phase)
  const goTo = useWalkthrough((w) => w.goTo)
  const [all, setAll] = useState(false)
  const finished = phase === 'done'
  const doneCount = finished ? steps.length : started ? index : 0
  // Collapsed: a window around the current step, so mastery stays in view.
  const from = all ? 0 : Math.max(0, Math.min((started ? index : 0) - QUEST.stepsBefore, steps.length - QUEST.stepsShown))
  const to = all ? steps.length : from + QUEST.stepsShown

  return (
    <section aria-labelledby="quest-lesson">
      <div className={s.sectionHead}>
        <h3 id="quest-lesson" className={s.kicker}>
          Lesson path
        </h3>
        <span className={s.count}>
          {doneCount} / {steps.length}
        </span>
      </div>
      <ol className={s.steps} start={from + 1}>
        {steps.slice(from, to).map((step, k) => {
          const i = from + k
          const done = finished || (started && i < index)
          const current = started && !finished && i === index
          return (
            <li key={step.id}>
              <button
                type="button"
                className={s.step}
                data-done={done}
                data-current={current}
                aria-current={current ? 'step' : undefined}
                style={{ '--c': PALETTE[step.color] } as CSSProperties}
                onClick={() => goTo(i)}
              >
                <span className={s.stepDot} aria-hidden>
                  {done ? <CheckIcon /> : i + 1}
                </span>
                <span className={s.stepTitle}>{step.title}</span>
                <span className={s.srOnly}>{done ? ' (done)' : current ? ' (now)' : ''}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {steps.length > QUEST.stepsShown && (
        <button type="button" className={s.more} aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show all ${steps.length} steps`}
        </button>
      )}
    </section>
  )
}

const masteryShare = (t: TopicMastery) => (t.mastered ? 1 : Math.min(1, t.recent.filter(Boolean).length / QUEST.masteryNeed))

function Mastery() {
  const topics = useGrowth((g) => g.topics)
  const documentId = useDrawers((d) => d.documentId)
  const documents = useDocs((d) => d.documents)
  // Topics with answers, plus the selected document's untouched topics at 0.
  const rows = Object.values(topics).map((t) => ({ id: t.id, title: t.title, share: masteryShare(t), mastered: t.mastered }))
  const doc = documents.find((d) => d.id === documentId)
  for (const t of doc?.topics ?? []) if (!topics[t.id]) rows.push({ id: t.id, title: t.title, share: 0, mastered: false })

  return (
    <section aria-labelledby="quest-mastery">
      <h3 id="quest-mastery" className={s.kicker}>
        Topic mastery
      </h3>
      {rows.length === 0 ? (
        <p className={s.hint}>Answer a quick check or a quiz question and his mastery bars fill up here.</p>
      ) : (
        <ul className={s.mastery}>
          {rows.map((r, i) => {
            const pct = Math.round(r.share * 100)
            return (
              <li key={r.id} style={{ '--c': QUEST.barColors[i % QUEST.barColors.length] } as CSSProperties}>
                <div className={s.masteryRow}>
                  <span className={s.masteryTitle}>{r.title}</span>
                  <span className={s.masteryPct}>{r.mastered ? 'Mastered' : `${pct}%`}</span>
                </div>
                <div className={s.bar} data-tone="topic" role="progressbar" aria-label={`${r.title} mastery`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <span style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// The growth ability list names each move; unknown ids read 'queue_juggle' -> 'Queue juggle'.
const prettify = (id: string) => {
  const spec = abilityById(id)
  if (spec) return spec.label
  const words = id.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function Abilities() {
  const abilities = useGrowth((g) => g.abilities)
  const topics = useGrowth((g) => g.topics)
  return (
    <section aria-labelledby="quest-moves">
      <h3 id="quest-moves" className={s.kicker}>
        Learned moves
      </h3>
      {abilities.length === 0 ? (
        <p className={s.hint}>Master a topic and he learns a move that matches it.</p>
      ) : (
        <ul className={s.moves}>
          {abilities.map((a, i) => (
            <li key={a.id} className={s.move} style={{ '--c': QUEST.barColors[(i + 1) % QUEST.barColors.length] } as CSSProperties}>
              <span className={s.moveText}>
                <b>{prettify(a.id)}</b>
                <span>from {topics[a.topicId]?.title ?? 'a mastered topic'}</span>
              </span>
              <button type="button" className={s.doIt} onClick={() => useGrowth.getState().useAbility(a.id)}>
                Do it
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
