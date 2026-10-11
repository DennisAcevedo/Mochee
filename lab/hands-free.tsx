// Production talk bar with a synthetic recognizer. No microphone or network calls.
import '@fontsource/figtree/800.css'
import '@fontsource/nunito/600.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { InputBar } from '../src/ui/InputBar/InputBar'
import { useTutorStore } from '../src/state/store'
import { useMode } from '../src/state/mode'
import type { HandsFreeRecognizer } from '../src/lesson/handsFree'

let current: SyntheticRecognizer | null = null
class SyntheticRecognizer implements HandsFreeRecognizer {
  lang = ''; continuous = false; interimResults = false
  onresult: HandsFreeRecognizer['onresult'] = null
  onend: HandsFreeRecognizer['onend'] = null
  onerror: HandsFreeRecognizer['onerror'] = null
  start() { current = this }
  stop() { this.onend?.() }
  abort() { if (current === this) current = null }
  say() { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'Why do short jobs wait behind a long job?' }], { isFinal: true })] }) }
}
Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: SyntheticRecognizer })
window.fetch = async () => new Response('{}', { status: 503 })
useTutorStore.setState({ phase: 'live', ask: (text) => {
  useTutorStore.setState((s) => ({ draft: '', mic: 'idle', awaitingReply: true, lines: [...s.lines, { who: 'student', time: '12:00', text }] }))
  setTimeout(() => {
    useTutorStore.setState({ awaitingReply: false, mic: 'speaking' })
    setTimeout(() => useTutorStore.setState({ mic: 'idle' }), 1500)
  }, 1000)
} })

function Lab() {
  const lines = useTutorStore((s) => s.lines)
  const mic = useTutorStore((s) => s.mic)
  const pending = useTutorStore((s) => s.awaitingReply)
  const mode = useMode((s) => s.mode)
  const [compact, setCompact] = useState(false)
  return <main>
    <style>{`body{margin:0;background:#f2eee7;color:#1d1b24;font-family:Nunito,system-ui} main{padding:64px 24px;max-width:1150px;margin:auto} h1{font-family:Figtree,system-ui} .preview{padding:35px 0} .preview>div{width:calc(100% - 24px)} .checks{display:flex;flex-wrap:wrap;gap:12px} .checks button{padding:10px;border:2px solid;border-radius:8px;background:#fffaf1;cursor:pointer} output{display:block;margin-top:24px}`}</style>
    <h1>Hands-free questions for Mochee</h1>
    <p>Select Hands-free, speak your question, and pause briefly. Mochee answers before listening again.</p>
    <div className="preview"><InputBar compact={compact} /></div>
    <div className="checks">
      <button onClick={() => current?.say()}>Speak a test question</button>
      <button onClick={() => current?.onerror?.({ error: 'not-allowed' })}>Simulate permission denied</button>
      <button onClick={() => useMode.getState().setMode(mode === 'study' ? 'play' : 'study')}>Switch to {mode === 'study' ? 'Play' : 'Study'}</button>
      <button onClick={() => setCompact((v) => !v)}>Toggle compact</button>
    </div>
    <output aria-live="polite">{pending ? 'Thinking' : mic === 'speaking' ? 'Mochee answering' : mic === 'listening' ? 'Listening for your next question' : 'Microphone off'} · {lines.length} questions sent</output>
    {lines.map((line, i) => <p key={i}>{line.text}</p>)}
    <p>Synthetic microphone and scripted answer timing for verification. No real audio is captured.</p>
  </main>
}
createRoot(document.getElementById('root')!).render(<Lab />)
