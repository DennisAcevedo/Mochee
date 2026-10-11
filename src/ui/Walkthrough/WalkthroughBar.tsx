import '@fontsource/figtree/700.css'
import '@fontsource/figtree/800.css'
import '@fontsource/fredoka/700.css'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { INK_ON, paletteVars } from '../../lesson/accents'
import { useHub } from '../../hub/hubStore'
import { useLessonPack } from '../../lesson/packSession'
import { useDrawers } from '../../state/drawers'
import { useWalkthrough, type WalkthroughState } from '../../lesson/runner'
import { PALETTE } from '../../scene/layout3d'
import { CloseButton } from '../Closeable/Closeable'
import styles from './WalkthroughBar.module.css'

interface Props {
  className?: string
  closeable?: boolean // an x on the corner hides the bar for now (src/state/hidden.ts); arrow keys keep working
}

const BAR = {
  minutes: 2, // rough length of the guided lesson, for the start blurb
} as const

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

type BarView = Pick<WalkthroughState, 'steps' | 'index' | 'started' | 'playing' | 'phase' | 'held' | 'lineDone' | 'quizResult' | 'muted'>

// One line of status under the step title.
function statusOf(s: BarView): string {
  const nextTitle = s.steps[s.index + 1]?.title
  if (!s.started) return `${s.steps.length} quick steps, about ${BAR.minutes} minutes`
  if (s.held) return 'Answering your question...'
  switch (s.phase) {
    case 'walking':
      return 'Walking over...'
    case 'speaking':
      return s.quizResult === 'correct' ? 'Nailed it!' : s.quizResult === 'wrong' ? 'Here is a hint...' : 'Explaining'
    case 'gap':
      return nextTitle ? `Next up: ${nextTitle}` : 'Wrapping up'
    case 'waiting':
      return s.quizResult === 'wrong' ? 'So close! Pick another answer' : 'Your turn! Pick an answer on the board'
    case 'done':
      return 'Lesson complete! Replay it any time'
    default:
      return s.playing ? 'Ready' : s.lineDone && nextTitle ? `Paused. Next: ${nextTitle}` : 'Paused'
  }
}

// ---- Icons (inline SVG, currentColor)

const Icon = {
  upload: (
    <svg viewBox="0 0 24 24" aria-hidden style={{ fill: 'none' }} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 14.5v4a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="5" width="4.2" height="14" rx="1.4" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1.4" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M17 6.2v11.6a.9.9 0 0 1-1.4.75L7.9 13.4a1.6 1.6 0 0 1 0-2.8l7.7-5.15A.9.9 0 0 1 17 6.2Z" />
      <rect x="5" y="5.5" width="2.6" height="13" rx="1.2" />
    </svg>
  ),
  next: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 6.2v11.6a.9.9 0 0 0 1.4.75l7.7-5.15a1.6 1.6 0 0 0 0-2.8L8.4 5.45A.9.9 0 0 0 7 6.2Z" />
      <rect x="16.4" y="5.5" width="2.6" height="13" rx="1.2" />
    </svg>
  ),
  restart: (
    <svg viewBox="0 0 24 24" aria-hidden style={{ fill: 'none' }} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.2 4.5v4h4" />
    </svg>
  ),
  sound: (
    <svg viewBox="0 0 24 24" aria-hidden style={{ fill: 'none' }} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
      <path d="M18.3 6.5a7.8 7.8 0 0 1 0 11" />
    </svg>
  ),
  muted: (
    <svg viewBox="0 0 24 24" aria-hidden style={{ fill: 'none' }} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </svg>
  ),
}

// The guided-lesson control pill: step chip, title + status, Back / Play-Pause /
// Next / Restart, voice toggle, and a multicolour progress track you can click.
// Arrow keys step through when you're not typing.
export function WalkthroughBar({ className, closeable = false }: Props) {
  const s = useWalkthrough(
    useShallow((st): BarView => ({
      steps: st.steps,
      index: st.index,
      started: st.started,
      playing: st.playing,
      phase: st.phase,
      held: st.held,
      lineDone: st.lineDone,
      quizResult: st.quizResult,
      muted: st.muted,
    })),
  )
  const actions = useWalkthrough(
    useShallow((st) => ({
      start: st.start,
      next: st.next,
      back: st.back,
      goTo: st.goTo,
      togglePlay: st.togglePlay,
      restart: st.restart,
      setMuted: st.setMuted,
    })),
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        useWalkthrough.getState().next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        useWalkthrough.getState().back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const step = s.steps[s.index]
  const color = s.started ? step.color : 'teal'
  const done = s.phase === 'done'
  const showPause = s.started && s.playing && !done
  const packTitle = useLessonPack((p) => p.pack?.title ?? null)
  // A class with no notes: the bar points at Learning instead of a lesson.
  const noNotes = useLessonPack((p) => p.empty !== null)
  const status = noNotes ? 'Upload notes in Learning and I’ll build your lesson' : statusOf(s)
  const introTitle = noNotes ? 'Add your notes' : (packTitle ?? 'First-come, first-served')
  const waiting = s.phase === 'waiting'

  return (
    <div
      className={`${styles.bar} ${className ?? ''}`}
      style={paletteVars({ '--step': PALETTE[color], '--on-step': INK_ON.has(color) ? PALETTE.ink : '#fff' })}
      data-started={s.started}
      role="region"
      aria-label="Guided lesson controls"
    >
      {closeable && <CloseButton id="walkthrough" label="lesson controls" />}
      <div className={styles.row}>
        <div className={styles.chip} data-waiting={waiting} data-testid="walk-step-label">
          {noNotes ? (
            <>No notes</>
          ) : s.started ? (
            <>
              <b>{s.index + 1}</b> of {s.steps.length}
            </>
          ) : (
            <>Guided lesson</>
          )}
        </div>

        <div className={styles.copy}>
          <div className={styles.head}>
            <div key={s.started ? step.id : 'intro'} className={styles.title} title={packTitle ?? undefined}>
              {s.started && !noNotes ? step.title : introTitle}
            </div>
            <div className={styles.status} aria-live="polite">
              {status}
            </div>
          </div>
          <ol className={styles.track} aria-label="Lesson steps">
            {s.steps.map((st, i) => {
              const state = !s.started ? 'todo' : i < s.index || (i === s.index && done) ? 'done' : i === s.index ? 'now' : 'todo'
              return (
                <li key={st.id} className={styles.segWrap}>
                  <button
                    type="button"
                    className={styles.seg}
                    data-state={state}
                    style={paletteVars({ '--seg': PALETTE[st.color] })}
                    onClick={() => actions.goTo(i)}
                    aria-label={`Go to step ${i + 1}: ${st.title}`}
                    aria-current={state === 'now' ? 'step' : undefined}
                    title={`${i + 1}. ${st.title}`}
                  />
                </li>
              )
            })}
          </ol>
        </div>

        <div className={styles.controls}>
          {noNotes ? (
            <button
              type="button"
              className={styles.startBtn}
              onClick={() => {
                useHub.getState().go('upload')
                useDrawers.getState().open()
              }}
              aria-label="Open Learning to upload notes"
            >
              {Icon.upload}
              <span>Add notes</span>
            </button>
          ) : !s.started ? (
            <button type="button" className={styles.startBtn} onClick={actions.start} aria-label="Start the guided lesson">
              {Icon.play}
              <span>Start lesson</span>
            </button>
          ) : (
            <>
              <button type="button" className={styles.btn} onClick={actions.restart} aria-label="Restart the lesson" title="Restart">
                {Icon.restart}
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={actions.back}
                disabled={s.index === 0}
                aria-label="Previous step"
                title="Back (Left arrow)"
              >
                {Icon.back}
              </button>
              <button
                type="button"
                className={styles.playBtn}
                onClick={done ? actions.restart : actions.togglePlay}
                aria-label={done ? 'Replay the lesson' : showPause ? 'Pause the lesson' : 'Play the lesson'}
                title={done ? 'Replay' : showPause ? 'Pause' : 'Play'}
              >
                {done ? Icon.restart : showPause ? Icon.pause : Icon.play}
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={actions.next}
                disabled={s.index >= s.steps.length - 1}
                aria-label="Next step"
                title="Next (Right arrow)"
              >
                {Icon.next}
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.btn}
            data-off={s.muted}
            onClick={() => actions.setMuted(!s.muted)}
            aria-label={s.muted ? 'Turn his voice on' : 'Mute his voice'}
            aria-pressed={s.muted}
            title={s.muted ? 'Voice off' : 'Voice on'}
          >
            {s.muted ? Icon.muted : Icon.sound}
          </button>
        </div>
      </div>

    </div>
  )
}
