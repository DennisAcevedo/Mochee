import { useEffect, type CSSProperties } from 'react'
import { introRef } from '../../intro/targets'
import { selectListening, selectSpeaking, useTutorStore } from '../../state/store'
import styles from './InputBar.module.css'
import { MicButton } from './MicButton'
import { useHub } from '../../hub/hubStore'
import { useDrawers } from '../../state/drawers'

const BAR_HEIGHTS = [8, 14, 10, 16, 9, 13, 7]
// The waveform's pills, left to right: teal, violet, pink, coral, yellow, green, teal.
const BAR_COLORS = ['#49a6b9', '#8b5cf6', '#f472b6', '#f87171', '#f7c623', '#4cc76a', '#49a6b9']

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

// compact: just the mic and the ask box (the lesson's focus mode, with the browser maximized).
export function InputBar({ compact = false }: { compact?: boolean }) {
  const teachBack = useHub((h) => h.view === 'teachBack')
  const learningOpen = useDrawers((d) => d.learningOpen)
  const teaching = teachBack && learningOpen
  const listening = useTutorStore(selectListening)
  const speaking = useTutorStore(selectSpeaking)
  const draft = useTutorStore((s) => s.draft)
  const setDraft = useTutorStore((s) => s.setDraft)
  const sendDraft = useTutorStore((s) => s.sendDraft)
  const startListening = useTutorStore((s) => s.startListening)
  const finishListening = useTutorStore((s) => s.finishListening)

  // Hold Space to talk. Ignored while the text field has focus, and until the
  // intro has handed over (Space starts the lesson on the start screen).
  useEffect(() => {
    const live = () => useTutorStore.getState().phase === 'live' && !teaching
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTypingTarget(e.target) || !live()) return
      e.preventDefault()
      startListening()
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTypingTarget(e.target) || !live()) return
      e.preventDefault()
      finishListening()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [startListening, finishListening, teaching])

  const title = listening ? 'Listening…' : speaking ? 'Tutor is speaking' : 'Tap to talk'
  const showBars = listening || speaking

  // Teach-back owns the mic while its tool is open; don't send the explanation to Q&A.
  if (teaching) return null

  return (
    <div ref={introRef('inputBar')} className={styles.bar} data-compact={compact || undefined}>
      <MicButton />

      <div className={styles.status}>
        <div className={styles.title}>{title}</div>
        {showBars ? (
          <div className={styles.bars}>
            {BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className={styles.barLine}
                data-listening={listening}
                style={
                  {
                    '--c': BAR_COLORS[i % BAR_COLORS.length],
                    height: h + 2,
                    animation: `mBar ${0.7 + (i % 3) * 0.18}s ease-in-out ${i * 0.09}s infinite`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ) : (
          <div className={styles.hint}>
            Hold <span className={styles.key}>Space</span> or tap the mic
          </div>
        )}
      </div>

      <div className={styles.field}>
        <input
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendDraft()
          }}
          placeholder="Ask a question about this lecture…"
        />
        <button type="button" className={styles.send} onClick={sendDraft} aria-label="Send">
          ↑
        </button>
      </div>
    </div>
  )
}
