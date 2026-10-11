import { useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { Group } from 'three'
import { feedback } from '../../data/mockLesson'
import { currentQuestion, useQuickCheck } from '../../lesson/quickCheck'
import { useTutorStore } from '../../state/store'
import { PALETTE } from '../layout3d'
import type { ContentBox } from './WindowContent'
import { damp, Flat, Label } from './primitives'
import { roundedSlab } from './shapes'
import { FONTS, WINDOW_STYLE } from './windowStyle'

// The board's "Quick check" tab: the current question (src/lesson/quickCheck.ts:
// the built-in lesson's, or the document's) with 3D answer buttons that lift
// on hover and call pick(i). Right = lime, wrong = coral, a feedback pill
// below, and "Question n of N" in the corner.

const Q = WINDOW_STYLE.board.quiz
const B = WINDOW_STYLE.board
const C = WINDOW_STYLE.content
const L = WINDOW_STYLE.layer
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

type OptionState = 'idle' | 'right' | 'wrong' | 'dim'

function Option({ index, label, w, state, locked }: { index: number; label: string; w: number; state: OptionState; locked: boolean }) {
  const pick = useTutorStore((s) => s.pick)
  const [hover, setHover] = useState(false)
  const [down, setDown] = useState(false)
  const top = useRef<Group>(null)
  const o = Q.option
  useCursor(hover && !locked)

  useFrame((_, dt) => {
    const g = top.current
    if (!g) return
    const lifted = hover && !locked
    const z = lifted ? (down ? Q.press : Q.hover.lift) : 0
    g.position.z = damp(g.position.z, z, Q.hover.damp, dt)
    g.scale.setScalar(damp(g.scale.x, lifted && !down ? Q.hover.scale : 1, Q.hover.damp, dt))
  })

  const face = state === 'right' ? Q.right : state === 'wrong' ? Q.wrong : o.color
  const text = state === 'right' || state === 'wrong' ? '#ffffff' : PALETTE.ink
  const badge = Q.badgeColors[index % Q.badgeColors.length]
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(true)
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!locked) pick(index)
  }

  return (
    <group
      name={`quiz-option-${index}`}
      onPointerOver={over}
      onPointerOut={() => {
        setHover(false)
        setDown(false)
      }}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      onClick={click}
    >
      {/* Keycap base the face lifts off. */}
      <Flat w={w} h={o.h} r={o.radius} color={state === 'idle' || state === 'dim' ? badge : face} opacity={state === 'dim' ? 0.35 : 1} position={[0, -o.edgeDrop, 0]} />
      <group ref={top}>
        <mesh geometry={roundedSlab(w, o.h, o.radius, o.depth, 0.012)} position={[0, 0, o.depth / 2]}>
          <meshStandardMaterial color={state === 'idle' || state === 'dim' ? badge : face} roughness={0.5} />
        </mesh>
        <Flat w={w} h={o.h} r={o.radius} color={face} opacity={state === 'dim' ? 0.55 : 1} position={[0, 0, o.depth + L]} />
        <mesh position={[-w / 2 + 0.1, 0, o.depth + L * 2]}>
          <circleGeometry args={[o.badge, 24]} />
          <meshBasicMaterial color={state === 'right' || state === 'wrong' ? '#ffffff' : badge} toneMapped={false} />
        </mesh>
        <Label
          size={o.badge * 1.15}
          color={state === 'right' ? Q.right : state === 'wrong' ? Q.wrong : badge === PALETTE.sun ? PALETTE.ink : '#ffffff'}
          anchorX="center"
          position={[-w / 2 + 0.1, 0.002, o.depth + L * 3]}
        >
          {LETTERS[index]}
        </Label>
        <Label
          size={label.length > 34 ? o.size * 0.62 : label.length > 22 ? o.size * 0.78 : o.size}
          color={text}
          anchorX="center"
          textAlign="center"
          maxWidth={w - 0.28}
          lineHeight={1.1}
          position={[0.06, 0, o.depth + L * 3]}
        >
          {label}
        </Label>
      </group>
    </group>
  )
}

// The prompt's first **bold** run is drawn highlighted: [before, bold, after], marks gone.
function splitBold(prompt: string): [string, string, string] {
  const m = /\*\*(.+?)\*\*/.exec(prompt)
  const plain = (t: string) => t.replace(/\*\*/g, '')
  if (!m) return [plain(prompt), '', '']
  return [plain(prompt.slice(0, m.index)), m[1], plain(prompt.slice(m.index + m[0].length))]
}

export function BoardQuiz({ box }: { box: ContentBox }) {
  useTutorStore((s) => s.answer) // re-draw with each pick
  const qc = useQuickCheck()
  const q = currentQuestion(qc)
  const [chip, setChip] = useState<[number, number, number, number] | null>(null) // x0, x1, y0, y1
  const pad = C.pad
  const iw = box.w - pad * 2
  const o = Q.option
  const cols = 2
  const ow = (iw - o.gap) / cols
  const right = qc.result === 'correct'
  const wrong = qc.result === 'wrong'

  const revealed = qc.revealed
  const stateOf = (i: number): OptionState => {
    if (revealed !== null) return i === revealed ? 'right' : i === qc.picked ? 'wrong' : 'dim'
    if (qc.picked === i && qc.result) return right ? 'right' : 'wrong'
    if (qc.picked === i && qc.checking) return 'dim'
    return right ? 'dim' : 'idle'
  }

  // The bold part of the prompt is coloured through troika's colorRanges.
  const [before, bold, after] = q ? splitBold(q.prompt) : [qc.status === 'loading' ? 'Getting your questions ready…' : 'No questions for this one yet.', '', '']
  const full = before + bold + after
  const ranges = { 0: Q.prompt.color, [before.length]: Q.prompt.boldColor, [before.length + bold.length]: Q.prompt.color }
  const measureBold = (mesh: { textRenderInfo?: { caretPositions?: Float32Array } }) => {
    const c = mesh.textRenderInfo?.caretPositions
    if (!c || !bold) {
      if (chip) setChip(null)
      return
    }
    const a = before.length
    // Chip over the bold run's first line (it may wrap; the rest stays coloured).
    let b = a + bold.length - 1
    while (b > a && c[b * 4 + 2] !== c[a * 4 + 2]) b--
    const next: [number, number, number, number] = [c[a * 4], c[b * 4 + 1], c[a * 4 + 2], c[a * 4 + 3]]
    if (!chip || next.some((v, i) => Math.abs(v - chip[i]) > 1e-4)) setChip(next)
  }
  const pp = Q.prompt

  const gridTop = Q.gridTop
  const fb = revealed !== null ? `The answer was ${LETTERS[revealed]}.` : right ? (q?.boardRight ?? feedback.correct) : wrong ? (q?.boardWrong ?? feedback.wrong) : qc.checking ? 'Checking…' : feedback.idle
  const fbColor = revealed !== null || right ? Q.right : wrong ? Q.wrong : null
  const fbY = -(gridTop + o.h * 2 + o.gap + Q.feedback.gap)

  return (
    <group position={[pad, 0, 0]}>
      <Label size={B.kicker.size} color={PALETTE.pink} font={FONTS.monoBold} letterSpacing={0.08} position={[0, -B.rows.kicker, 0]}>
        QUICK CHECK
      </Label>
      <Label size={B.kicker.size} color={B.kicker.color} font={FONTS.mono} letterSpacing={0.06} anchorX="right" position={[iw, -B.rows.kicker, 0]}>
        {q ? `QUESTION ${qc.index + 1} OF ${qc.questions.length}` : ''}
      </Label>
      <group position={[0, -Q.promptTop, 0]}>
        {chip && (
          <Flat
            w={chip[1] - chip[0] + pp.chipPadX * 2}
            h={chip[3] - chip[2] + pp.chipPadY * 2}
            r={pp.chipRadius}
            color={pp.chip}
            position={[(chip[0] + chip[1]) / 2, (chip[2] + chip[3]) / 2, 0]}
          />
        )}
        <Label
          size={full.length > 170 ? pp.size * 0.72 : full.length > 110 ? pp.size * 0.85 : pp.size}
          color={pp.color}
          anchorY="top"
          maxWidth={iw}
          lineHeight={1.3}
          colorRanges={ranges}
          position={[0, 0, L]}
          onSync={measureBold}
        >
          {full}
        </Label>
      </group>

      {(q?.choices ?? []).map((label, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        return (
          <group key={`${q?.id}-${i}`} position={[col * (ow + o.gap) + ow / 2, -(gridTop + row * (o.h + o.gap) + o.h / 2), 0]}>
            <Option index={i} label={label} w={ow} state={stateOf(i)} locked={right || revealed !== null || qc.checking} />
          </group>
        )
      })}

      {!q ? null : fbColor ? (
        <group position={[0, fbY, 0]}>
          <Flat w={iw} h={Q.feedback.h} r={Q.feedback.h / 2} color={fbColor} position={[iw / 2, 0, 0]} />
          <Label size={Q.feedback.size} color="#ffffff" anchorX="center" position={[iw / 2, 0, L]}>
            {fb}
          </Label>
        </group>
      ) : (
        <Label size={Q.feedback.size} color={Q.feedback.idle} font={FONTS.semi} anchorX="center" position={[iw / 2, fbY, 0]}>
          {fb}
        </Label>
      )}
    </group>
  )
}
