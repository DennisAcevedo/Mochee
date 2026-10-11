import { useEffect, useRef, useState } from 'react'
import { TEACH_BACK_LIMITS, type TeachBackFeedback } from '../../shared/teachBack'
import { useWalkthrough } from '../lesson/runner'
import { useDrawers } from '../state/drawers'
import { useProgress } from '../state/progress'
import { errorText } from '../ui/Drawers/docsClient'
import { useDocs } from '../ui/Drawers/docsStore'
import { CoinIcon } from '../ui/PlayHud/CoinIcon'
import { useHub } from './hubStore'
import { useTeachBack } from './teachBackStore'
import { useDirector } from '../state/director'
import { useMode } from '../state/mode'
import { TeachBackVoiceInput, type VoicePhase } from './TeachBackVoiceInput'
import { useTeachBackNarration } from './useTeachBackNarration'
import { teachBackSpeech } from './teachBackSpeech'
import { cancelRecognition, stopSpeaking } from '../lesson/speech'
import { useTutorStore } from '../state/store'
import s from './TeachBack.module.css'

const STATUS = { correct: 'Got it', partial: 'Build on this', missing: 'Add this idea', incorrect: 'Rethink this' }

export function TeachBackPane() {
  const documents = useDocs((d) => d.documents)
  const docsStatus = useDocs((d) => d.status)
  const docsError = useDocs((d) => d.error)
  const drawerDocument = useDrawers((d) => d.documentId)
  const selectedTopic = useTeachBack((t) => t.selectedTopic)
  const practices = useTeachBack((t) => t.practices)
  const rewards = useProgress((p) => p.teachBackRewards)
  const inputMode = useTeachBack((t) => t.inputMode)
  const spokenFeedback = useTeachBack((t) => t.spokenFeedback)
  const open = useDrawers((d) => d.learningOpen)
  const stageMode = useMode((m) => m.mode)
  const active = open && stageMode === 'study'
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle')
  const textarea = useRef<HTMLTextAreaElement>(null)
  const feedback = useRef<HTMLDivElement>(null)
  const prompt = useRef<HTMLDivElement>(null)
  const document = documents.find((d) => d.topics.some((t) => t.id === selectedTopic)) ?? documents.find((d) => d.id === drawerDocument) ?? documents[0]
  const topic = document?.topics.find((t) => t.id === selectedTopic) ?? document?.topics[0]
  const practice = topic ? practices[topic.id] : undefined
  const busy = practice?.phase === 'preparing' || practice?.phase === 'grading'
  const reviewing = practice?.phase === 'review' && practice.result
  const draftLength = practice?.draft.trim().length ?? 0
  const earned = topic ? rewards[topic.id] ?? 0 : 0
  const audioBusy = voicePhase !== 'idle'
  const narration = useTeachBackNarration(active, spokenFeedback, topic?.id)
  const previous = useRef({ phase: practice?.phase, prompt: practice?.challenge?.id })
  const lessonPlaying = useWalkthrough((w) => w.playing)

  useEffect(() => {
    if (!active) return
    useWalkthrough.getState().pause()
    cancelRecognition(); stopSpeaking()
    useTutorStore.setState({ mic: 'idle', awaitingReply: false })
    useWalkthrough.setState({ held: false })
    useDirector.getState().setCaption(null)
  }, [active])
  useEffect(() => { if (active && lessonPlaying) useWalkthrough.getState().pause() }, [active, lessonPlaying])
  useEffect(() => {
    if (active && practice?.phase === 'review' && previous.current.phase !== 'review' && practice.result) narration.say(teachBackSpeech(practice.result))
    else if (active && inputMode === 'voice' && practice?.phase === 'writing' && practice.challenge && previous.current.prompt !== practice.challenge.id) narration.say(practice.challenge.prompt)
    previous.current = { phase: practice?.phase, prompt: practice?.challenge?.id }
  }, [active, inputMode, practice?.phase, practice?.challenge, practice?.result, narration.say])
  useEffect(() => {
    if (!active) return
    const loop = narration.speaking ? 'talk' : voicePhase === 'recording' ? 'listen' : busy || voicePhase === 'transcribing' ? 'think' : null
    if (!loop) return
    useWalkthrough.getState().setLoopOverride(loop)
    useDirector.getState().setLoop(loop)
    return () => {
      if (useWalkthrough.getState().loopOverride === loop) useWalkthrough.getState().setLoopOverride(null)
      if (useDirector.getState().loop === loop) useDirector.getState().setLoop('idle')
    }
  }, [active, narration.speaking, voicePhase, busy])
  useEffect(() => {
    const target = practice?.phase === 'writing' && inputMode === 'text' ? textarea.current : practice?.phase === 'review' ? feedback.current : null
    target?.focus({ preventScroll: true })
    const reveal = practice?.phase === 'writing' ? prompt.current : target
    const body = reveal?.closest('#drawer-body-learning')
    if (reveal && body) body.scrollTop += reveal.getBoundingClientRect().top - body.getBoundingClientRect().top - 14
  }, [practice?.phase, topic?.id, inputMode])

  if (docsStatus === 'loading' || docsStatus === 'idle') return <p className={s.empty} role="status">Finding your study material…</p>
  if (!document) return (
    <div className={s.empty}>
      <b>Your turn to be the teacher.</b>
      <p>{docsError ? errorText(docsError) : 'Upload some notes, slides or a paper, then explain a topic to Mochee.'}</p>
      <button type="button" className={s.primary} onClick={() => docsError ? void useDocs.getState().refresh() : useHub.getState().go('upload')}>
        {docsError ? 'Try again' : 'Upload material'}
      </button>
    </div>
  )

  return (
    <div className={s.pane} data-testid="teach-back-pane">
      <div className={s.intro}>
        <span className={s.eyebrow}>YOU TEACH. MOCHEE LISTENS.</span>
        <h4>How would you explain it?</h4>
        <p>Put a topic into your own words. Mochee will help you spot what clicked and what needs another look.</p>
        <span className={s.reward}><CoinIcon /> Up to {TEACH_BACK_LIMITS.maxCoins} coins per topic</span>
      </div>

      <div className={s.modeChoice} role="group" aria-label="How you explain">
        <button type="button" aria-pressed={inputMode === 'voice'} disabled={busy || audioBusy} onClick={() => { narration.stop(); useTeachBack.getState().setInputMode('voice') }}>Speak</button>
        <button type="button" aria-pressed={inputMode === 'text'} disabled={busy || audioBusy} onClick={() => { narration.stop(); useTeachBack.getState().setInputMode('text') }}>Type instead</button>
      </div>
      <label className={s.voiceToggle}>
        <input type="checkbox" checked={spokenFeedback} onChange={(e) => useTeachBack.getState().setSpokenFeedback(e.target.checked)} />
        <span className={s.check} aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg></span>
        Mochee speaks
      </label>

      <div className={s.pickers}>
        <div className={s.field}>
          <label htmlFor="teach-back-material">Your material</label>
          <span className={s.select}>
            <select id="teach-back-material" value={document.id} disabled={busy || audioBusy} onChange={(e) => {
              const next = documents.find((d) => d.id === e.target.value)
              if (next?.topics[0]) useTeachBack.getState().select(next.topics[0].id)
            }}>
              {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
            <Chevron />
          </span>
        </div>
        <div className={s.field}>
          <label htmlFor="teach-back-topic">Topic to teach</label>
          <span className={s.select}>
            <select id="teach-back-topic" value={topic?.id ?? ''} disabled={busy || audioBusy || !topic} onChange={(e) => useTeachBack.getState().select(e.target.value)}>
              {!topic && <option value="">No topics found</option>}
              {document.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <Chevron />
          </span>
        </div>
      </div>

      {!practice?.challenge && (
        <div className={s.getReady}>
          <div className={s.tip}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" /></svg>
            <p>Try from memory first. Explain the main idea, how it works, and a small example.</p>
          </div>
          <button type="button" className={s.primary} disabled={!topic || busy} onClick={() => {
            if (!topic) return
            useTeachBack.getState().select(topic.id)
            void useTeachBack.getState().start(document.id, topic.id)
          }}>
            {/* A mic for a spoken take, a pencil for a typed one. */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {inputMode === 'voice' ? <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></> : <path d="M4 20h4L19 9l-4-4L4 16z" />}
            </svg>
            {practice?.phase === 'preparing' ? 'Mochee is getting ready…' : practice?.error ? 'Try again' : 'Let me teach'}
          </button>
        </div>
      )}

      {practice?.challenge && topic && (
        <>
          <div className={s.prompt} ref={prompt}>
            <span className={s.eyebrow}>MOCHEE ASKS</span>
            <p>{practice.challenge.prompt}</p>
            {spokenFeedback && !reviewing && <button type="button" className={s.citation} disabled={audioBusy || busy} onClick={() => narration.speaking ? narration.stop() : narration.say(practice.challenge!.prompt)}>{narration.speaking ? 'Stop speaking' : 'Hear the question'}</button>}
          </div>
          {!reviewing && inputMode === 'voice' && <TeachBackVoiceInput key={topic.id} topicId={topic.id} active={active} disabled={!!busy} onPhase={setVoicePhase} beforeListen={narration.stop} />}
          {!reviewing && inputMode === 'voice' && stageMode !== 'study' && <p className={s.voiceHint}>Switch to Study mode to use the microphone.</p>}
          {!reviewing && inputMode === 'text' && (
            <form className={s.editor} onSubmit={(e) => { e.preventDefault(); narration.stop(); void useTeachBack.getState().grade(topic.id) }}>
              <label htmlFor="teach-back-explanation">Your explanation</label>
              <textarea id="teach-back-explanation" ref={textarea} value={practice.draft} disabled={busy}
                placeholder="The main idea is… It works because… For example…"
                maxLength={TEACH_BACK_LIMITS.maxChars} aria-describedby="teach-back-writing-help"
                onChange={(e) => useTeachBack.getState().edit(topic.id, e.target.value)} />
              <div className={s.writingHelp} id="teach-back-writing-help">
                <span>{draftLength < TEACH_BACK_LIMITS.minChars ? `At least ${TEACH_BACK_LIMITS.minChars} characters. A few sentences is great.` : 'Simple language is welcome. Focus on the ideas.'}</span>
                <span>{practice.draft.length}/{TEACH_BACK_LIMITS.maxChars}</span>
              </div>
              <button type="submit" className={s.primary} disabled={busy || draftLength < TEACH_BACK_LIMITS.minChars}>
                {practice.phase === 'grading' ? 'Mochee is reading your explanation…' : practice.result ? 'Check my improved explanation' : 'How did I do?'}
              </button>
            </form>
          )}

          {reviewing && (
            <div className={s.feedback} ref={feedback} tabIndex={-1} aria-label="Mochee’s feedback" data-testid="teach-back-feedback">
              <div className={s.scoreCard}>
                <div><span className={s.eyebrow}>UNDERSTANDING</span><strong>{reviewing.score}<small>/100</small></strong></div>
                <span className={s.reward}><CoinIcon /> {practice.earnedCoins > 0 ? `+${practice.earnedCoins} coins` : earned === TEACH_BACK_LIMITS.maxCoins ? 'Reward complete' : 'Keep improving'}</span>
                <p>{reviewing.summary}</p>
                {spokenFeedback && <button type="button" className={s.citation} onClick={() => narration.speaking ? narration.stop() : narration.say(teachBackSpeech(reviewing))}>{narration.speaking ? 'Stop speaking' : 'Hear my feedback'}</button>}
              </div>
              <details className={s.yourWords}><summary>Your explanation</summary><p>{practice.submission?.text}</p></details>
              <FeedbackGroup title="What you got right" items={reviewing.items.filter((i) => i.status === 'correct')} documentId={document.id} />
              <FeedbackGroup title="What to work on" items={reviewing.items.filter((i) => i.status !== 'correct')} documentId={document.id} />
              <div className={s.nextQuestion}><b>One more thought</b><p>{reviewing.nextQuestion}</p></div>
              <button type="button" className={s.primary} onClick={() => { narration.stop(); useTeachBack.getState().revise(topic.id) }}>
                {reviewing.score === 100 ? 'Try another explanation' : 'Improve my explanation'}
              </button>
            </div>
          )}
        </>
      )}
      {practice?.error && <p className={s.error} role="alert">{errorText(practice.error)}</p>}
      {busy && <p className={s.progress} role="status">{practice.phase === 'preparing' ? 'Reading the topic in your material…' : 'Checking each idea against your material. This can take a moment.'}</p>}
      <div className={s.rewardMeter}>
        <div className={s.track} aria-hidden="true"><i style={{ width: `${Math.min(100, (earned / TEACH_BACK_LIMITS.maxCoins) * 100)}%` }} /></div>
        <p className={s.rewardNote}>{earned}/{TEACH_BACK_LIMITS.maxCoins} topic coins earned. Coins follow your best score; improving it earns the difference.</p>
      </div>
    </div>
  )
}

// The chunky badge on the right of each picker; the select stays the real control.
function Chevron() {
  return (
    <span className={s.chevron} aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
    </span>
  )
}

function FeedbackGroup({ title, items, documentId }: { title: string; items: TeachBackFeedback[]; documentId: string }) {
  if (!items.length) return null
  return (
    <section className={s.group} aria-label={title}>
      <h4>{title}</h4>
      {items.map((item, i) => (
        <article className={s.feedbackItem} data-verdict={item.status} key={i}>
          <span className={s.verdict}>{STATUS[item.status]}</span>
          <h5>{item.concept}</h5>
          {item.studentQuote && <blockquote>“{item.studentQuote}”</blockquote>}
          <p>{item.feedback}</p>
          <button type="button" className={s.citation} onClick={() => useDrawers.getState().openCitation({ documentId, page: item.citation.page, quote: item.citation.quote })}>
            Check your material · p. {item.citation.page} <span aria-hidden>↗</span>
          </button>
        </article>
      ))}
    </section>
  )
}
