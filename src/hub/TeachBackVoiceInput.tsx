import { useEffect, useRef, useState } from 'react'
import { TEACH_BACK_LIMITS } from '../../shared/teachBack'
import { errorText, transcribeTeachBack } from '../ui/Drawers/docsClient'
import { startTeachBackRecording, type TeachBackRecording } from './teachBackRecording'
import { useTeachBack } from './teachBackStore'
import s from './TeachBack.module.css'

export type VoicePhase = 'idle' | 'starting' | 'recording' | 'transcribing'
export function TeachBackVoiceInput({ topicId, active, disabled, onPhase, beforeListen }: {
  topicId: string; active: boolean; disabled: boolean
  onPhase: (phase: VoicePhase) => void; beforeListen: () => void
}) {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [preview, setPreview] = useState('')
  const [level, setLevel] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const recording = useRef<TeachBackRecording | null>(null)
  const savedAudio = useRef<Blob | null>(null)
  const submitAfter = useRef(false)
  const baseDraft = useRef('')
  const phaseRef = useRef<VoicePhase>('idle')
  const draft = useTeachBack((state) => state.practices[topicId]?.draft ?? '')
  const changePhase = (value: VoicePhase) => { phaseRef.current = value; setPhase(value); onPhase(value) }

  useEffect(() => {
    if (!active) { operation.current?.abort(); recording.current?.cancel(); savedAudio.current = null; setRetry(false); setPhase('idle'); phaseRef.current = 'idle'; onPhase('idle') }
    return () => { operation.current?.abort(); recording.current?.cancel(); onPhase('idle') }
  }, [active, topicId, onPhase])
  useEffect(() => {
    if (phase !== 'recording') return
    const started = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250)
    return () => clearInterval(timer)
  }, [phase])

  const process = async (blob: Blob, controller: AbortController) => {
    if (controller.signal.aborted) return
    savedAudio.current = blob
    changePhase('transcribing'); setError(null); setRetry(false)
    const response = await transcribeTeachBack(blob, controller.signal)
    if (controller.signal.aborted) return
    if (!response.ok) { changePhase('idle'); setError(errorText(response.error)); setRetry(true); return }
    const combined = [baseDraft.current.trim(), response.data.text.trim()].filter(Boolean).join(' ')
    if (combined.length > TEACH_BACK_LIMITS.maxChars) {
      changePhase('idle'); setError('This would exceed 3,000 characters. Shorten your existing transcript or start a shorter take.'); setRetry(false); return
    }
    useTeachBack.getState().edit(topicId, combined)
    savedAudio.current = null
    setPreview(''); changePhase('idle')
    if (submitAfter.current && combined.length >= TEACH_BACK_LIMITS.minChars) void useTeachBack.getState().grade(topicId)
    else if (submitAfter.current) setError('Tell Mochee a little more before grading. You can add another take or type a few more sentences.')
  }
  const start = async () => {
    if (!active || disabled || phaseRef.current !== 'idle') return
    beforeListen()
    operation.current?.abort()
    const controller = new AbortController()
    operation.current = controller
    baseDraft.current = useTeachBack.getState().practices[topicId]?.draft ?? ''
    savedAudio.current = null; submitAfter.current = false
    setRetry(false); setError(null); setPreview(''); setSeconds(0); setLevel(0); changePhase('starting')
    const live = await startTeachBackRecording({ signal: controller.signal,
      onPreview: setPreview, onLevel: setLevel,
      onComplete: (blob) => { recording.current = null; void process(blob, controller) },
      onError: (message) => { if (!controller.signal.aborted) { changePhase('idle'); setError(message) } },
    })
    if (controller.signal.aborted) { live?.cancel(); return }
    recording.current = live
    if (live) changePhase('recording')
  }
  const finish = (submit: boolean) => {
    if (phaseRef.current !== 'recording') return
    submitAfter.current = submit
    changePhase('transcribing')
    recording.current?.stop()
  }
  const cancel = () => {
    operation.current?.abort(); recording.current?.cancel(); recording.current = null
    savedAudio.current = null; setRetry(false); setPreview(''); setError(null); changePhase('idle')
  }

  return (
    <div className={s.voice} data-testid="teach-back-voice">
      <div className={s.voiceStatus} role="status">
        <b>{phase === 'recording' ? 'Mochee is listening' : phase === 'transcribing' ? 'Putting your words together…' : phase === 'starting' ? 'Opening your microphone…' : 'Tell Mochee what you know'}</b>
        <span>{phase === 'recording' ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} / 2:00` : 'Speak naturally. Take your time.'}</span>
      </div>
      <div className={s.meter} aria-hidden="true">{[.4, .7, 1, .6, .9, .5, .75].map((size, i) => <i key={i} style={{ height: `${6 + level * size * 34}px` }} />)}</div>
      {phase === 'idle' && <button type="button" className={s.primary} disabled={disabled || !active} onClick={() => void start()}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></svg>
        {draft ? 'Keep explaining' : 'Start speaking'}
      </button>}
      {phase === 'recording' && <>
        <button type="button" className={s.primary} onClick={() => finish(true)}>Finish &amp; get feedback</button>
        <button type="button" className={s.secondary} onClick={() => finish(false)}>Pause &amp; review transcript</button>
      </>}
      {phase !== 'idle' && <button type="button" className={s.citation} onClick={cancel}>Cancel this take</button>}
      {preview && <p className={s.liveTranscript} aria-label="Live transcript">{preview}</p>}
      <p className={s.voiceHint}>Your mic turns off when you finish. Audio is sent for transcription, then your explanation is checked against the material.</p>
      {draft && phase === 'idle' && <details className={s.yourWords}><summary>Review or edit transcript</summary>
        <textarea aria-label="Your spoken explanation" value={draft} maxLength={TEACH_BACK_LIMITS.maxChars} disabled={disabled}
          onChange={(e) => useTeachBack.getState().edit(topicId, e.target.value)} />
        <span>{draft.length}/3,000 characters</span>
      </details>}
      {phase === 'idle' && draft.trim().length >= TEACH_BACK_LIMITS.minChars && <button type="button" className={s.primary} disabled={disabled} onClick={() => { beforeListen(); void useTeachBack.getState().grade(topicId) }}>Grade my explanation</button>}
      {error && <p className={s.error} role="alert">{error}</p>}
      {retry && <button type="button" className={s.secondary} disabled={disabled} onClick={() => {
        const blob = savedAudio.current
        if (!blob) return
        const controller = new AbortController(); operation.current = controller
        baseDraft.current = useTeachBack.getState().practices[topicId]?.draft ?? ''
        void process(blob, controller)
      }}>Retry transcription</button>}
    </div>
  )
}
