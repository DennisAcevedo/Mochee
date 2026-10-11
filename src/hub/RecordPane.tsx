import { useEffect, useRef, useState } from 'react'
import type { DocumentInfo } from '../../shared/docsTypes'
import { STUDY_LIMITS } from '../../shared/lessonPack'
import { errorText, uploadLecture } from '../ui/Drawers/docsClient'
import { useDocs } from '../ui/Drawers/docsStore'
import s from './Hub.module.css'

// Record a Lecture: MediaRecorder with a live level meter. Stop uploads the
// audio; the server transcribes it and saves the transcript as a document in
// this class. An audio file input does the same for a recording made elsewhere.

const MIC_TEXT: Record<string, string> = {
  NotAllowedError: 'Microphone access was blocked. Allow it in the address bar and try again.',
  NotFoundError: 'No microphone was found.',
  NotReadableError: 'The microphone is busy in another app.',
}

const ERROR_EXTRA: Record<string, string> = {
  'not-audio': 'That file is not audio (webm, ogg, wav, mp3, m4a or mp4).',
  'too-large': `That recording is over ${Math.round(STUDY_LIMITS.maxAudioBytes / (1024 * 1024))} MB. Split it into shorter parts.`,
  'no-text': 'No speech was found in that recording, so nothing was saved.',
}

// ~24 kbps opus fits ~70 minutes in 12 MB; Chrome's default (~118 kbps) fills it in ~14.
const REC_OPTS: MediaRecorderOptions = { audioBitsPerSecond: 24000 }
const REC_MIME = 'audio/webm;codecs=opus'
const AUTO_STOP = 0.95 // stop on our own at this share of the upload limit
const HEARD_MIN = 0.04 // loudest meter peak a take must reach to count as speech, not room noise

type Phase = 'idle' | 'starting' | 'recording' | 'saving'

interface Live {
  stream: MediaStream
  ctx: AudioContext
  recorder: MediaRecorder
  raf: number
  timer: number
}

const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-')

export function RecordPane({ tutorId }: { tutorId: string | null }) {
  const addDocument = useDocs((d) => d.addDocument)
  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState(0)
  const [secs, setSecs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<{ blob: Blob; name: string } | null>(null)
  const [saved, setSaved] = useState<DocumentInfo | null>(null)
  const live = useRef<Live | null>(null)
  const mounted = useRef(true)

  const teardown = () => {
    const l = live.current
    if (!l) return
    live.current = null
    cancelAnimationFrame(l.raf)
    window.clearInterval(l.timer)
    l.stream.getTracks().forEach((t) => t.stop())
    void l.ctx.close().catch(() => {})
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const l = live.current
      // Leaving the view mid-recording uploads what was recorded (onstop -> send) instead of dropping it.
      if (l && l.recorder.state !== 'inactive') l.recorder.stop()
      teardown()
    }
  }, [])

  const send = async (blob: Blob, name: string) => {
    if (!tutorId) return
    if (mounted.current) {
      setPhase('saving')
      setRetry(null)
    }
    const res = await uploadLecture(blob, tutorId, name)
    if (res.ok) addDocument(res.data) // the store is module-level; it ignores another class's doc
    if (!mounted.current) return
    setPhase('idle')
    if (res.ok) setSaved(res.data)
    else {
      setError(ERROR_EXTRA[res.error] ?? errorText(res.error))
      if (res.error !== 'too-large' && res.error !== 'not-audio') setRetry({ blob, name })
    }
  }

  const startRec = async () => {
    if (phase !== 'idle' || live.current) return
    setError(null)
    setSaved(null)
    setRetry(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Upload an audio file instead.')
      return
    }
    let stream: MediaStream
    setPhase('starting') // blocks a second click while the permission prompt is open
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setPhase('idle')
      setError(MIC_TEXT[(err as DOMException).name] ?? 'Could not open the microphone.')
      return
    }
    if (!mounted.current) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(REC_MIME) ? { ...REC_OPTS, mimeType: REC_MIME } : REC_OPTS)
    const chunks: Blob[] = []
    let bytes = 0
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
      bytes += e.data.size
      if (bytes >= STUDY_LIMITS.maxAudioBytes * AUTO_STOP && recorder.state === 'recording') {
        if (mounted.current) setError('Recording stopped: it reached the upload size limit. It is being saved now.')
        stopRec()
      }
    }
    let heard = 0
    recorder.onstop = () => {
      // A silent take is never uploaded: a transcriber can invent a lecture from silence.
      if (heard < HEARD_MIN) {
        if (mounted.current) {
          setPhase('idle')
          setError('I didn’t hear any speech in that recording, so nothing was saved. Check the mic and try again.')
        }
        return
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm'
      void send(blob, `Lecture ${stamp()}.${ext}`)
    }
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128)
      heard = Math.max(heard, peak)
      setLevel(peak)
      if (live.current) live.current.raf = requestAnimationFrame(tick)
    }
    const t0 = Date.now()
    live.current = { stream, ctx, recorder, raf: 0, timer: window.setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250) }
    recorder.start(10000) // 10 s chunks so the size check runs while recording
    setSecs(0)
    setPhase('recording')
    tick()
  }

  const stopRec = () => {
    const l = live.current
    if (!l) return
    if (l.recorder.state !== 'inactive') l.recorder.stop() // onstop uploads
    teardown()
    setLevel(0)
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    setError(null)
    setSaved(null)
    void send(file, file.name)
  }

  if (!tutorId) return <p className={s.empty}>Open a class to record a lecture.</p>

  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')

  return (
    <div className={s.view}>
      <div className={s.recBox}>
        {phase === 'recording' ? (
          <button type="button" className={s.recBtn} data-live onClick={stopRec} aria-label="Stop recording" data-testid="record-stop">
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className={s.recBtn}
            onClick={() => void startRec()}
            disabled={phase !== 'idle'}
            aria-label="Start recording"
            data-testid="record-start"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
        <span className={s.recTime} aria-live="off">
          {mm}:{ss}
        </span>
        <div className={s.meter} role="meter" aria-label="Input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <span style={{ width: `${Math.min(100, Math.round(level * 140))}%` }} />
        </div>
        <span className={s.muted}>
          {phase === 'recording' ? 'Listening… press stop when class ends.' : phase === 'saving' ? 'Gemini is writing the transcript…' : 'Record class in the browser. The transcript joins your material.'}
        </span>
      </div>
      <label className={s.fileLabel}>
        Or upload an audio file{' '}
        <input
          type="file"
          accept="audio/*"
          disabled={phase !== 'idle'}
          data-testid="record-file"
          onChange={(e) => {
            onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {retry && phase === 'idle' && (
        <button type="button" className={s.fileLabel} data-testid="record-retry" onClick={() => void send(retry.blob, retry.name)}>
          Try the upload again
        </button>
      )}
      {saved && (
        <div className={s.building} data-testid="record-saved">
          <h3 className={s.kicker}>Saved to your material</h3>
          <span className={s.rowTitle}>{saved.title}</span>
          {saved.topics.length > 0 ? (
            <span className={s.chips}>
              {saved.topics.map((t) => (
                <span key={t.id} className={s.chip}>
                  {t.title}
                </span>
              ))}
            </span>
          ) : (
            <span className={s.muted}>No topics found in the transcript.</span>
          )}
        </div>
      )}
    </div>
  )
}
