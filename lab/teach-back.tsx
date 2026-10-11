// Isolated browser fixture. No real model calls, document writes or wallet writes.
// Open /lab/teach-back.html to exercise the production pane and its client/store.
import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { TEACH_BACK_ROUTES, type TeachBackResult } from '../shared/teachBack'
import { StudyHub } from '../src/hub/StudyHub'
import { useHub } from '../src/hub/hubStore'
import { useDrawers } from '../src/state/drawers'
import { useProgress } from '../src/state/progress'
import { useDocs } from '../src/ui/Drawers/docsStore'
import { useWalkthrough } from '../src/lesson/runner'

const documentId = 'aaaaaaaaaaaaaaaa'
const topicId = `${documentId}-t1`
const challenge = { id: 'tbaaaaaaaaaaaaaaaa', documentId, topicId, topicTitle: 'First come first served', firstPage: 1,
  prompt: 'Explain first come first served scheduling and what happens when a long job arrives before a short one.' }

// Synthetic microphone audio never reaches the speakers or a real microphone.
// MediaRecorder and the production capture controller still run normally.
let denyMic = false
let activeTracks = 0
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
  if (denyMic) { denyMic = false; throw new DOMException('Fixture denial', 'NotAllowedError') }
  const context = new AudioContext()
  await context.resume()
  const oscillator = context.createOscillator()
  const destination = context.createMediaStreamDestination()
  oscillator.connect(destination); oscillator.start()
  const stream = destination.stream
  activeTracks++
  for (const track of stream.getTracks()) {
    const original = track.stop.bind(track)
    let stopped = false
    track.stop = () => { if (stopped) return; stopped = true; activeTracks--; original(); oscillator.stop(); void context.close() }
  }
  return stream
} })
Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined })
Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })
let lastSpoken = ''
class FixtureUtterance {
  text: string
  onstart?: () => void
  onend?: () => void
  constructor(text: string) { this.text = text }
}
Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FixtureUtterance })
Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
  getVoices: () => [], cancel() {}, speaking: false, pending: false,
  speak(utterance: FixtureUtterance) { lastSpoken = utterance.text; utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 150) },
} })
useWalkthrough.getState().setMuted(true) // teach-back's explicit voice should still speak

// Swap out persistence before changing any progress. This lab cannot alter the app wallet.
useProgress.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
useProgress.setState({ coins: 0, owned: [], teachBackRewards: {}, lastAward: null })
useDocs.setState({ status: 'ready', tutorId: null, documents: [{ id: documentId, title: 'Scheduling notes · test fixture',
  pageCount: 1, createdAt: '2026-01-01T00:00:00Z', tutorId: 'fixture', original: 'txt', kind: 'class',
  topics: [{ id: topicId, documentId, title: challenge.topicTitle, keywords: ['queue'], firstPage: 1 }] }] })

let failNext = false
const saved = new Map<string, TeachBackResult>()
window.fetch = async (input, init) => {
  const url = String(input)
  if (url === TEACH_BACK_ROUTES.start) return Response.json(challenge)
  if (url === TEACH_BACK_ROUTES.transcribe) return Response.json({ text: 'Jobs run in arrival order, like people joining a queue. A long job makes the short jobs behind it wait until it finishes.' })
  if (url !== TEACH_BACK_ROUTES.grade) return Response.json({ error: 'fixture-only' }, { status: 503 })
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (failNext) { failNext = false; return Response.json({ error: 'timeout' }, { status: 504 }) }
  const { attemptId, explanation } = JSON.parse(String(init?.body)) as { attemptId: string; explanation: string }
  if (saved.has(attemptId)) return Response.json(saved.get(attemptId))
  const improved = explanation.toLowerCase().includes('short')
  const result: TeachBackResult = { attemptId, sessionId: challenge.id, documentId, topicId, score: improved ? 100 : 75,
    summary: improved ? 'You explained both arrival order and why short jobs can be delayed. Nice teaching!' : 'Your queue analogy explains arrival order well. Add why a long job delays shorter jobs.',
    items: [
      { concept: 'Arrival order', status: 'correct', feedback: 'You explained that the first job to arrive runs first.', studentQuote: explanation.slice(0, 48),
        citation: { chunkId: 'fixture:1', page: 1, quote: 'First come first served runs jobs in arrival order.' } },
      { concept: 'Convoy effect', status: improved ? 'correct' : 'partial', feedback: improved ? 'You connected the long job to the waiting time of short jobs.' : 'Even a very short job must wait until the long job finishes. Include that drawback.',
        studentQuote: '', citation: { chunkId: 'fixture:1', page: 1, quote: 'A long job can delay shorter jobs behind it.' } },
    ], nextQuestion: 'What changes if the shortest job goes first?',
  }
  saved.set(attemptId, result)
  return Response.json(result)
}

function Source() {
  const citation = useDrawers((s) => s.citation)
  return <div><h3>Source page {citation?.page ?? 1}</h3><p>{citation?.quote ?? 'First come first served runs jobs in arrival order.'}</p>
    <button onClick={() => useHub.getState().go('teachBack')}>Return to my explanation</button></div>
}
function Lab() {
  const coins = useProgress((s) => s.coins)
  const [failureArmed, arm] = useState(false)
  const [audioState, setAudioState] = useState({ tracks: 0, spoken: '' })
  useEffect(() => { const timer = setInterval(() => setAudioState({ tracks: activeTracks, spoken: lastSpoken }), 100); return () => clearInterval(timer) }, [])
  return <BrowserRouter><style>{`
    body { margin:0; padding:24px 12px; background:#f4f1f9; color:#302b40; font:14px 'Nunito',sans-serif; }
    .lab { max-width:380px; margin:auto; } .lab h1 { font:600 26px 'Fredoka',sans-serif; }
    .shell { background:#fffdf8; border:2px solid #2e293c; border-radius:22px; box-shadow:4px 5px 0 #2e293c; }
    .lab-header { padding:16px; font-weight:800; border-bottom:1px solid #eee; display:flex; justify-content:space-between; }
    #drawer-body-learning { height:640px; padding:18px; overflow-y:auto; overflow-x:hidden; }
    button { cursor:pointer; } .lab-controls { margin:18px 0; } .lab-controls button { margin-top:10px; padding:8px; }
  `}</style><main className="lab"><h1>Teach-back browser check</h1><p>Scripted feedback and synthetic mic. Test coins only. No external requests.</p>
    <div className="shell"><div className="lab-header"><span>Learning</span><span role="status">{coins} test coins</span></div>
      <div id="drawer-body-learning"><StudyHub upload={<Source />} /></div></div>
    <div className="lab-controls"><button onClick={() => { failNext = true; arm(true) }}>Simulate next grading failure</button>
      <button onClick={() => { denyMic = true }}>Deny next microphone request</button>
      <p>Active microphone tracks: {audioState.tracks}</p><p data-testid="spoken-output">Spoken response: {audioState.spoken || 'None yet'}</p>
      {failureArmed && <p>The next grade will time out; retrying should keep your explanation.</p>}</div>
  </main></BrowserRouter>
}
createRoot(document.getElementById('root')!).render(<Lab />)
