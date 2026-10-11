import { useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { Group } from 'three'
import { feedback, quiz, quizBoard } from '../../data/mockLesson'
import { useTutorStore } from '../../state/store'
import { PALETTE } from '../layout3d'
import type { ContentBox } from './WindowContent'
import { damp, Flat, Label } from './primitives'
import { roundedSlab } from './shapes'
import { FONTS, WINDOW_STYLE } from './windowStyle'

// The board's "Quick check" tab: the mock lesson's quiz with four 3D answer
// buttons that lift on hover and call pick(i). Right = lime, wrong = coral,
// and a feedback pill below.

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
        <Label size={o.size} color={text} anchorX="center" position={[0.06, 0, o.depth + L * 3]}>
          {label}
        </Label>
      </group>
    </group>
  )
}

export function BoardQuiz({ box }: { box: ContentBox }) {
  const answer = useTutorStore((s) => s.answer)
  const [chip, setChip] = useState<[number, number, number, number] | null>(null) // x0, x1, y0, y1
  const pad = C.pad
  const iw = box.w - pad * 2
  const o = Q.option
  const cols = 2
  const ow = (iw - o.gap) / cols
  const right = answer === quiz.correctIndex
  const wrong = answer !== null && !right

  const stateOf = (i: number): OptionState => {
    if (answer === i) return i === quiz.correctIndex ? 'right' : 'wrong'
    return right ? 'dim' : 'idle'
  }

  // The bold part of the prompt is coloured through troika's colorRanges.
  const full = quiz.prompt + quiz.bold + quiz.promptTail
  const ranges = { 0: Q.prompt.color, [quiz.prompt.length]: Q.prompt.boldColor, [quiz.prompt.length + quiz.bold.length]: Q.prompt.color }
  const measureBold = (mesh: { textRenderInfo?: { caretPositions?: Float32Array } }) => {
    const c = mesh.textRenderInfo?.caretPositions
    if (!c) return
    const a = quiz.prompt.length
    // Chip over the bold run's first line (it may wrap; the rest stays coloured).
    let b = a + quiz.bold.length - 1
    while (b > a && c[b * 4 + 2] !== c[a * 4 + 2]) b--
    const next: [number, number, number, number] = [c[a * 4], c[b * 4 + 1], c[a * 4 + 2], c[a * 4 + 3]]
    if (!chip || next.some((v, i) => Math.abs(v - chip[i]) > 1e-4)) setChip(next)
  }
  const pp = Q.prompt

  const gridTop = Q.gridTop
  const fb = right ? feedback.correct : wrong ? feedback.wrong : feedback.idle
  const fbColor = right ? Q.right : wrong ? Q.wrong : null
  const fbY = -(gridTop + o.h * 2 + o.gap + Q.feedback.gap)

  return (
    <group position={[pad, 0, 0]}>
      <Label size={B.kicker.size} color={PALETTE.pink} font={FONTS.monoBold} letterSpacing={0.08} position={[0, -B.rows.kicker, 0]}>
        QUICK CHECK
      </Label>
      <Label size={B.kicker.size} color={B.kicker.color} font={FONTS.mono} letterSpacing={0.06} anchorX="right" position={[iw, -B.rows.kicker, 0]}>
        {quizBoard.sectionLabel.toUpperCase()}
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
        <Label size={pp.size} color={pp.color} anchorY="top" maxWidth={iw} lineHeight={1.3} colorRanges={ranges} position={[0, 0, L]} onSync={measureBold}>
          {full}
        </Label>
      </group>

      {quiz.options.map((label, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        return (
          <group key={label + i} position={[col * (ow + o.gap) + ow / 2, -(gridTop + row * (o.h + o.gap) + o.h / 2), 0]}>
            <Option index={i} label={label} w={ow} state={stateOf(i)} locked={right} />
          </group>
        )
      })}

      {fbColor ? (
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
