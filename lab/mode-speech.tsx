// Production mode hook, Q&A streaming, and speech lifecycle with fake audio / network.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useLessonMode } from '../src/play/useLessonMode'
import { useMode } from '../src/state/mode'
import { useTutorStore } from '../src/state/store'
import { useDirector } from '../src/state/director'
import { sayLine, useWalkthrough } from '../src/lesson/runner'
import { speakingText } from '../src/lesson/speech'
import { useChat } from '../src/ui/Drawers/chatStore'

const spoken: string[] = []
let cancelled = 0
let utterance: FixtureUtterance | null = null
class FixtureUtterance {
  text: string
  onstart?: () => void
  onend?: () => void
  constructor(text: string) { this.text = text }
}
Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FixtureUtterance })
Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
  getVoices: () => [], get speaking() { return utterance !== null }, pending: false,
  cancel() { cancelled++; utterance = null },
  speak(u: FixtureUtterance) { utterance = u; spoken.push(u.text); u.onstart?.() },
} })
let stream: ReadableStreamDefaultController<Uint8Array> | null = null
let requestSignal: AbortSignal | null = null
let first = ''
const send = (event: unknown) => stream!.enqueue(new TextEncoder().encode(JSON.stringify(event) + '\n'))
const startAnswer = () => send({ type: 'start', first, focus: 'none', gesture: 'talk', highlight: null })
const finishAnswer = () => {
  send({ type: 'done', reply: { answer: first + ' This late sentence must never be spoken.', focus: 'none', gesture: 'talk', highlight: null }, rest: 'This late sentence must never be spoken.' })
  stream!.close()
}
let deferStart = false
let resolveDocument: ((value: Response) => void) | null = null
window.fetch = async (url, init) => {
  if (String(url) === '/api/tutor/chat') return new Promise<Response>((resolve) => { resolveDocument = resolve })
  if (String(url) !== '/api/ask') return Response.json({}, { status: 503 })
  requestSignal = init?.signal ?? null
  return new Response(new ReadableStream<Uint8Array>({ start(c) { stream = c; if (!deferStart) startAnswer() } }), { headers: { 'content-type': 'application/x-ndjson' } })
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const check = (ok: boolean, why: string) => { if (!ok) throw new Error(why) }
async function until(fn: () => boolean) {
  for (let i = 0; i < 100; i++) { if (fn()) return; await delay(20) }
  throw new Error('Timed out waiting for fixture speech')
}
function silent() {
  check(speakingText() === null && utterance === null, 'Old audio is still playing')
  check(useTutorStore.getState().mic === 'idle', 'Mic still says speaking')
  check(!useWalkthrough.getState().held && !useTutorStore.getState().awaitingReply, 'Old answer still holds the lesson')
  check(useDirector.getState().caption === null, 'Old caption remains')
}
async function runChecks() {
  useWalkthrough.getState().stop()
  useWalkthrough.getState().setMuted(false)
  useTutorStore.setState({ phase: 'live' })
  useMode.getState().setMode('study')
  await delay(650)
  for (const [from, to, finishFirst] of [['study', 'play', false], ['play', 'study', true]] as const) {
    check(useMode.getState().mode === from, 'Wrong starting room')
    first = `This is the first sentence in ${from}.`
    useTutorStore.getState().ask('Explain a queue.', 'Fallback must not play.')
    await until(() => utterance?.text === first)
    if (finishFirst) { const done = utterance!; utterance = null; done.onend?.() }
    const before = spoken.length
    useMode.getState().setMode(to)
    silent()
    check(requestSignal?.aborted === true, 'The old stream was not aborted')
    finishAnswer() // deliberately late even after abort; exercises queued JS callbacks
    await delay(120)
    silent()
    check(spoken.length === before, 'Late answer restarted speech')
  }
  // A play welcome uses sayLine(), not the streaming Q&A path.
  useMode.getState().setMode('play')
  sayLine('Welcome to the play room.')
  await until(() => utterance !== null)
  useMode.getState().setMode('study')
  silent()
  // Switching before even the first streamed sentence arrives.
  deferStart = true
  first = 'This answer arrives after leaving study.'
  useTutorStore.getState().ask('Another question.', 'No fallback after switching.')
  await delay(20)
  const before = spoken.length
  useMode.getState().setMode('play')
  startAnswer(); finishAnswer()
  await delay(120)
  silent()
  check(spoken.length === before, 'A cancelled pending answer began speaking')
  deferStart = false
  // A document answer may finish fetching, but only its written answer survives a room change.
  const documentRequest = useChat.getState().send('fixture', 'Explain this document.')
  useMode.getState().setMode('study')
  const beforeDocument = spoken.length
  resolveDocument!(Response.json({ answer: 'A late document answer.', cue: 'talk', citations: [] }))
  await documentRequest; await delay(120)
  silent()
  check(spoken.length === beforeDocument && useChat.getState().logs.fixture.at(-1)?.text === 'A late document answer.', 'Document answer spoke after switching or lost its text')
  return `PASS: both directions, active speech, waiting stream tails, Play greeting, pending Q&A, and delayed document answers. ${cancelled} audio cancellations; no late speech.`
}
function Lab() {
  useLessonMode()
  const [status, setStatus] = useState('Ready')
  return <main style={{ fontFamily: 'system-ui', maxWidth: 850, margin: '60px auto', padding: 24 }}>
    <h1>Study ↔ Play speech cancellation</h1>
    <p>Real mode-switch and answer code, simulated audio and delayed network chunks. No microphone or external calls.</p>
    <button disabled={status === 'Running…'} onClick={() => { setStatus('Running…'); void runChecks().then(setStatus, (e) => setStatus(`FAIL: ${e.message}`)) }}>Run cancellation checks</button>
    <p role="status">{status}</p>
  </main>
}
createRoot(document.getElementById('root')!).render(<Lab />)
