import { TEACH_BACK_LIMITS } from '../../shared/teachBack.ts'

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  start(): void
  abort(): void
}
export interface TeachBackRecording { stop(): void; cancel(): void }
interface RecordingOptions {
  signal: AbortSignal
  onPreview(text: string): void
  onLevel(level: number): void
  onComplete(blob: Blob): void
  onError(message: string): void
}

export const micError = (error: unknown) => ({
  NotAllowedError: 'Microphone access was blocked. Allow it in your browser, or choose Type instead.',
  NotFoundError: 'No microphone was found. Connect one, or choose Type instead.',
  NotReadableError: 'The microphone is busy. Close other recording apps and try again.',
}[String((error as { name?: string })?.name)] ?? 'The microphone couldn’t start. Try again, or choose Type instead.')

// Records locally until Finish. Browser speech recognition adds optional live captions;
// Gemini transcribes the complete recording so pauses or dropped captions cannot lose words.
export async function startTeachBackRecording(options: RecordingOptions): Promise<TeachBackRecording | null> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    options.onError('Microphone recording isn’t available in this browser. Choose Type instead.')
    return null
  }
  let stream: MediaStream
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }) }
  catch (error) { if (!options.signal.aborted) options.onError(micError(error)); return null }
  if (options.signal.aborted) { stream.getTracks().forEach((t) => t.stop()); return null }
  let recorder: MediaRecorder
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m))
    recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 })
  } catch (error) { stream.getTracks().forEach((t) => t.stop()); options.onError(micError(error)); return null }
  let cancelled = false
  let finished = false
  let size = 0
  let ctx: AudioContext | undefined
  let meter: ReturnType<typeof setInterval> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let recognition: Recognition | undefined
  let peak = 0
  let measured = false
  const chunks: Blob[] = []
  const cleanup = () => {
    clearInterval(meter); clearTimeout(timer)
    stream.getTracks().forEach((t) => t.stop())
    try { recognition?.abort() } catch { /* already ended */ }
    if (ctx) void ctx.close().catch(() => {})
    options.signal.removeEventListener('abort', cancel)
  }
  const cancel = () => {
    if (finished) return
    cancelled = true; finished = true
    recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null
    try { if (recorder.state !== 'inactive') recorder.stop() } catch { /* already stopped */ }
    cleanup()
  }
  const stop = () => {
    if (finished || recorder.state === 'inactive') return
    try { recorder.stop() } catch { cancel(); options.onError('Recording stopped unexpectedly. Please try again.') }
  }
  options.signal.addEventListener('abort', cancel, { once: true })
  recorder.ondataavailable = (event) => {
    if (cancelled || !event.data.size) return
    size += event.data.size
    if (size > TEACH_BACK_LIMITS.maxAudioBytes) { cancel(); options.onError('That recording is too large. Try a shorter explanation.'); return }
    chunks.push(event.data)
  }
  recorder.onerror = () => { cancel(); options.onError('Recording was interrupted. Check your microphone and try again.') }
  recorder.onstop = () => {
    if (cancelled || finished) return
    finished = true; cleanup()
    const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' })
    if (!blob.size || (measured && peak < 0.008)) { options.onError('I couldn’t hear any speech. Check your microphone and try again.'); return }
    options.onComplete(blob)
  }
  try {
    ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    ctx.createMediaStreamSource(stream).connect(analyser)
    void ctx.resume().catch(() => {})
    const samples = new Uint8Array(analyser.fftSize)
    meter = setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      const level = samples.reduce((max, value) => Math.max(max, Math.abs(value - 128) / 128), 0)
      if (ctx?.state === 'running') { measured = true; peak = Math.max(peak, level) }
      options.onLevel(Math.min(1, level * 5))
    }, 90)
  } catch { /* recording still works when the level meter is unavailable */ }
  try {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (Ctor) {
      recognition = new Ctor()
      recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true
      recognition.onresult = (event) => { if (!finished && !cancelled) options.onPreview(Array.from(event.results, (r) => r[0]?.transcript ?? '').join(' ').trim()) }
      recognition.onerror = () => {} // the complete audio remains available for transcription
      recognition.start()
    }
  } catch { /* live captions are optional */ }
  try { recorder.start(500) }
  catch (error) { cancel(); options.onError(micError(error)); return null }
  timer = setTimeout(stop, TEACH_BACK_LIMITS.maxRecordingSeconds * 1000)
  return { stop, cancel }
}
