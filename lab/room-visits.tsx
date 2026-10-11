// Real lesson and Play hooks under StrictMode, with simulated speech and network.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { CurrentTutorContext } from '../src/state/currentTutor'
import type { Tutor } from '../src/state/library'
import { StageDirector } from '../src/lesson/StageDirector'
import { useLessonMode } from '../src/play/useLessonMode'
import { usePlayGreeting } from '../src/play/playGreeting'
import { useMode } from '../src/state/mode'
import { useTutorStore } from '../src/state/store'
import { useWalkthrough } from '../src/lesson/runner'
import { speakingText } from '../src/lesson/speech'

const spoken: string[] = []
class Utterance { constructor(public text: string) {} onstart?: () => void }
Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance })
Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
  getVoices: () => [], cancel() {}, speak(u: Utterance) { spoken.push(u.text); u.onstart?.() },
} })
window.fetch = async () => Response.json({}, { status: 503 })
const fixture = createRoot(document.getElementById('fixture')!)
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
const check = (ok: boolean, why: string) => { if (!ok) throw new Error(why) }
function Hooks() { useLessonMode(); usePlayGreeting(); return <StageDirector /> }
function mount(id: string) {
  flushSync(() => fixture.render(<StrictMode><CurrentTutorContext.Provider value={{ id } as Tutor}><Hooks /></CurrentTutorContext.Provider></StrictMode>))
}
function unmount() { flushSync(() => fixture.render(null)) }
async function run() {
  const id = `room-visits-lab-${crypto.randomUUID()}`
  useWalkthrough.getState().stop()
  useWalkthrough.getState().setMuted(false)
  useTutorStore.setState({ phase: 'live' })
  useMode.getState().setMode('study')
  mount(id)
  await delay(2200)
  check(spoken.length === 1 && useWalkthrough.getState().playing, 'First Study visit did not automatically start under StrictMode')
  useMode.getState().setMode('play')
  await delay(1200)
  check(spoken.length === 2 && spoken.at(-1)!.includes('play room'), 'First Play visit did not welcome')
  useMode.getState().setMode('study')
  await delay(2200)
  check(spoken.length === 2 && speakingText() === null && !useWalkthrough.getState().playing, 'Returning to Study resumed the script')
  useMode.getState().setMode('play')
  await delay(1200)
  check(spoken.length === 2 && speakingText() === null, 'Returning to Play repeated the welcome')
  useWalkthrough.getState().togglePlay()
  await delay(1800)
  check(spoken.length === 3 && useMode.getState().mode === 'study', 'Explicit Play control failed')
  unmount(); mount(id)
  await delay(2200)
  check(spoken.length === 3 && speakingText() === null, 'Remount repeated the Study script')
  unmount()
  // Enter directly into Play to exercise StrictMode setup/cleanup there too.
  useMode.getState().setMode('play')
  mount(id + '-direct')
  await delay(1200)
  check(spoken.length === 4, 'Direct first Play mount lost its welcome in StrictMode')
  useMode.getState().setMode('study')
  await delay(100)
  useMode.getState().setMode('play')
  await delay(100)
  useMode.getState().setMode('study')
  await delay(2200)
  check(spoken.length === 4 && speakingText() === null, 'Interrupted first entry auto-started on a return')
  unmount()
  return 'PASS: first Study and Play visits, quiet returns, explicit playback, remount persistence, StrictMode, and interrupted entry.'
}
function Lab() {
  const [status, setStatus] = useState('Ready')
  return <main style={{ fontFamily: 'system-ui', maxWidth: 800, margin: '60px auto' }}>
    <h1>First room visit checks</h1>
    <p>Production hooks with simulated speech. No microphone or external services.</p>
    <button disabled={status === 'Running…'} onClick={() => { spoken.length = 0; setStatus('Running…'); void run().then(setStatus, (e) => { unmount(); setStatus(`FAIL: ${e.message}`) }) }}>Run checks</button>
    <p role="status">{status}</p>
  </main>
}
createRoot(document.getElementById('root')!).render(<Lab />)
