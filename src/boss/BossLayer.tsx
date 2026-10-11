import { useEffect, useRef, type CSSProperties } from 'react'
import { archetypeFor } from './archetypes'
import { BEAT, GEMINI_SPARK as SPARK, JUICE } from './arena/config'
import { useBoss } from './bossStore'
import { bindFight, fightDom, isFightPhase, useFight } from './fight'
import { useBossMastery } from './mastery'
import { errorText } from '../ui/Drawers/docsClient'
import css from './Boss.module.css'

// One overlay for the whole Beat the Boss flow. Mounted once (LessonPage);
// renders nothing while closed. Picking notes and a topic happens on an opaque
// card; the fight itself is a transparent HUD over the lesson stage, where the
// real Gemini Guy fights a 3D boss (arena/BossArena.tsx, driven by fight.ts).
// Keys: 1-4 pick, Enter continues, Esc closes.

const HEART =
  'M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.1 1.8-1.9 3.3-3.1 5.4-3.1 3.6 0 5.7 3.8 4.2 7.3C19.5 16.4 12 21 12 21z'
const CONFETTI = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#7c5cf2']

// Beat timings as CSS variables, so the HUD lands on the same frames as the arena.
function timingVars(reduced: boolean): CSSProperties {
  const f = reduced ? JUICE.reduced.flash : 1
  return {
    '--t-hit': `${BEAT.hit.impact}ms`,
    '--t-hit-after': `${BEAT.hit.impact + BEAT.hitStop}ms`,
    '--t-miss': `${BEAT.miss.impact}ms`,
    '--t-ko': `${BEAT.hit.impact + BEAT.hitStop + BEAT.koBurst}ms`,
    '--flash-hit': JUICE.flash.hit * f,
    '--flash-miss': JUICE.flash.miss * f,
    '--flash-ko': JUICE.flash.ko * f,
  } as CSSProperties
}

function Spark({ className, fill }: { className: string; fill: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={SPARK} fill={fill} />
    </svg>
  )
}

// Hearts: the one just lost cracks in two and drops at the lunge's impact.
function Hearts({ n, max, crack }: { n: number; max: number; crack: number | null }) {
  return (
    <span className={css.hearts} data-testid="boss-hearts" aria-label={`${n} of ${max} hearts left`} data-hearts={n}>
      {Array.from({ length: max }, (_, i) => {
        const lost = i >= n
        const breaking = lost && i === n && crack !== null
        return (
          <span key={breaking ? `b${crack}` : `h${i}`} className={css.heartBox}>
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" className={breaking ? css.heartEmptyLate : lost ? css.heartEmpty : css.heart}>
              <path d={HEART} fill={lost ? '#e3e0ea' : '#ff6b5b'} />
            </svg>
            {breaking && (
              <>
                <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" className={css.halfL}>
                  <path d={HEART} fill="#ff6b5b" />
                </svg>
                <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" className={css.halfR}>
                  <path d={HEART} fill="#ff6b5b" />
                </svg>
              </>
            )}
          </span>
        )
      })}
    </span>
  )
}

function Confetti() {
  return (
    <div className={css.confetti} aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${6 + ((i * 37) % 88)}%`,
            width: 8 + (i % 3) * 3,
            height: 12 + (i % 4) * 3,
            background: CONFETTI[i % 5],
            animationDuration: `${1.4 + (i % 5) * 0.25}s`,
            animationDelay: `${(i % 7) * 0.08}s`,
          }}
        />
      ))}
    </div>
  )
}

function Picker() {
  const { phase, docs, doc, pickDoc, pickTopic, error } = useBoss()
  const mastered = useBossMastery((s) => s.mastered)
  if (phase === 'loading' || phase === 'loadingQuiz')
    return <p className={css.status} role="status">{phase === 'loading' ? 'Finding your documents…' : 'The boss is reading your notes…'}</p>
  if (phase === 'empty')
    return (
      <div className={css.card}>
        <h2 className={css.cardTitle}>No bosses yet</h2>
        <p className={css.cardText}>Upload a PDF of your notes in the study hub. Every topic in it spawns a boss.</p>
      </div>
    )
  if (phase === 'error')
    return (
      <div className={css.card}>
        <h2 className={css.cardTitle}>The arena is closed</h2>
        <p className={css.cardText}>{errorText(error ?? 'internal')}</p>
        <button type="button" className={css.primary} onClick={() => void useBoss.getState().open(doc?.id)}>
          Try again
        </button>
      </div>
    )
  if (phase === 'pickDoc')
    return (
      <div className={css.card}>
        <h2 className={css.cardTitle}>Pick your notes</h2>
        <div className={css.grid}>
          {docs.map((d) => (
            <button key={d.id} type="button" className={css.pick} data-testid={`boss-doc-${d.id}`} onClick={() => pickDoc(d.id)}>
              <span className={css.pickName}>{d.title}</span>
              <span className={css.pickTag}>
                {d.topics.length} {d.topics.length === 1 ? 'boss' : 'bosses'} · {d.pageCount} pages
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  if (phase !== 'pickTopic' || !doc) return null
  return (
    <div className={css.card}>
      <h2 className={css.cardTitle}>Choose a boss</h2>
      {doc.topics.length === 0 && <p className={css.cardText}>No topics were found in {doc.title} yet.</p>}
      <div className={css.grid}>
        {doc.topics.map((t) => {
          const a = archetypeFor(t)
          return (
            <button
              key={t.id}
              type="button"
              className={css.pick}
              style={{ borderColor: a.body }}
              data-testid={`boss-topic-${t.id}`}
              onClick={() => void pickTopic(t.id)}
            >
              <span className={css.pickName} style={{ color: a.body }}>
                {a.name}
              </span>
              <span className={css.pickTag}>guards {t.title}</span>
              <span className={css.pickMeta}>
                p. {t.firstPage}
                {mastered[t.id] ? ' · mastered' : ''}
              </span>
            </button>
          )
        })}
      </div>
      {useBoss.getState().docs.length > 1 && (
        <button type="button" className={css.secondary} onClick={() => useBoss.setState({ phase: 'pickDoc' })}>
          Other notes
        </button>
      )}
    </div>
  )
}

function Battle() {
  const s = useBoss()
  const beat = useFight((f) => f.beat)
  const revealed = useFight((f) => f.revealed)
  const round = useFight((f) => f.round)
  const reduced = useFight((f) => f.reduced)
  const ready = useFight((f) => f.ready)
  const { topic, phase, queue, hp, maxHp, hearts, picked, result, hitId, lastHit, streak } = s
  if (!topic) return null
  const a = archetypeFor(topic)
  const q = queue[0]
  const done = phase === 'answered' || phase === 'won' || phase === 'lost'
  const shown = phase === 'answered' && !!result && revealed === hitId
  const canNext = phase === 'answered' && hp > 0 && hearts > 0
  const hit = lastHit === 'hit' && done
  const miss = lastHit === 'miss' && done
  const ko = hit && hp === 0
  const pct = maxHp ? `${(100 * hp) / maxHp}%` : '0%'
  const shownHp = hit && revealed !== hitId ? hp + 1 : hp // the count drops once the bolt has landed, with the bar
  const cardDelay = round <= 1 ? BEAT.enter.skid - 260 : 0
  // The cards are never keyed by hit: a remount would skip the HP bar's
  // transitions and replay the slide-in. The class adds the shake (Boss.module.css).
  return (
    <div className={css.battle} style={timingVars(reduced)}>
      {/* HUD cards */}
      <div className={miss ? css.hudShake : css.hud} data-arena-top>
        <span className={css.mono}>YOU + GEMINI GUY</span>
        <Hearts n={hearts} max={3} crack={miss ? hitId : null} />
        <span className={css.streak}>{streak >= 2 ? `Streak ${streak} · keep it going` : 'Answer right to attack'}</span>
      </div>
      <div className={hit ? css.bossHudHit : css.bossHud} data-arena-top>
        <span className={css.bossTitle}>
          <span className={css.bossName}>{a.name}</span>
          <span className={css.bossGuards}>guards {topic.title}</span>
        </span>
        <span
          role="meter"
          aria-label="Boss health"
          aria-valuemin={0}
          aria-valuemax={maxHp}
          aria-valuenow={hp}
          className={css.hp}
          data-testid="boss-hp"
          data-hp={hp}
          style={{ '--segs': Math.max(1, maxHp) } as CSSProperties}
        >
          <span className={css.hpGhost} style={{ width: pct }} />
          <span className={css.hpFill} style={{ width: pct }} />
          <span className={css.hpTicks} />
        </span>
        <span className={css.bossGuards}>
          {shownHp} / {maxHp} HP
        </span>
      </div>

      {/* Over the fighters (positions written by the arena every frame) */}
      {streak >= 2 && phase !== 'won' && phase !== 'lost' && (
        <span key={`c${streak}`} className={lastHit === 'hit' ? css.comboLate : css.combo}>
          x{streak} COMBO
        </span>
      )}
      {hit && (
        <span key={`d${hitId}`} className={css.dmg} aria-hidden="true">
          -1
        </span>
      )}
      {(miss || phase === 'lost') && (
        <div key={`z${hitId}`} className={css.dizzy} aria-hidden="true">
          <Spark className={css.dz1} fill="#fbbc04" />
          <Spark className={css.dz2} fill="#4285f4" />
          <Spark className={css.dz3} fill="#ea4335" />
        </div>
      )}
      {beat && beat.kind !== 'enter' && <div key={`f${beat.id}`} className={beat.kind === 'miss' ? css.flashMiss : beat.kind === 'ko' ? css.flashKo : css.flashHit} aria-hidden="true" />}
      {ko && (
        <span key={`ko${hitId}`} className={css.koBanner} aria-hidden="true">
          K.O.!
        </span>
      )}
      {phase === 'won' && !reduced && <Confetti />}

      {q && phase !== 'won' && phase !== 'lost' && (
        <section
          key={`q${round}`}
          className={css.question}
          data-arena-bottom
          aria-labelledby="boss-q"
          data-question-id={q.id}
          style={{ '--card-delay': `${cardDelay}ms` } as CSSProperties}
        >
          <span className={css.mono}>
            ROUND {Math.max(1, Math.min(maxHp, maxHp - queue.length + 1))} · PAGE {q.page}
          </span>
          <h2 id="boss-q" className={css.qText}>
            {q.prompt}
          </h2>
          <div className={css.choices}>
            {q.choices.map((c, i) => {
              const right = done && result?.correctChoice === i
              const wrong = done && picked === i && result?.correctChoice !== i
              const cls = right ? css.optRight : wrong ? css.optWrong : done ? css.optDim : phase === 'checking' && picked === i ? css.optPicked : css.opt
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  style={{ '--i': i } as CSSProperties}
                  data-testid={`boss-choice-${i}`}
                  aria-pressed={picked === i}
                  disabled={phase !== 'ask' || !ready}
                  onClick={() => void s.answer(i)}
                >
                  <span className={css.key}>{i + 1}</span>
                  {c}
                </button>
              )
            })}
          </div>
          {phase === 'checking' && <p className={css.status} role="status">Checking…</p>}
          {s.error && phase === 'ask' && <p className={css.status} role="status">{errorText(s.error)}</p>}
          {shown && result && (
            <div role="status" className={result.correct ? css.feedbackHit : css.feedbackMiss} data-testid="boss-result" data-correct={result.correct}>
              <span className={css.feedbackText}>
                <strong>{result.correct ? (hp === 0 ? 'Knockout! ' : 'Hit! ') : 'The boss strikes back. '}</strong>
                {result.explanation}
                {result.citation?.quote ? <em className={css.quote}> “{result.citation.quote}”</em> : null}
              </span>
              <span className={css.page}>p. {result.citation?.page ?? q.page}</span>
              {canNext && (
                <button type="button" className={css.nextBtn} data-testid="boss-next" disabled={!ready} onClick={s.next}>
                  Next round
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {phase === 'won' && (
        <section className={css.endWon} data-testid="boss-won" data-arena-bottom>
          <span className={css.endTagWon}>BOSS BEATEN</span>
          <h2 className={css.endTitle}>{a.name} is down!</h2>
          <span className={css.cardText}>{topic.title} mastered · +50 XP</span>
          <span className={css.row}>
            <button type="button" className={css.primary} data-testid="boss-next" onClick={s.backToTopics}>
              Next boss
            </button>
            <button type="button" className={css.secondary} onClick={s.close}>
              Back to tools
            </button>
          </span>
        </section>
      )}
      {phase === 'lost' && (
        <section className={css.endLost} data-testid="boss-lost" data-arena-bottom>
          <span className={css.endTagLost}>OUT OF HEARTS</span>
          <h2 className={css.endTitle}>{a.name} held on</h2>
          <span className={css.cardText}>Review page {topic.firstPage} with him, then try again. The boss keeps the damage you dealt.</span>
          <span className={css.row}>
            <button type="button" className={css.primary} data-testid="boss-next" disabled={!ready} onClick={s.retry}>
              Try again
            </button>
            <button type="button" className={css.secondary} onClick={s.backToTopics}>
              Pick another boss
            </button>
          </span>
        </section>
      )}
    </div>
  )
}

export function BossLayer({ tutorId }: { tutorId?: string } = {}) {
  useEffect(() => {
    if (tutorId) useBoss.getState().setTutor(tutorId)
  }, [tutorId])
  // Leaving the page ends any fight, so the next lesson page does not open on one.
  useEffect(() => {
    const unbind = bindFight()
    return () => {
      unbind()
      useBoss.getState().close()
    }
  }, [])
  const phase = useBoss((s) => s.phase)
  const doc = useBoss((s) => s.doc)
  const topic = useBoss((s) => s.topic)
  const ref = useRef<HTMLDivElement>(null)
  const open = phase !== 'closed'
  const fighting = isFightPhase(phase)

  // The arena writes the fighters' screen positions onto the HUD root.
  useEffect(() => {
    fightDom.hud = fighting ? ref.current : null
    return () => {
      if (fightDom.hud === ref.current) fightDom.hud = null
    }
  }, [fighting])

  // Focus moves into the overlay on open and back where it was on close.
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => before?.focus?.()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // The boss is modal: keys never reach the drawer's Tab trap, the walkthrough arrows or push-to-talk behind it.
      e.stopImmediatePropagation()
      const s = useBoss.getState()
      if (e.key === 'Escape') {
        e.preventDefault()
        s.close()
        return
      }
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        if (f.length === 0) return e.preventDefault()
        const first = f[0]
        const last = f[f.length - 1]
        const at = document.activeElement
        if (e.shiftKey && (at === first || !ref.current.contains(at))) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (at === last || !ref.current.contains(at))) {
          e.preventDefault()
          first.focus()
        }
        return
      }
      // Answers and moving on wait until the beat has played out and he is on his feet.
      const ready = useFight.getState().ready
      if (s.phase === 'ask' && /^[1-4]$/.test(e.key)) {
        const i = Number(e.key) - 1
        if (ready && s.queue[0] && i < s.queue[0].choices.length) {
          e.preventDefault()
          void s.answer(i)
        }
        return
      }
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        if (s.phase === 'answered' && ready && useFight.getState().revealed === s.hitId) s.next()
        else if (s.phase === 'lost' && ready) s.retry()
        else if (s.phase === 'won') s.backToTopics()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  return (
    <>
      {fighting && (
        <div className={css.backdrop} aria-hidden="true">
          <Spark className={css.tw1} fill="#4285f4" />
          <Spark className={css.tw2} fill="#fbbc04" />
          <Spark className={css.tw3} fill="#ea4335" />
        </div>
      )}
      <div
        ref={ref}
        className={fighting ? css.fightLayer : css.layer}
        role="dialog"
        aria-modal="true"
        aria-label="Beat the Boss"
        tabIndex={-1}
        data-testid="boss-layer"
        data-phase={phase}
      >
        <header className={css.header}>
          <span className={css.badge}>Beat the Boss</span>
          <h1 className={css.title}>{doc?.title ?? 'Pick your notes'}</h1>
          <span className={css.flex} />
          {topic && <span className={css.fightTag}>Boss fight · {topic.title}</span>}
          <button type="button" className={css.close} data-testid="boss-close" aria-label="Close boss fight" onClick={() => useBoss.getState().close()}>
            ×
          </button>
        </header>
        {fighting ? (
          <Battle />
        ) : (
          <main className={css.main}>
            <Spark className={css.tw1} fill="#4285f4" />
            <Spark className={css.tw2} fill="#fbbc04" />
            <Spark className={css.tw3} fill="#ea4335" />
            <Picker />
          </main>
        )}
      </div>
    </>
  )
}
