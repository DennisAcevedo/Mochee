// Real fight store / HUD, scripted quiz API, isolated rewards. No account writes.
import '@fontsource/figtree/800.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { DocumentInfo } from '../shared/docsTypes'
import { archetypeFor } from '../src/boss/archetypes'
import { bossMatch, PLAYER_HP } from '../src/boss/balance'
import { BOSS, useBoss } from '../src/boss/bossStore'
import { BossLayer } from '../src/boss/BossLayer'
import { useBossMastery } from '../src/boss/mastery'
import { bossCues } from '../src/boss/cues'
import { useProgress } from '../src/state/progress'

const doc: DocumentInfo = { id: 'balance-fixture', title: 'Boss difficulty preview', pageCount: 1, createdAt: '', tutorId: 'lab', original: 'txt', kind: 'class', topics: [] }
doc.topics = Array.from({ length: 6 }, (_, i) => ({ id: `boss-${i}`, documentId: doc.id, title: ['Sets', 'Functions', 'Logic', 'Counting', 'Relations', 'Proofs'][i], keywords: [], firstPage: 1 }))
let coins = 0, awards = 0, count = 5, failSubmit = false
useProgress.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } })
useBossMastery.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } })
useProgress.setState({ award: (_reason, amount = 0) => { coins += amount; awards++ } })
useBossMastery.setState({ master() {} })
bossCues.strike = () => {}
window.fetch = async (url, init) => {
  const path = String(url)
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  if (path.startsWith('/api/documents') && !path.includes('/pages/')) return json([doc])
  if (path.includes('/pages/')) return json({ documentId: doc.id, page: 1, text: 'Review your topic and answer each question. This preview uses scripted questions.', chunks: [] })
  if (path === '/api/quiz') return json({ documentId: doc.id, questions: Array.from({ length: count }, (_, i) => ({ id: `${body.topicId}-q${i}`, topicId: body.topicId, page: 1, prompt: `Practice question ${i + 1}: choose the correct explanation.`, choices: ['Correct explanation', 'A misconception', 'Unrelated information', 'Another misconception'] })) })
  if (path === '/api/quiz/submit') return failSubmit ? json({ error: 'upstream' }, 503) : json({ correct: body.choice === 0, correctChoice: 0, explanation: 'The first choice explains this concept correctly.', citation: { page: 1, quote: '' } })
  return json({}, 503)
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message) }

async function runChecks() {
  const s = () => useBoss.getState()
  coins = awards = 0
  await s().open(doc.id, 'lab')
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const topic = doc.topics.find((t) => archetypeFor(t).difficulty === difficulty)!
    await s().pickTopic(topic.id)
    const match = bossMatch(difficulty)
    check(s().maxHp === match.maxHp && s().reward === match.coins && s().queue.length === match.questions, 'Loaded match stats disagree')
    const before = coins, paid = awards
    // Duplicate clicks cannot submit twice or award twice.
    await Promise.all([s().answer(0), s().answer(0)])
    check(s().hp === match.maxHp - 20, 'Double answer dealt duplicate damage')
    s().next()
    while (s().phase === 'ask') { await s().answer(0); s().next() }
    await delay(BOSS.wonDelayMs + 30)
    check(s().phase === 'won' && coins - before === match.coins && awards === paid + 1, 'Win did not award exactly the displayed coins')
    await s().answer(0); s().next()
    check(awards === paid + 1, 'Win paid twice')
  }
  const hard = doc.topics.find((t) => archetypeFor(t).difficulty === 'hard')!
  await s().pickTopic(hard.id)
  await s().answer(0); s().next()
  const hp = s().hp, paid = awards
  for (let i = 0; i < 3; i++) { await s().answer(1); s().next() }
  await delay(BOSS.lostDelayMs + 30)
  check(s().phase === 'lost' && s().playerHp === 0 && awards === paid, 'Loss damage or payout incorrect')
  s().retry()
  check(s().playerHp === PLAYER_HP && s().hp === hp && s().reward === 150, 'Retry lost match progress')
  failSubmit = true
  await s().answer(0)
  check(s().phase === 'ask' && s().hp === hp && awards === paid, 'Failed request changed health/reward')
  failSubmit = false; count = 1
  await s().pickTopic(hard.id)
  check(s().hp === 20 && s().reward === 30 && s().queue.length === 1, 'Short bank did not scale')
  const before = coins
  await s().answer(0); await delay(BOSS.wonDelayMs + 30)
  check(coins - before === 30, 'Short bank payout incorrect')
  s().close(); count = 5
  return 'PASS: all three tiers, damage, exact payouts, duplicate clicks, loss/retry, failed requests, and short question banks.'
}
function Lab() {
  const [report, setReport] = useState('Ready')
  const [preview, setPreview] = useState(false)
  return <main style={{ fontFamily: 'Figtree, sans-serif', padding: 30 }}>
    <h1>Boss balance checks</h1>
    <p>Scripted quiz responses and test coins only. No real documents or wallet changes.</p>
    <button disabled={report === 'Running…'} onClick={() => { setReport('Running…'); void runChecks().then(setReport, (err) => setReport(`FAIL: ${err.message}`)) }}>Run fight checks</button>
    <button onClick={() => { setPreview(true); void useBoss.getState().open(doc.id, 'lab') }}>Preview boss picker</button>
    <p role="status">{report}</p>
    {preview && <BossLayer />}
  </main>
}
createRoot(document.getElementById('root')!).render(<Lab />)
