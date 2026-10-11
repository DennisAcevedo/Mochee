import { useState, type CSSProperties } from 'react'
import type { QuizQuestion, QuizResult, QuizSet } from '../../../shared/docsTypes'
import { PALETTE } from '../../scene/layout3d'
import { useDirector } from '../../state/director'
import { useDrawers } from '../../state/drawers'
import { useGrowth } from '../../state/growth'
import { useProgress } from '../../state/progress'
import { useTutorStore } from '../../state/store'
import { errorText, fetchQuiz, submitQuiz, type DocsErrorCode } from './docsClient'
import { findTopic, useDocs } from './docsStore'
import { CheckIcon } from './icons'
import s from './ChatQuiz.module.css'
import { performQuizResult } from './tutorCues'
import { clearCelebration } from '../../scene/windows/pointGate'

// The study hub's Quiz view. For an uploaded document: one question at a time with big choice
// chips. Each submit carries a fresh attemptId (the server's idempotency key)
// and the server reveals the answer only after it. Every result feeds topic
// mastery; a first-try correct answer also earns coins and a dance. The built-in
// lesson's quick check lives in the browser window's Quick check tab instead.

const QUIZ_UI = {
  choiceColors: [PALETTE.violet, PALETTE.teal, PALETTE.coral, PALETTE.indigo],
  choiceKeys: ['A', 'B', 'C', 'D', 'E', 'F'],
  maxExplanationChars: 280, // a runaway model explanation is cut at a sentence (or word) end
} as const

// Keeps the verdict card readable whatever the model wrote.
export function clampExplanation(text: string, max: number = QUIZ_UI.maxExplanationChars): string {
  const clean = text.trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const sentence = cut.lastIndexOf('. ')
  if (sentence > max / 2) return cut.slice(0, sentence + 1)
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`
}

type Phase =
  | { at: 'start' }
  | { at: 'loading' }
  | { at: 'error'; error: DocsErrorCode }
  | { at: 'question'; set: QuizSet; index: number; choice: number | null; sending: boolean; error: DocsErrorCode | null; tries: number }
  | { at: 'result'; set: QuizSet; index: number; choice: number; result: QuizResult }
  | { at: 'done'; set: QuizSet }

export function QuizPane() {
  const documentId = useDrawers((d) => d.documentId)
  return documentId ? <DocQuiz key={documentId} documentId={documentId} /> : <BoardHint />
}

function BoardHint() {
  const openCheck = () => {
    const d = useDirector.getState()
    d.walkTo('left')
    d.setFocus('board')
    useTutorStore.getState().setMode('quiz')
  }
  return (
    <div className={s.hintCard}>
      <span className={s.hintEmoji} aria-hidden>
        ?
      </span>
      <h3 className={s.hintTitle}>The quick check lives in the browser window</h3>
      <p className={s.hint}>The built-in lesson asks its question in the browser window to his left. Pick a PDF under Upload Materials for a quiz made from your own notes.</p>
      <button type="button" className={s.primary} onClick={openCheck}>
        Open the quick check
      </button>
    </div>
  )
}

function DocQuiz({ documentId }: { documentId: string }) {
  const doc = useDocs((d) => d.documents.find((x) => x.id === documentId))
  const [phase, setPhase] = useState<Phase>({ at: 'start' })
  const [firstTryRight, setFirstTryRight] = useState(0)

  const load = async () => {
    setPhase({ at: 'loading' })
    setFirstTryRight(0)
    const res = await fetchQuiz(documentId)
    if (!res.ok) return setPhase({ at: 'error', error: res.error })
    if (res.data.questions.length === 0) return setPhase({ at: 'error', error: 'not-found' })
    setPhase({ at: 'question', set: res.data, index: 0, choice: null, sending: false, error: null, tries: 0 })
  }

  const submit = async () => {
    if (phase.at !== 'question' || phase.choice === null || phase.sending) return
    const q = phase.set.questions[phase.index]
    const choice = phase.choice
    setPhase({ ...phase, sending: true, error: null })
    const res = await submitQuiz({ questionId: q.id, choice, attemptId: crypto.randomUUID() })
    if (!res.ok) return setPhase({ ...phase, sending: false, error: res.error })
    const result = res.data
    const topic = findTopic(result.topicId)
    useGrowth.getState().recordAnswer({ id: result.topicId, title: topic?.title ?? doc?.title ?? 'Topic', documentId }, result.correct)
    if (result.correct && result.firstTry) {
      useProgress.getState().award('quizCorrect')
      setFirstTryRight((n) => n + 1)
    }
    if (result.correct) {
      // performQuizResult's cheer, minus the dances that reach into the window from the left spot (pointGate.ts).
      useDirector.getState().play(clearCelebration())
      useDirector.getState().burst('confetti')
    } else performQuizResult(false)
    setPhase({ at: 'result', set: phase.set, index: phase.index, choice, result })
  }

  const advance = () => {
    if (phase.at !== 'result') return
    if (!phase.result.correct) {
      setPhase({ at: 'question', set: phase.set, index: phase.index, choice: null, sending: false, error: null, tries: 1 })
      return
    }
    const next = phase.index + 1
    if (next >= phase.set.questions.length) setPhase({ at: 'done', set: phase.set })
    else setPhase({ at: 'question', set: phase.set, index: next, choice: null, sending: false, error: null, tries: 0 })
  }

  if (phase.at === 'start' || phase.at === 'loading')
    return (
      <div className={s.hintCard}>
        <span className={s.hintEmoji} aria-hidden>
          <CheckIcon />
        </span>
        <h3 className={s.hintTitle}>Quiz me on {doc?.title ?? 'this document'}</h3>
        <p className={s.hint}>Questions come from your pages. Get one right first try and he learns, dances and levels up.</p>
        <button type="button" className={s.primary} disabled={phase.at === 'loading'} onClick={() => void load()}>
          {phase.at === 'loading' ? 'Writing questions…' : 'Start the quiz'}
        </button>
      </div>
    )

  if (phase.at === 'error')
    return (
      <div className={s.hintCard} data-tone="warn">
        <h3 className={s.hintTitle}>No quiz yet</h3>
        <p className={s.hint}>{phase.error === 'not-found' ? 'No questions came back for this document.' : errorText(phase.error)}</p>
        <button type="button" className={s.primary} onClick={() => void load()}>
          Try again
        </button>
      </div>
    )

  if (phase.at === 'done') {
    const total = phase.set.questions.length
    return (
      <div className={s.hintCard} data-tone="win">
        <span className={s.score}>
          {firstTryRight}/{total}
        </span>
        <h3 className={s.hintTitle}>{firstTryRight === total ? 'Perfect run!' : 'Quiz complete'}</h3>
        <p className={s.hint}>First-try answers. Right answers build his mastery of each topic.</p>
        <button type="button" className={s.primary} onClick={() => void load()}>
          New quiz
        </button>
      </div>
    )
  }

  const q = phase.set.questions[phase.index]
  return (
    <QuestionCard
      question={q}
      index={phase.index}
      total={phase.set.questions.length}
      documentId={documentId}
      choice={phase.choice}
      result={phase.at === 'result' ? phase.result : null}
      sending={phase.at === 'question' && phase.sending}
      error={phase.at === 'question' ? phase.error : null}
      retry={phase.at === 'question' && phase.tries > 0}
      onChoose={(choice) => phase.at === 'question' && setPhase({ ...phase, choice })}
      onSubmit={() => void submit()}
      onNext={advance}
    />
  )
}

interface QuestionCardProps {
  question: QuizQuestion
  index: number
  total: number
  documentId: string
  choice: number | null
  result: QuizResult | null
  sending: boolean
  error: DocsErrorCode | null
  retry: boolean
  onChoose: (choice: number) => void
  onSubmit: () => void
  onNext: () => void
}

function QuestionCard(p: QuestionCardProps) {
  const openCitation = useDrawers((d) => d.openCitation)
  const topic = findTopic(p.question.topicId)
  const cite = p.result?.citation ?? null
  const last = p.index + 1 >= p.total

  return (
    <div className={s.quiz}>
      <div className={s.quizHead}>
        <span className={s.quizCount}>
          Question {p.index + 1} of {p.total}
        </span>
        {topic && <span className={s.quizTopic}>{topic.title}</span>}
      </div>
      <div className={s.quizDots} aria-hidden>
        {Array.from({ length: p.total }, (_, i) => (
          <span key={i} data-state={i < p.index ? 'done' : i === p.index ? 'now' : 'todo'} />
        ))}
      </div>
      <h3 className={s.prompt}>{p.question.prompt}</h3>
      {p.retry && !p.result && <p className={s.retryNote}>Have another go.</p>}

      <div className={s.choices} role="radiogroup" aria-label="Choices">
        {p.question.choices.map((text, i) => {
          const state = !p.result ? (p.choice === i ? 'picked' : 'idle') : i === p.result.correctChoice ? 'right' : i === p.choice ? 'wrong' : 'idle'
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={p.choice === i}
              disabled={!!p.result || p.sending}
              className={s.choice}
              data-state={state}
              style={{ '--c': QUIZ_UI.choiceColors[i % QUIZ_UI.choiceColors.length] } as CSSProperties}
              onClick={() => p.onChoose(i)}
            >
              <span className={s.choiceKey}>{QUIZ_UI.choiceKeys[i] ?? i + 1}</span>
              <span>{text}</span>
            </button>
          )
        })}
      </div>

      {p.error && <p className={s.quizError}>{errorText(p.error)}</p>}

      {p.result ? (
        <div className={s.verdict} data-correct={p.result.correct} role="status">
          <b>{p.result.correct ? (p.result.firstTry ? 'Correct, first try!' : 'Correct!') : 'Not quite.'}</b>
          <p>{clampExplanation(p.result.explanation)}</p>
          <div className={s.verdictRow}>
            {cite && (
              <button type="button" className={s.cite} onClick={() => openCitation({ documentId: p.documentId, page: cite.page, quote: cite.quote })}>
                p. {cite.page}
              </button>
            )}
            <button type="button" className={s.primary} onClick={p.onNext}>
              {!p.result.correct ? 'Try again' : last ? 'Finish' : 'Next question'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={s.primary} disabled={p.choice === null || p.sending} onClick={p.onSubmit}>
          {p.sending ? 'Checking…' : 'Check answer'}
        </button>
      )}
    </div>
  )
}
