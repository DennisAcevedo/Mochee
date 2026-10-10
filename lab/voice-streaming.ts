import { prepareVoice, voiceUrl } from '../src/lesson/voiceEleven'
import { startLatency, latencyDiagnostics } from '../src/lesson/latency'
import { speak, stopSpeaking } from '../src/lesson/speech'

const output = document.querySelector<HTMLPreElement>('#results')!
const button = document.querySelector<HTMLButtonElement>('#run')!
const originalFetch = window.fetch.bind(window)
const OriginalAudio = window.Audio
const SupportedMediaSource = window.MediaSource
const lines: string[] = []
const show = (line: string) => { lines.push(line); output.textContent = lines.join('\n') }
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const gate = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}
const deadline = <T>(promise: Promise<T>) => new Promise<T>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Test deadline exceeded')), 8000)
  promise.then(resolve, reject).finally(() => clearTimeout(timeout))
})

button.onclick = async () => {
  button.disabled = true
  lines.length = 0
  const suffix = Date.now()
  try {
    assert(MediaSource.isTypeSupported('audio/mpeg'), 'This browser does not support streaming MP3 via MediaSource')
    const fixture = await originalFetch('/api/tts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: "Ready? Today we're learning first-come, first-served scheduling. Let's walk through it together!" }),
    })
    assert(fixture.ok, 'Could not load fixture narration')
    const bytes = new Uint8Array(await fixture.arrayBuffer())
    show(`Fixture: ${bytes.length} bytes (${fixture.headers.get('x-tts-cache')})`)
    window.Audio = class extends OriginalAudio { constructor(src?: string) { super(src); this.muted = true } }
    let calls = 0
    let finished = false
    const release = gate()
    window.fetch = async (_input, init) => {
      calls++
      return new Response(new ReadableStream({
        async start(controller) {
          const half = Math.floor(bytes.length / 2)
          controller.enqueue(bytes.slice(0, half))
          await release.promise
          if (init?.signal?.aborted) { controller.error(new Error('cancelled')); return }
          controller.enqueue(bytes.slice(half))
          finished = true
          controller.close()
        },
      }), { headers: { 'content-type': 'audio/mpeg' } })
    }
    const trace = startLatency('speech')
    const clip = await prepareVoice(`early-${suffix}`, new AbortController().signal, trace)
    assert(clip, 'No streaming clip')
    const player = new Audio(clip!.url)
    const played = new Promise<void>((resolve, reject) => {
      player.onplaying = () => { trace.mark('playbackStarted'); resolve() }
      player.onerror = () => reject(new Error('Audio decoding failed'))
    })
    await deadline(player.play())
    await deadline(played)
    assert(!finished, 'Playback waited for the entire clip')
    show('PASS: real browser playback started before the second half of the audio was released')
    release.resolve()
    await deadline(clip!.completed)
    player.pause()
    clip!.dispose()
    const cached = await prepareVoice(`early-${suffix}`, new AbortController().signal, startLatency('speech'))
    assert(cached && calls === 1, 'Replay fetched again')
    show('PASS: replay uses completed audio from cache')
    show(`Streaming timing: ${JSON.stringify(latencyDiagnostics.samples().find((s) => s.marks.playbackStarted !== undefined)?.marks)}`)

    const incoming = gate()
    let aborted = false
    window.fetch = (_input, init) => new Promise((_resolve, reject) => {
      incoming.resolve()
      init?.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('Cancelled', 'AbortError')) }, { once: true })
    })
    let ended = false
    speak(`cancel-${suffix}`, () => { ended = true })
    await incoming.promise
    stopSpeaking()
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert(aborted && !ended, 'Cancellation did not abort the fetch, or advanced the lesson')
    show('PASS: stopSpeaking aborts a pending request without advancing the lesson')

    window.fetch = async () => { calls++; return new Response(bytes, { headers: { 'content-type': 'audio/mpeg' } }) }
    const beforePrefetch = calls
    await Promise.all([voiceUrl(`warm-${suffix}`), voiceUrl(`warm-${suffix}`)])
    assert(calls === beforePrefetch + 1, 'Duplicate prefetch')
    show('PASS: simultaneous prefetches share one request')

    // Simulate a browser without MSE support: retain complete-clip playback.
    Object.defineProperty(window, 'MediaSource', { configurable: true, writable: true, value: undefined })
    const buffered = await prepareVoice(`buffered-${suffix}`, new AbortController().signal, startLatency('speech'))
    assert(buffered, 'Buffered fallback missing')
    const bufferedPlayer = new Audio(buffered!.url)
    await deadline(bufferedPlayer.play())
    bufferedPlayer.pause()
    buffered!.dispose()
    show('PASS: browsers without MSE can still play the buffered audio')
    Object.defineProperty(window, 'MediaSource', { configurable: true, writable: true, value: SupportedMediaSource })

    const failure = gate()
    window.fetch = async () => new Response(new ReadableStream({ async start(controller) {
      controller.enqueue(bytes.slice(0, bytes.length / 2))
      await failure.promise
      controller.error(new Error('simulated connection loss'))
    } }))
    const broken = await prepareVoice(`broken-${suffix}`, new AbortController().signal, startLatency('speech'))
    assert(broken, 'Missing interrupted-stream clip')
    const brokenPlayer = new Audio(broken!.url)
    await deadline(brokenPlayer.play())
    failure.resolve()
    let failed = false
    try { await broken!.completed } catch { failed = true }
    brokenPlayer.pause()
    broken!.dispose()
    assert(failed, 'Interrupted audio was treated as complete')
    show('PASS: interrupted audio reports failure instead of being cached as complete')
    const { useTutorStore } = await import('../src/state/store')
    const { useWalkthrough } = await import('../src/lesson/runner')
    const { useMode } = await import('../src/state/mode')
    const { askGemini } = await import('../src/lesson/askGemini')
    const replies = new Map<string, (value: Response) => void>()
    const cancelled: string[] = []
    window.fetch = (input, init) => {
      if (String(input) !== '/api/ask') return Promise.resolve(new Response(bytes, { headers: { 'content-type': 'audio/mpeg' } }))
      const question = JSON.parse(String(init!.body)).question as string
      return new Promise((resolve, reject) => {
        replies.set(question, resolve)
        init?.signal?.addEventListener('abort', () => {
          cancelled.push(question)
          reject(new DOMException('Cancelled', 'AbortError'))
        }, { once: true })
      })
    }
    useTutorStore.setState({ phase: 'live' })
    useTutorStore.getState().ask('old-question', 'Must not be spoken')
    useTutorStore.getState().ask('new-question', 'Must not be spoken')
    assert(cancelled.includes('old-question'), 'Superseded question was not aborted')
    replies.get('new-question')!(new Response(JSON.stringify({ answer: 'Only the current answer.', gesture: 'talk', focus: 'none', highlight: null }), { headers: { 'content-type': 'application/json' } }))
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert(useTutorStore.getState().lines.at(-1)?.text === 'Only the current answer.', 'A stale answer replaced the current one')
    show('PASS: a superseded question is aborted and only the current answer reaches the tutor')
    useTutorStore.getState().ask('leaving-lesson', 'Must not be spoken')
    useWalkthrough.getState().stop()
    assert(cancelled.includes('leaving-lesson'), 'Leaving the lesson did not cancel its question')
    useTutorStore.getState().ask('switching-mode', 'Must not be spoken')
    useMode.getState().setMode('play')
    assert(cancelled.includes('switching-mode'), 'Switching mode did not cancel its question')
    show('PASS: leaving the lesson or switching mode cancels pending answers')
    const alreadyCancelled = new AbortController()
    alreadyCancelled.abort()
    await askGemini({ question: 'never-send', context: {}, history: [] }, alreadyCancelled.signal)
    assert(!replies.has('never-send'), 'An already-aborted question still fetched')
    show('PASS: an already-aborted request never reaches the server')
    show('ALL 9 BROWSER CHECKS PASSED')
  } catch (error) {
    show(`FAIL: ${String(error)}`)
  } finally {
    stopSpeaking()
    window.fetch = originalFetch
    window.Audio = OriginalAudio
    Object.defineProperty(window, 'MediaSource', { configurable: true, writable: true, value: SupportedMediaSource })
    button.disabled = false
  }
}
