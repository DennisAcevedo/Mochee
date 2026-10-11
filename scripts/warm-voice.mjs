// Run against the local dev/preview server. Its normal cache and daily budget apply.
import { createServer } from 'vite'

const base = new URL(process.argv[2] ?? 'http://localhost:5176')
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
  throw new Error('Voice warming expects a local development server.')
}
const loader = await createServer({
  configFile: false,
  cacheDir: 'tmp/voice-loader',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
})
let lines
try {
  const { WALKTHROUGH } = await loader.ssrLoadModule('/src/lesson/walkthrough.ts')
  const { BUILTIN_QUESTIONS } = await loader.ssrLoadModule('/src/lesson/quickCheck.ts')
  const { script } = await loader.ssrLoadModule('/src/data/mockLesson.ts')
  const { PLAY_WELCOME } = await loader.ssrLoadModule('/src/play/playLines.ts')
  lines = [...new Set([script.greeting, ...WALKTHROUGH.map((step) => step.say), ...BUILTIN_QUESTIONS.flatMap((q) => [q.praise, q.hint]), ...BUILTIN_QUESTIONS.map((_, i) => `Next one! Question ${i + 1} of ${BUILTIN_QUESTIONS.length}.`), PLAY_WELCOME.first, ...PLAY_WELCOME.again]
    .map((text) => text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()))]
} finally {
  await loader.close()
}
let hits = 0
for (const [index, text] of lines.entries()) {
  const response = await fetch(new URL('/api/tts', base), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }), signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Voice warming stopped at line ${index + 1}: HTTP ${response.status}. Check voice configuration or the daily budget.`)
  }
  await response.arrayBuffer() // Only complete clips become cache entries.
  if (response.headers.get('x-tts-cache') === 'hit') hits++
  console.log(`Prepared ${index + 1}/${lines.length}`)
}
console.log(`Ready: ${lines.length} lines (${hits} already cached, ${lines.length - hits} synthesized).`)
