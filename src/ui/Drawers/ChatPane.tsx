import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { script } from '../../data/mockLesson'
import { useAskStatus } from '../../lesson/askFlow'
import { DOCS_LIMITS, type GroundedAnswer } from '../../../shared/docsTypes'
import { parseMarks } from '../../lesson/markup'
import { useDrawers } from '../../state/drawers'
import { useTutorStore } from '../../state/store'
import { useChat, type ChatTurn } from './chatStore'
import { errorText } from './docsClient'
import { useDocs } from './docsStore'
import { SendIcon } from './icons'
import s from './ChatQuiz.module.css'

// The study hub's Chat view. With an uploaded document selected: grounded
// answers that cite their pages (chips open the cited page in the hub's
// reader), an honest "not in this document" when the server abstains, and a
// visible label on demo answers. With the built-in lesson: the stage's own
// ask flow, and this view shows the lesson transcript.

const CHAT_UI = {
  transcriptTurns: 14, // built-in lesson lines shown
  suggestTopics: 2, // topic suggestions for an empty document chat
  citeSnippetWords: 3, // words of the quote shown on a citation chip
  builtInSuggestions: ['Why is FCFS unfair to short jobs?', 'What is the convoy effect?'],
} as const

export function ChatPane() {
  const documentId = useDrawers((d) => d.documentId)
  return documentId ? <DocChat documentId={documentId} /> : <LessonChat />
}

function DocChat({ documentId }: { documentId: string }) {
  const doc = useDocs((d) => d.documents.find((x) => x.id === documentId))
  const log = useChat((c) => c.logs[documentId])
  const pending = useChat((c) => !!c.pending[documentId])
  const send = (q: string) => void useChat.getState().send(documentId, q)
  const suggestions = (doc?.topics ?? []).slice(0, CHAT_UI.suggestTopics).map((t) => `What is ${t.title.toLowerCase()}?`)

  return (
    <ChatFrame
      subject={doc?.title ?? 'Selected document'}
      turns={log ?? []}
      pending={pending}
      suggestions={suggestions}
      onSend={send}
      renderTutor={(turn) =>
        turn.error ? (
          <div className={s.bubble} data-who="tutor" data-tone="error">
            {errorText(turn.error)}
          </div>
        ) : turn.answer ? (
          <Answer documentId={documentId} answer={turn.answer} onAsk={send} />
        ) : null
      }
    />
  )
}

function LessonChat() {
  const lines = useTutorStore((t) => t.lines)
  const awaiting = useTutorStore((t) => t.awaitingReply)
  const pending = useAskStatus((a) => a.pending) || awaiting
  const turns: ChatTurn[] = lines
    .filter((l) => l.text)
    .slice(-CHAT_UI.transcriptTurns)
    .map((l, i) => ({ id: i, who: l.who, text: l.text }))

  return (
    <ChatFrame
      subject="CS111 · Lecture 4 (on stage)"
      turns={turns}
      pending={pending}
      suggestions={[...CHAT_UI.builtInSuggestions]}
      onSend={(q) => useTutorStore.getState().ask(q, script.genericReply)}
      renderTutor={(turn) => (
        <div className={s.bubble} data-who="tutor">
          {turn.text}
        </div>
      )}
    />
  )
}

interface ChatFrameProps {
  subject: string
  turns: ChatTurn[]
  pending: boolean
  suggestions: string[]
  onSend: (question: string) => void
  renderTutor: (turn: ChatTurn) => ReactNode
}

function ChatFrame({ subject, turns, pending, suggestions, onSend, renderTutor }: ChatFrameProps) {
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [turns.length, pending])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = draft.trim()
    if (!q || pending) return
    onSend(q)
    setDraft('')
  }

  return (
    <div className={s.chat}>
      <p className={s.subject}>
        Asking about <b>{subject}</b>
      </p>
      <div className={s.log} role="log" aria-live="polite" aria-relevant="additions">
        {turns.length === 0 && !pending && (
          <div className={s.emptyChat}>
            <p>Ask anything about it. Answers quote the page they come from.</p>
            <div className={s.suggest}>
              {suggestions.map((q) => (
                <button key={q} type="button" className={s.suggestChip} onClick={() => onSend(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn) =>
          turn.who === 'student' ? (
            <div key={turn.id} className={s.bubble} data-who="student">
              {turn.text}
            </div>
          ) : (
            <div key={turn.id}>{renderTutor(turn)}</div>
          ),
        )}
        {pending && (
          <div className={s.bubble} data-who="tutor" data-tone="thinking" aria-label="Thinking">
            <span className={s.dots}>
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
        <div ref={end} />
      </div>
      <form className={s.ask} onSubmit={submit}>
        <input
          className={s.askInput}
          value={draft}
          maxLength={DOCS_LIMITS.maxQuestionChars}
          placeholder="Ask Gemini Guy…"
          aria-label="Your question"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className={s.send} disabled={!draft.trim() || pending} aria-label="Send">
          <SendIcon />
        </button>
      </form>
    </div>
  )
}

// First few words of a quote, so two chips on the same page read differently.
const snippet = (quote: string) => {
  const words = quote.trim().split(/\s+/)
  return `“${words.slice(0, CHAT_UI.citeSnippetWords).join(' ')}${words.length > CHAT_UI.citeSnippetWords ? '…' : ''}”`
}

function Answer({ documentId, answer, onAsk }: { documentId: string; answer: GroundedAnswer; onAsk: (q: string) => void }) {
  const openCitation = useDrawers((d) => d.openCitation)
  return (
    <div className={s.bubble} data-who="tutor" data-tone={answer.abstained ? 'abstained' : undefined}>
      {(answer.source === 'demo' || answer.abstained) && (
        <div className={s.tags}>
          {answer.abstained && <span className={s.tag} data-tag="abstained">Not in this document</span>}
          {answer.source === 'demo' && (
            <span className={s.tag} data-tag="demo" title="No Gemini key on the server: an offline answer from the document text">
              Demo answer
            </span>
          )}
        </div>
      )}
      <p className={s.answerText}>
        {parseMarks(answer.answer).map((span, i) => (span.bold ? <b key={i}>{span.text}</b> : <span key={i}>{span.text}</span>))}
      </p>
      {answer.citations.length > 0 && (
        <div className={s.cites}>
          {answer.citations.map((c) => (
            <button
              key={c.chunkId + c.quote}
              type="button"
              className={s.cite}
              title={`“${c.quote}”`}
              onClick={() => openCitation({ documentId, page: c.page, quote: c.quote })}
            >
              p. {c.page}
              <span className={s.citeSnippet}>{snippet(c.quote)}</span>
            </button>
          ))}
        </div>
      )}
      {answer.nextQuestion && (
        <button type="button" className={s.nextQ} onClick={() => onAsk(answer.nextQuestion!)}>
          <span aria-hidden>&#8594;</span> {answer.nextQuestion}
        </button>
      )}
    </div>
  )
}
