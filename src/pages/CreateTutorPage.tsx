import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ACESFilmicToneMapping } from 'three'
import { CAMERA, RENDER } from '../animation/config'
import { BlenderTutorSafe } from '../character/blender/BlenderTutorSafe'
import { ACCESSORY_DEFAULT_COLORS, type Accessory, type TutorLook } from '../character/look'
import {
  ACCESSORY_OPTIONS,
  ACCESSORY_PALETTE,
  CAP_SWATCHES,
  SUBJECTS,
  SUBJECT_LOOKS,
  VOICES,
  type Subject,
  type VoiceId,
  type VoiceOption,
} from '../data/catalog'
import { formatLabel, UPLOAD_ACCEPT, uploadFormat } from '../../shared/docsTypes'
import { voiceUrl } from '../lesson/voiceEleven'
import { generateLesson, type StudyFile } from '../lesson/generateLesson'
import { Lights } from '../scene/Lights'
import { addTutorFiles } from '../state/fileStore'
import type { Gesture, LoopClip } from '../state/director'
import { formatBytes, newTutorId, useLibrary, type OutlineItem, type Tutor } from '../state/library'
import { BackButton } from '../ui/BackButton/BackButton'
import styles from './CreateTutorPage.module.css'
import { CardShadow } from './HomeScene'

// "/new": design/Create Tutor.dc.html.

const STEP_LABELS = ['Name', 'Notes', 'Look', 'Voice']
const STUDY_STEP = 4

// The live preview is the Blender tutor, standalone at the origin of its own canvas.
const PREVIEW = {
  scale: 1.15, // about the classic preview character's size, with room for raised hands
  x: 0, // world units
} as const

type Flash = 'wave' | 'celebrate' // one-shots the wizard plays over the step's loop

function PreviewTutor({ loop, flash, look }: { loop: LoopClip; flash: { clip: Flash; id: number } | null; look: TutorLook }) {
  const control = useMemo(() => {
    const gesture: Gesture | null = flash ? { id: flash.id, clip: flash.clip } : null
    return { loop, gesture }
  }, [loop, flash])
  return (
    <group position-x={PREVIEW.x} scale={PREVIEW.scale}>
      <CardShadow />
      <Suspense fallback={null}>
        <BlenderTutorSafe
          standalone
          control={control}
          capColor={look.cap || undefined}
          accessory={look.accessory}
          accColor={look.accColor}
        />
      </Suspense>
    </group>
  )
}

interface DraftFile extends StudyFile {
  id: string
  pages?: number
  sample?: boolean
}

const SAMPLE_FILES: DraftFile[] = [
  { id: 'sample-0', name: 'CS111 Lecture 4.pdf', size: 2.4e6, pages: 18, sample: true },
  { id: 'sample-1', name: 'CS111 Lecture 3.pdf', size: 3.1e6, pages: 22, sample: true },
  { id: 'sample-2', name: 'Scheduling cheat sheet.pdf', size: 412e3, pages: 2, sample: true },
]

// Any format the documents backend reads (shared/docsTypes UPLOAD_FORMATS).
const isAccepted = (f: File) => uploadFormat(f.name, f.type) !== null
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

interface Study {
  lines: string[]
  index: number // line in progress; equals lines total once done
  total: number
  done: boolean
}

export function CreateTutorPage() {
  const navigate = useNavigate()
  const addTutor = useLibrary((s) => s.addTutor)

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState<Subject>('Computer science')
  const [lookTouched, setLookTouched] = useState(false)
  const [files, setFiles] = useState<DraftFile[]>([])
  const [drag, setDrag] = useState(false)
  const [cap, setCap] = useState('')
  const [acc, setAcc] = useState<Accessory>('glasses')
  const [accColors, setAccColors] = useState<Partial<Record<Accessory, string>>>({})
  const [voice, setVoice] = useState<VoiceId>('juniper')
  const [playing, setPlaying] = useState<VoiceId | null>(null)
  const [study, setStudy] = useState<Study>({ lines: [], index: 0, total: 5, done: false })
  const [result, setResult] = useState<{ id: string; outline: OutlineItem[] } | null>(null)
  const [flash, setFlash] = useState<{ clip: Flash; id: number } | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const playTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const sample = useRef<HTMLAudioElement | null>(null) // the voice sample playing now
  const studyAbort = useRef<AbortController | null>(null)

  // A one-shot that plays for a moment, then hands back to the step's loop.
  const flashPose = useCallback((clip: Flash, ms: number) => {
    clearTimeout(flashTimer.current)
    setFlash((f) => ({ clip, id: (f?.id ?? 0) + 1 }))
    flashTimer.current = setTimeout(() => setFlash(null), ms)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 80)
    flashPose('wave', 2600)
    return () => {
      clearTimeout(t)
      clearTimeout(flashTimer.current)
      clearTimeout(playTimer.current)
      studyAbort.current?.abort()
      window.speechSynthesis?.cancel()
      sample.current?.pause()
    }
  }, [flashPose])

  const accColor = (acc !== 'none' && (accColors[acc] || ACCESSORY_DEFAULT_COLORS[acc])) || ''
  const voiceOption = VOICES.find((v) => v.id === voice) ?? VOICES[0]
  const canNext = step === 0 ? !!name.trim() : step === 1 ? files.length > 0 : true

  // ---- Notes

  const addFiles = (list: FileList | null | undefined) => {
    const add = Array.from(list ?? [])
      .filter(isAccepted)
      .map((file, i): DraftFile => ({ id: `${Date.now()}-${i}`, name: file.name, size: file.size, file }))
    if (!add.length) return
    setFiles((cur) => [...cur, ...add.filter((a) => !cur.some((f) => f.name === a.name))])
    setDrag(false)
    flashPose('celebrate', 1300)
  }

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (!drag) setDrag(true)
  }
  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return // moving between children
    setDrag(false)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    addFiles(e.dataTransfer?.files)
    setDrag(false)
  }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files)
    e.target.value = ''
  }

  // ---- Look

  const chooseSubject = (s: Subject) => {
    setSubject(s)
    if (lookTouched) return
    setCap(SUBJECT_LOOKS[s].cap)
    setAcc(SUBJECT_LOOKS[s].accessory)
  }
  const chooseCap = (value: string) => {
    setCap(value)
    setLookTouched(true)
    flashPose('celebrate', 1100)
  }
  const chooseAcc = (value: Accessory) => {
    setAcc(value)
    setLookTouched(true)
    flashPose('celebrate', 1100)
  }
  const chooseAccColor = (value: string) => {
    setAccColors((c) => ({ ...c, [acc]: value }))
    setLookTouched(true)
  }

  // ---- Voice: the real ElevenLabs sample, or speechSynthesis when that is unavailable

  const stopSample = () => {
    window.speechSynthesis?.cancel()
    sample.current?.pause()
    sample.current = null
  }

  const playVoice = (v: VoiceOption) => {
    const syn = window.speechSynthesis
    clearTimeout(playTimer.current)
    stopSample()
    if (playing === v.id) {
      setPlaying(null)
      return
    }
    setPlaying(v.id)
    setVoice(v.id)
    const done = () => setPlaying((p) => (p === v.id ? null : p))
    const line = `Hi, I'm ${v.name}. I've read your notes, and I'm ready when you are.`
    void voiceUrl(line, v.eleven).then((url) => {
      if (url) {
        const audio = new Audio(url)
        sample.current = audio
        audio.onended = done
        audio.onerror = done
        void audio.play().catch(done)
        return
      }
      if (!syn) {
        playTimer.current = setTimeout(done, 2600)
        return
      }
      speakFallback(syn, v, line, done)
    })
  }

  const speakFallback = (syn: SpeechSynthesis, v: VoiceOption, line: string, done: () => void) => {
    const u = new SpeechSynthesisUtterance(line)
    const en = syn.getVoices().filter((x) => /^en/i.test(x.lang))
    if (en.length) u.voice = en[v.vi % en.length]
    u.pitch = v.pitch
    u.rate = v.rate
    u.onend = done
    u.onerror = done
    syn.speak(u)
    playTimer.current = setTimeout(done, 9000)
  }

  // ---- Studying

  const startStudy = async () => {
    stopSample()
    setPlaying(null)
    setStep(STUDY_STEP)
    setStudy({ lines: [], index: 0, total: 5, done: false })
    studyAbort.current?.abort()
    const abort = (studyAbort.current = new AbortController())
    const draftName = name.trim()
    try {
      const lesson = await generateLesson(
        { name: draftName, subject },
        files,
        (p) => setStudy((s) => ({ ...s, index: p.index, total: p.total, lines: [...s.lines.slice(0, p.index), p.label] })),
        abort.signal,
      )
      const id = newTutorId(draftName)
      const tutor: Tutor = {
        id,
        name: draftName,
        subject,
        cap,
        accessory: acc,
        accessoryColors: acc === 'none' ? accColors : { ...accColors, [acc]: accColor },
        voice,
        files: files.map(({ id: fid, name: fname, size, pages, sample }) => ({ id: `${id}-${fid}`, name: fname, size, pages, sample })),
        outline: lesson.outline,
        sectionsDone: 0,
        lastStudied: null,
        createdAt: Date.now(),
      }
      addTutor(tutor, lesson.steps)
      void addTutorFiles(
        id,
        files.flatMap((f) => (f.file ? [f.file] : [])),
      )
      setResult({ id, outline: lesson.outline })
      setStudy((s) => ({ ...s, index: s.total, done: true }))
      flashPose('celebrate', 2400)
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') throw e
    }
  }

  const next = () => {
    if (!canNext) return
    if (step === 3) return void startStudy()
    setStep(step + 1)
    if (step + 1 === 2) flashPose('celebrate', 1300)
  }

  const back = () => {
    if (step === 0) return navigate('/')
    window.speechSynthesis?.cancel()
    setPlaying(null)
    setStep(step - 1)
  }

  // ---- Preview

  let loop: LoopClip = 'idle'
  if (step === 1 && drag) loop = 'listen'
  else if (step === 3) loop = playing ? 'talk' : 'listen'
  else if (step === STUDY_STEP) loop = study.done ? 'idle' : 'read'

  const accName = ACCESSORY_OPTIONS.find((a) => a.value === acc)?.label ?? ''
  const studyBar = Math.round((Math.min(study.index + (study.done ? 0 : 0.5), study.total) / study.total) * 100)

  return (
    <div className={styles.page} data-screen-label="Create tutor">
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <BackButton />
            <div className={styles.crumb}>New tutor</div>
          </div>
        </div>

        <div className={styles.columns}>
          <div className={styles.panel}>
            <div className={styles.steps}>
              {STEP_LABELS.map((label, i) => {
                const state = i < step ? 'done' : i === step ? 'current' : 'todo'
                return (
                  <div key={label} className={styles.stepItem}>
                    <div className={styles.dot} data-state={state}>
                      {state === 'done' ? '✓' : i + 1}
                    </div>
                    <div className={styles.stepLabel} data-state={state}>
                      {label}
                    </div>
                    {i < STEP_LABELS.length - 1 && <div className={styles.stepLine} />}
                  </div>
                )
              })}
            </div>

            <div className={styles.content}>
              {step === 0 && (
                <>
                  <Heading title="Name your tutor" sub="Use the course name so it's easy to find later." />
                  <div className={styles.field}>
                    <div className={styles.label}>Tutor name</div>
                    <input
                      ref={nameRef}
                      className={styles.nameInput}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && next()}
                      placeholder="e.g. CS111 · Operating Systems"
                    />
                  </div>
                  <div className={styles.field} data-gap="10">
                    <div className={styles.label}>Subject</div>
                    <div className={styles.chips}>
                      {SUBJECTS.map((s) => (
                        <button key={s} type="button" className={styles.pill} data-on={subject === s} onClick={() => chooseSubject(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <Heading title="Add your notes" sub="Lecture slides, readings, research papers, problem sets." />
                  <label className={styles.drop} data-drag={drag} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
                    <input type="file" accept={UPLOAD_ACCEPT} multiple onChange={onPick} hidden />
                    <div className={styles.dropIcon}>
                      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 17V6M7 10.5L12 5.5l5 5" fill="none" stroke="oklch(0.52 0.1 202)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 19h14" stroke="oklch(0.52 0.1 202)" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className={styles.dropTitle}>{drag ? 'Drop to add' : 'Drop files here'}</div>
                    <div className={styles.dropSub}>
                      or <span className={styles.browse}>browse your files</span>
                    </div>
                    <div className={styles.dropNote}>PDF, Word, PowerPoint, text or images · up to 50 MB each</div>
                  </label>
                  {files.length === 0 && (
                    <button
                      type="button"
                      className={styles.sampleLink}
                      onClick={() => {
                        setFiles(SAMPLE_FILES)
                        flashPose('celebrate', 1300)
                      }}
                    >
                      No files handy? Use sample CS111 notes
                    </button>
                  )}
                  <div className={styles.fileList}>
                    {files.map((f) => (
                      <div key={f.id} className={styles.fileRow}>
                        <div className={styles.pdfIcon}>{formatLabel(f.name)}</div>
                        <div className={styles.fileText}>
                          <div className={styles.fileName}>{f.name}</div>
                          <div className={styles.fileSize}>{formatBytes(f.size)}</div>
                        </div>
                        <div className={styles.ready}>
                          <div className={styles.readyDot} />
                          Ready
                        </div>
                        <button type="button" aria-label="Remove file" className={styles.remove} onClick={() => setFiles((cur) => cur.filter((g) => g.id !== f.id))}>
                          <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M5 5l14 14M19 5L5 19" stroke="#8a857d" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <Heading title="Pick a look" sub="Your tutor wears this in every lesson." />
                  <div className={styles.field} data-gap="12">
                    <div className={styles.label}>Cap color</div>
                    <div className={styles.swatches} data-gap="12">
                      {CAP_SWATCHES.map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          aria-label={c.label}
                          title={c.label}
                          className={styles.ring}
                          data-size="cap"
                          data-on={cap === c.value}
                          onClick={() => chooseCap(c.value)}
                        >
                          <div className={styles.swatch} style={{ background: c.swatch }} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.field} data-gap="12">
                    <div className={styles.label}>Accessory</div>
                    <div className={styles.accGrid}>
                      {ACCESSORY_OPTIONS.map((a) => (
                        <button key={a.value} type="button" className={styles.accCard} data-on={acc === a.value} onClick={() => chooseAcc(a.value)}>
                          <span className={styles.accLabel}>{a.label}</span>
                          <span className={styles.accHint}>{a.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {acc !== 'none' && (
                    <div className={styles.field} data-gap="12">
                      <div className={styles.label}>{accName} color</div>
                      <div className={styles.swatches} data-gap="10">
                        {ACCESSORY_PALETTE.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            aria-label={c.label}
                            title={c.label}
                            className={styles.ring}
                            data-size="acc"
                            data-on={accColor === c.value}
                            onClick={() => chooseAccColor(c.value)}
                          >
                            <div className={styles.swatch} data-edge="true" style={{ background: c.value }} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {step === 3 && (
                <>
                  <Heading title="Pick a voice" sub="Tap play to hear a sample." />
                  <div className={styles.voices}>
                    {VOICES.map((v) => {
                      const on = voice === v.id
                      const isPlaying = playing === v.id
                      return (
                        <div key={v.id} className={styles.voiceCard} data-on={on} onClick={() => setVoice(v.id)}>
                          <button
                            type="button"
                            aria-label={isPlaying ? `Stop ${v.name}` : `Play ${v.name} sample`}
                            className={styles.play}
                            data-on={on}
                            data-playing={isPlaying}
                            onClick={(e) => {
                              e.stopPropagation()
                              playVoice(v)
                            }}
                          >
                            {isPlaying ? (
                              <div className={styles.eq}>
                                <div className={styles.eqBar} />
                                <div className={styles.eqBar} style={{ animationDelay: '.15s' }} />
                                <div className={styles.eqBar} style={{ animationDelay: '.3s' }} />
                              </div>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M8 5.5v13l10.5-6.5z" fill={on ? '#ffffff' : '#24232a'} stroke={on ? '#ffffff' : '#24232a'} strokeWidth="3" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                          <div className={styles.voiceText}>
                            <div className={styles.voiceName}>{v.name}</div>
                            <div className={styles.voiceDesc}>{v.desc}</div>
                          </div>
                          <div className={styles.radio} data-on={on} />
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {step === STUDY_STEP && (
                <>
                  <Heading
                    title={study.done ? 'Your lesson is ready' : 'Studying your notes…'}
                    sub={
                      study.done
                        ? `${name.trim() || 'Your tutor'} turned ${plural(files.length, 'file')} into ${result?.outline.length ?? 0} sections.`
                        : 'This takes a few seconds.'
                    }
                  />
                  <div className={styles.studyTrack}>
                    <div className={styles.studyBar} style={{ width: `${studyBar}%` }} />
                  </div>
                  <div className={styles.studyLines}>
                    {study.lines.map((text, i) => {
                      const done = study.done || i < study.index
                      return (
                        <div key={i} className={styles.studyLine}>
                          {done ? <div className={styles.check}>✓</div> : <div className={styles.spinner} />}
                          <span data-done={done}>{text}</span>
                        </div>
                      )
                    })}
                  </div>
                  {study.done && result && (
                    <div className={styles.outlineBlock}>
                      <div className={styles.label}>Lesson outline</div>
                      <div className={styles.outline}>
                        {result.outline.map((o, i) => (
                          <div key={o.title} className={styles.outlineRow}>
                            <div className={styles.outlineNum}>{i + 1}</div>
                            <div className={styles.outlineTitle}>{o.title}</div>
                            <div className={styles.outlineMins}>{o.mins} min</div>
                          </div>
                        ))}
                      </div>
                      <div className={styles.startWrap}>
                        <div className={styles.startRing} />
                        <Link to={`/tutor/${result.id}`} className={styles.start}>
                          <span className={styles.startIcon}>
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M8 5.5v13l10.5-6.5z" fill="#ffffff" stroke="#ffffff" strokeWidth="3" strokeLinejoin="round" />
                            </svg>
                          </span>
                          Start lesson
                        </Link>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {step < STUDY_STEP && (
              <div className={styles.footer}>
                <button type="button" className={styles.back} onClick={back}>
                  Back
                </button>
                <button type="button" className={styles.next} data-can={canNext} disabled={!canNext} onClick={next}>
                  {step === 3 ? 'Create tutor' : 'Continue'}
                </button>
              </div>
            )}
          </div>

          <div className={styles.preview}>
            <div className={styles.previewFloor} />
            <div className={styles.previewLabel}>Live preview</div>
            <div ref={previewRef} className={styles.previewCanvas}>
              <Canvas
                shadows="soft"
                dpr={[1, RENDER.maxDpr]}
                gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: RENDER.exposure }}
                camera={{ fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far, position: CAMERA.position }}
                onCreated={({ camera }) => camera.lookAt(...CAMERA.lookAt)}
                style={{ pointerEvents: 'none' }}
              >
                <Lights />
                <PreviewTutor loop={loop} flash={flash} look={{ cap, accessory: acc, accColor }} />
              </Canvas>
            </div>
            <div className={styles.tag}>
              <div className={styles.tagName}>{name.trim() || 'Your tutor'}</div>
              <div className={styles.tagSub}>{step >= 3 ? `${voiceOption.name} voice · ${subject}` : subject}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className={styles.heading}>
      <div className={styles.title}>{title}</div>
      <div className={styles.sub}>{sub}</div>
    </div>
  )
}
