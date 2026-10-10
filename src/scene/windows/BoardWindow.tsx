import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DoubleSide, type Mesh } from 'three'
import { lectureBoard } from '../../data/mockLesson'
import { BOARD_PARTS, boardShows, type BoardPart } from '../../data/stageContent'
import { useDirector } from '../../state/director'
import { useTutorStore, type Mode } from '../../state/store'
import { PALETTE } from '../layout3d'
import { BoardQuiz } from './BoardQuiz'
import { BrowserWindow3D, type ContentBox, type WindowTab } from './BrowserWindow3D'
import { damp, Flat, Label, usePop } from './primitives'
import { ellipseStroke } from './shapes'
import { FONTS, ON_ACCENT, WINDOW_STYLE } from './windowStyle'

// The right window: the board. Its two tabs are the tutor store's mode
// ('Board · FCFS' = lecture, 'Quick check' = quiz); a click calls setMode.
// The lecture board draws its parts in BOARD_PARTS order as
// director.boardReveal grows, each popping in on a spring.

const B = WINDOW_STYLE.board
const C = WINDOW_STYLE.content
const L = WINDOW_STYLE.layer
const MODES: Mode[] = ['lecture', 'quiz']
const TABS: WindowTab[] = [
  { title: 'Board · FCFS', color: PALETTE.teal },
  { title: 'Quick check', color: PALETTE.pink },
]
const URLS: Record<Mode, string> = { lecture: 'board/02-first-come-first-served', quiz: 'board/05-quick-check' }

// One revealable part; scales in from its own origin.
function Part({ part, reveal, position, children }: { part: BoardPart; reveal: number; position: [number, number, number]; children: ReactNode }) {
  const ref = usePop(boardShows(part, reveal), B.pop.stiffness, B.pop.damping)
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  )
}

// '17 ms' with a coral ring drawn on around it once it is revealed.
function CircledResult({ text, on }: { text: string; on: boolean }) {
  const r = B.result
  const [size, setSize] = useState<[number, number]>([0.5, r.size])
  const ring = useRef<Mesh>(null)
  const p = useRef(0)
  const rx = size[0] / 2 + r.ring.padX
  const ry = size[1] / 2 + r.ring.padY
  const geo = ellipseStroke(rx, ry, r.ring.stroke, r.ring.segments, r.ring.sweep, r.ring.spiral)

  useFrame((_, dt) => {
    p.current = on ? damp(p.current, 1, r.ring.damp, dt) : 0
    const m = ring.current
    if (m) m.geometry.setDrawRange(0, Math.round(r.ring.segments * p.current) * 6)
  })

  return (
    <group>
      <Label
        size={r.size}
        color={r.color}
        font={FONTS.hand}
        anchorX="center"
        position={[0, 0, L]}
        onSync={(mesh) => {
          const b = mesh.textRenderInfo?.blockBounds
          if (b && Math.abs(b[2] - b[0] - size[0]) > 1e-3) setSize([b[2] - b[0], b[3] - b[1]])
        }}
      >
        {text}
      </Label>
      <mesh ref={ring} geometry={geo} rotation={[0, 0, r.ring.tilt]} position={[0, 0, L]}>
        <meshBasicMaterial color={r.ring.color} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}

function LectureBoard({ box, reveal }: { box: ContentBox; reveal: number }) {
  const pad = C.pad
  const iw = box.w - pad * 2
  const rows = B.rows
  const g = B.gantt
  const total = lectureBoard.gantt.reduce((n, s) => n + s.flex, 0)

  // Segment geometry + the tick positions (0, 24, 27, 30) from the data.
  let acc = 0
  const segs = lectureBoard.gantt.map((s, i) => {
    const x = (acc / total) * iw
    acc += s.flex
    return { ...s, x, w: (s.flex / total) * iw, color: g.colors[i % g.colors.length], i }
  })
  const ticks = [0, ...segs.map((_, i) => segs.slice(0, i + 1).reduce((n, t) => n + t.flex, 0))]
  const last = segs.length - 1

  const seg = (s: (typeof segs)[number], originX: number) => {
    const w = s.w - (s.i < last ? g.gap : 0)
    const radii: [number, number, number, number] = [s.i === 0 ? g.radius : 0, s.i === last ? g.radius : 0, s.i === last ? g.radius : 0, s.i === 0 ? g.radius : 0]
    return (
      <group key={s.label} position={[s.x - originX + w / 2, 0, 0]}>
        <Flat w={w} h={g.h} r={radii} color={PALETTE[s.color]} />
        <Label size={g.label} color={ON_ACCENT[s.color]} anchorX="center" position={[0, 0, L]}>
          {s.label}
        </Label>
      </group>
    )
  }
  const p2 = segs[1]?.x ?? iw

  const f = B.footnote
  const dashes = Math.floor(iw / (f.dash.w + f.dash.gap))
  return (
    <group position={[pad, 0, 0]}>
      <Part part="heading" reveal={reveal} position={[0, -rows.kicker, 0]}>
        <Label size={B.kicker.size} color={B.kicker.color} font={FONTS.monoBold} letterSpacing={0.08}>
          BOARD
        </Label>
        <Label size={B.kicker.size} color={B.kicker.color} font={FONTS.mono} letterSpacing={0.06} anchorX="right" position={[iw, 0, 0]}>
          {lectureBoard.sectionLabel.toUpperCase()}
        </Label>
        <Label size={B.heading.size} color={B.heading.color} font={FONTS.hand} anchorY="top" maxWidth={iw} position={[0, rows.kicker - rows.heading, 0]}>
          {lectureBoard.heading}
        </Label>
      </Part>

      <Part part="p1" reveal={reveal} position={[0, -rows.gantt - g.h / 2, 0]}>
        {segs.slice(0, 1).map((s) => seg(s, 0))}
      </Part>
      <Part part="p2p3" reveal={reveal} position={[p2, -rows.gantt - g.h / 2, L]}>
        {segs.slice(1).map((s) => seg(s, p2))}
      </Part>

      <Part part="ticks" reveal={reveal} position={[0, -rows.ticks, 0]}>
        {ticks.map((t, i) => {
          const x = (t / total) * iw
          return (
            <group key={t} position={[x, 0, 0]}>
              <Flat w={B.ticks.w} h={B.ticks.h} color={B.ticks.color} position={[0, B.ticks.h / 2, 0]} />
              <Label size={B.ticks.size} color={B.ticks.color} font={FONTS.monoBold} anchorX={i === 0 ? 'left' : i === ticks.length - 1 ? 'right' : 'center'} anchorY="top" position={[0, -0.02, 0]}>
                {String(t)}
              </Label>
            </group>
          )
        })}
      </Part>

      <Part part="working" reveal={reveal} position={[0, -rows.working, 0]}>
        <Label size={B.working.size} color={B.working.color} font={FONTS.hand} anchorY="top">
          {lectureBoard.workingLine}
        </Label>
      </Part>

      <Part part="result" reveal={reveal} position={[B.result.indent, -rows.result - B.result.size / 2, 0]}>
        <Label size={B.result.size} color={B.result.color} font={FONTS.hand} anchorX="right" position={[-0.06, 0, 0]}>
          =
        </Label>
        <group position={[0.36, 0, 0]}>
          <CircledResult text={lectureBoard.result} on={boardShows('result', reveal)} />
        </group>
      </Part>

      <Part part="footnote" reveal={reveal} position={[0, -rows.footnote, 0]}>
        {Array.from({ length: dashes }, (_, i) => (
          <Flat key={i} w={f.dash.w} h={f.dash.h} color={f.dash.color} position={[i * (f.dash.w + f.dash.gap) + f.dash.w / 2, 0, 0]} />
        ))}
        <Label size={f.size} color={f.color} font={FONTS.semi} anchorY="top" maxWidth={iw} lineHeight={1.3} position={[0, -0.05, 0]}>
          {lectureBoard.footnote}
        </Label>
      </Part>
    </group>
  )
}

export function BoardWindow() {
  const mode = useTutorStore((s) => s.mode)
  const setMode = useTutorStore((s) => s.setMode)
  const reveal = useDirector((s) => s.boardReveal)
  const active = MODES.indexOf(mode)

  // Reload replays the lecture board's reveal from empty back to where it was.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const replay = () => {
    const { boardReveal, setBoardReveal } = useDirector.getState()
    const end = Math.min(boardReveal, BOARD_PARTS.length)
    clearTimeout(timer.current)
    let n = 0
    setBoardReveal(0)
    const step = () => {
      n++
      setBoardReveal(n >= end ? boardReveal : n)
      if (n < end) timer.current = setTimeout(step, B.replayStepMs)
    }
    timer.current = setTimeout(step, B.replayStepMs)
  }

  return (
    <BrowserWindow3D id="board" tabs={TABS} active={active} onTab={(i) => setMode(MODES[i])} url={WINDOW_STYLE.urlHost + URLS[mode]} contentBg={C.boardBg} onReload={mode === 'lecture' ? replay : undefined}>
      {(box) => (mode === 'quiz' ? <BoardQuiz box={box} /> : <LectureBoard box={box} reveal={reveal} />)}
    </BrowserWindow3D>
  )
}
