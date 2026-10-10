import { stripMarks } from './markup'
import { prefetchVoice, voiceUrl } from './voiceEleven'

// The tutor's voice (ElevenLabs through the server proxy, else the browser's
// speechSynthesis) and ears (SpeechRecognition), with a reading-pace timer
// standing in whenever nothing can speak (no key, no voices, autoplay blocked,
// headless, muted).

const SPEECH = {
  rate: 1.05,
  pitch: 1.12,
  lang: 'en-US',
  // Natural-sounding English voices first (Edge "Online (Natural)", Chrome "Google"), then anything English.
  preferred: [/Aria.*Natural/i, /Jenny.*Natural/i, /Ava.*Natural/i, /Natural|Neural/i, /Google US English/i, /Samantha/i, /Google UK English Female/i],
  readMsPerWord: 330, // caption reading pace when there is no voice
  readBaseMs: 900,
  safetyFactor: 2.6, // once the voice has started, wait at most this x the reading estimate for onend
  minTailMs: 500, // shortest wait after the voice is cut off mid-line
  afterCancelMs: 60, // Chrome can drop an utterance queued right after cancel()
  listenStopMs: 1500, // how long to wait for the recognizer's final result after stop()
  voiceWaitMs: 9_000, // extra time a line stays open while its ElevenLabs audio loads
} as const

let voice: SpeechSynthesisVoice | null = null
let voiceEnabled = true

function pickVoice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis?.getVoices() ?? []
  const en = all.filter((v) => /^en/i.test(v.lang))
  for (const re of SPEECH.preferred) {
    const hit = en.find((v) => re.test(v.name) && /en[-_]US/i.test(v.lang)) ?? en.find((v) => re.test(v.name))
    if (hit) return hit
  }
  return en.find((v) => /en[-_]US/i.test(v.lang)) ?? en[0] ?? null
}

// Voices load asynchronously in Chrome; pick again whenever the list changes.
if (typeof window !== 'undefined' && window.speechSynthesis) {
  voice = pickVoice()
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    voice = pickVoice()
  })
}

export const readingMs = (text: string) =>
  SPEECH.readBaseMs + stripMarks(text).split(/\s+/).filter(Boolean).length * SPEECH.readMsPerWord

export function setVoiceEnabled(on: boolean) {
  voiceEnabled = on
  if (!on) {
    window.speechSynthesis?.cancel() // the browser voice finishes at reading pace (u.onerror)
    current?.onMute?.()
  }
}

// Warm the ElevenLabs audio for a line that is about to be spoken. Stripped
// like speak() strips it, so the prefetch and the real line share one fetch.
export function prefetchSpeech(text: string) {
  if (voiceEnabled) prefetchVoice(stripMarks(text))
}

interface Speaking {
  text: string
  utterance: SpeechSynthesisUtterance | null // held so Chrome can't garbage-collect it mid-line
  audio: HTMLAudioElement | null
  onMute: (() => void) | null // ElevenLabs clip playing: stop it, finish when it would have
  timer: ReturnType<typeof setTimeout>
  done: boolean
}

let current: Speaking | null = null
let lastCancelAt = -Infinity

// The plain text being spoken right now, or null.
export const speakingText = () => (current && !current.done ? current.text : null)

export function stopSpeaking() {
  if (!current) return
  current.done = true
  clearTimeout(current.timer)
  current.audio?.pause()
  current = null
  const syn = window.speechSynthesis
  if (syn && (syn.speaking || syn.pending)) {
    syn.cancel()
    lastCancelAt = performance.now()
  }
}

// Speaks `text` (marks stripped) and calls onEnd once, when the voice ends or
// the fallback timer fires. A newer speak() or stopSpeaking() cancels it
// without calling onEnd.
export function speak(text: string, onEnd: () => void) {
  stopSpeaking()
  const plain = stripMarks(text)
  const estimate = readingMs(plain)
  const me: Speaking = { text: plain, utterance: null, audio: null, onMute: null, timer: 0 as unknown as ReturnType<typeof setTimeout>, done: false }
  const finish = () => {
    if (me.done) return
    me.done = true
    clearTimeout(me.timer)
    me.audio?.pause()
    if (current === me) current = null
    onEnd()
  }
  current = me
  if (!voiceEnabled) {
    me.timer = setTimeout(finish, estimate)
    return
  }
  // ElevenLabs first; the line stays open while its audio loads.
  me.timer = setTimeout(finish, estimate + SPEECH.voiceWaitMs)
  void voiceUrl(plain).then((url) => {
    if (me.done) return
    if (url && voiceEnabled) playAudio(me, url, estimate, finish)
    else speakBrowser(me, estimate, finish) // muted while loading: the reading timer only
  })
}

// Plays the ElevenLabs line; falls back to the browser voice if playback fails
// (decode error, autoplay blocked).
function playAudio(me: Speaking, url: string, estimate: number, finish: () => void) {
  const audio = new Audio(url)
  me.audio = audio
  const fallBack = () => {
    if (me.done || me.audio !== audio || !voiceEnabled) return
    me.audio = null
    me.onMute = null
    speakBrowser(me, estimate, finish)
  }
  me.onMute = () => {
    if (me.done) return
    audio.pause()
    clearTimeout(me.timer)
    const left = Number.isFinite(audio.duration) && audio.duration > 0 ? (audio.duration - audio.currentTime) * 1000 : estimate
    me.timer = setTimeout(finish, Math.max(left, SPEECH.minTailMs))
  }
  // Audio really started: trade the load timer for a safety net sized to the clip.
  audio.onplaying = () => {
    if (me.done) return
    clearTimeout(me.timer)
    const ms = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : estimate
    me.timer = setTimeout(finish, ms * SPEECH.safetyFactor + SPEECH.minTailMs)
  }
  audio.onended = finish
  audio.onerror = fallBack
  audio.play().catch(fallBack)
}

// The browser voice, with the reading timer as its floor.
function speakBrowser(me: Speaking, estimate: number, finish: () => void) {
  const plain = me.text
  clearTimeout(me.timer)
  me.timer = setTimeout(finish, estimate)
  const syn = window.speechSynthesis
  if (!voiceEnabled || !syn || typeof SpeechSynthesisUtterance === 'undefined') return
  try {
    const u = new SpeechSynthesisUtterance(plain)
    if (!voice) voice = pickVoice()
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? SPEECH.lang
    u.rate = SPEECH.rate
    u.pitch = SPEECH.pitch
    let startedAt = 0
    // Speech really started: trade the reading timer for a generous safety net.
    u.onstart = () => {
      if (me.done) return
      startedAt = performance.now()
      clearTimeout(me.timer)
      me.timer = setTimeout(finish, estimate * SPEECH.safetyFactor)
    }
    u.onend = finish
    // Blocked before it started: the reading timer is still running. Cut off
    // mid-line (muted): finish at reading pace from here.
    u.onerror = () => {
      if (me.done || !startedAt) return
      clearTimeout(me.timer)
      me.timer = setTimeout(finish, Math.max(estimate - (performance.now() - startedAt), SPEECH.minTailMs))
    }
    me.utterance = u
    const delay = Math.max(0, SPEECH.afterCancelMs - (performance.now() - lastCancelAt))
    if (delay > 0) setTimeout(() => !me.done && syn.speak(u), delay)
    else syn.speak(u)
  } catch {
    // The reading timer still ends the line.
  }
}

// ---- Listening

interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

interface Recognizer {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: RecognitionResultEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognizerCtor = new () => Recognizer

function recognizerCtor(): RecognizerCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const canRecognize = () => typeof window !== 'undefined' && recognizerCtor() !== null

interface Listening {
  rec: Recognizer
  finalText: string
  interim: string
  ended: boolean
  waiters: ((text: string) => void)[]
}

let listening: Listening | null = null

// Starts transcribing the student's question. Returns false when the browser has no recognizer.
export function startRecognition(onInterim: (text: string) => void): boolean {
  const Ctor = recognizerCtor()
  if (!Ctor) return false
  cancelRecognition()
  try {
    const rec = new Ctor()
    const me: Listening = { rec, finalText: '', interim: '', ended: false, waiters: [] }
    rec.lang = SPEECH.lang
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) me.finalText += r[0].transcript
        else interim += r[0].transcript
      }
      me.interim = interim
      onInterim((me.finalText + interim).trim())
    }
    const end = () => {
      if (me.ended) return
      me.ended = true
      const text = (me.finalText + ' ' + me.interim).trim()
      me.waiters.splice(0).forEach((w) => w(text))
      if (listening === me) listening = null
    }
    rec.onend = end
    rec.onerror = end
    rec.start()
    listening = me
    return true
  } catch {
    return false
  }
}

export const isRecognizing = () => listening !== null

// Stops listening and resolves with what was heard ('' if nothing).
export function stopRecognition(): Promise<string> {
  const me = listening
  if (!me) return Promise.resolve('')
  return new Promise((resolve) => {
    me.waiters.push(resolve)
    try {
      me.rec.stop()
    } catch {
      me.rec.onend?.()
    }
    // Some engines never fire onend after stop(); resolve with what we have.
    setTimeout(() => me.rec.onend?.(), SPEECH.listenStopMs)
  })
}

export function cancelRecognition() {
  const me = listening
  if (!me) return
  listening = null
  me.ended = true
  me.waiters.splice(0).forEach((w) => w(''))
  try {
    me.rec.abort()
  } catch {
    // already stopped
  }
}
